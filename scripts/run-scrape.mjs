#!/usr/bin/env node
/**
 * run-scrape.mjs — TeeDrop scraper (runs on Chester, the mini PC)
 *
 * Booking systems:
 *   - chronogolf: fetch API (session cookie per course, affiliationTypeId optional)
 *   - golfnow:    POST API (works from Chester, blocked on Vercel)
 *   - cps:        Playwright browser automation (React SPA, no public API)
 *
 * Setup:
 *   npm install playwright
 *   npx playwright install chromium
 *
 * Env vars:
 *   INGEST_URL    — defaults to production Vercel URL
 *   INGEST_SECRET — defaults to 'teedrop-ingest-2026'
 *   HEADLESS      — set to 'false' to see the browser (debug mode)
 */

import { randomUUID } from 'crypto';
import { COURSES } from '../lib/courses.js';

// Load .env.local if present (Chester doesn't run through Next.js)
try {
  const { readFileSync } = await import('fs');
  const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
  for (const line of env.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] ??= m[2].trim();
  }
} catch { /* no .env.local — use shell env */ }

const INGEST_URL = process.env.INGEST_URL || 'https://web-xi-one-0b1g412w29.vercel.app/api/ingest';
const INGEST_SECRET = process.env.INGEST_SECRET || 'teedrop-ingest-2026';
const DAYS_AHEAD = 14;
const CONCURRENCY = 3;
const HEADLESS = process.env.HEADLESS !== 'false';
const CPS_EMAIL    = process.env.CPS_EMAIL    || null;
const CPS_PASSWORD = process.env.CPS_PASSWORD || null;

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ── Helpers ───────────────────────────────────────────────────────────────────

function getDateRange(days) {
  return Array.from({ length: days }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return d.toISOString().split('T')[0];
  });
}

function formatTime(timeStr) {
  if (!timeStr) return '';
  timeStr = String(timeStr).trim();
  if (timeStr.includes('AM') || timeStr.includes('PM')) return timeStr;
  if (timeStr.includes('T')) {
    const d = new Date(timeStr);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }
  const [h, m] = timeStr.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return '';
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function formatChronogolfTime(t) {
  if (!t) return '';
  if (t.includes('T')) {
    return new Date(t).toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Los_Angeles',
    });
  }
  return formatTime(t);
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function withConcurrency(items, limit, fn) {
  const results = [];
  for (let i = 0; i < items.length; i += limit) {
    const batch = items.slice(i, i + limit);
    results.push(...await Promise.all(batch.map(fn)));
  }
  return results;
}

// ── Ingest POST ───────────────────────────────────────────────────────────────

async function ingest(teeTimes) {
  if (!teeTimes.length) return;
  const url = `${INGEST_URL}${INGEST_URL.includes('?') ? '&' : '?'}secret=${INGEST_SECRET}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teeTimes }),
      signal: AbortSignal.timeout(25000),
    });
    const data = await res.json();
    process.stdout.write(`  → ingest ${res.status}: ${data.inserted ?? '?'} saved, ${data.newForAlerts ?? 0} new\n`);
  } catch (err) {
    process.stdout.write(`  → ingest error: ${err.message}\n`);
  }
}

// ── Chronogolf ────────────────────────────────────────────────────────────────

async function getChronogolfCookie(slug) {
  try {
    const res = await fetch(`https://www.chronogolf.com/club/${slug}`, {
      headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml' },
      signal: AbortSignal.timeout(8000),
    });
    const raw = res.headers.get('set-cookie') || '';
    return raw.split(',').map(c => c.split(';')[0]).join('; ');
  } catch {
    return '';
  }
}

async function scrapeChronogolfDate(course, date, cookie) {
  // affiliationTypeId is optional — omit the param if not set (returns all public times)
  const affParam = course.affiliationTypeId ? `&affiliation_type_ids=${course.affiliationTypeId}` : '';
  const url = `https://www.chronogolf.com/marketplace/clubs/${course.chronogolfSlug}/teetimes`
    + `?date=${date}&nb_holes=18${affParam}`;

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        'Accept': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        'Cookie': cookie,
        'Referer': `https://www.chronogolf.com/club/${course.chronogolfSlug}`,
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      process.stdout.write(`  ${date}: HTTP ${res.status}\n`);
      return [];
    }

    const data = await res.json();
    const slots = data?.teetimes || data?.slots || (Array.isArray(data) ? data : []);

    const teeTimes = slots
      .filter(s => s.start_time || s.time)
      .map(s => ({
        course: course.name,
        date,
        time: formatChronogolfTime(s.start_time || s.time),
        players: s.available_spots || s.spots || 4,
        price: s.green_fee ? `$${parseFloat(s.green_fee).toFixed(2)}` : 'N/A',
        holes: s.nb_holes || course.holes || 18,
        bookingUrl: `${course.bookingUrl}#date=${date}`,
        source: 'chronogolf',
      }))
      .filter(tt => tt.time);

    process.stdout.write(`  ${date}: ${teeTimes.length} times\n`);
    return teeTimes;
  } catch (err) {
    process.stdout.write(`  ${date}: error — ${err.message}\n`);
    return [];
  }
}

async function scrapeChronogolf(course, dates) {
  process.stdout.write(`\n[${course.name}] Chronogolf${course.affiliationTypeId ? '' : ' (no affiliation ID — trying without)'}\n`);

  const teeTimes = [];
  let cookie = await getChronogolfCookie(course.chronogolfSlug);
  let consecutiveErrors = 0;

  for (const date of dates) {
    // Re-fetch cookie every 5 dates to avoid Cloudflare session expiry
    if (teeTimes.length > 0 && dates.indexOf(date) % 5 === 0) {
      cookie = await getChronogolfCookie(course.chronogolfSlug);
      await delay(1500);
    }

    const results = await scrapeChronogolfDate(course, date, cookie);

    if (results.length === 0) {
      consecutiveErrors++;
      // Back off if we're getting blocked
      if (consecutiveErrors >= 3) {
        await delay(3000);
        consecutiveErrors = 0;
      } else {
        await delay(1200);
      }
    } else {
      consecutiveErrors = 0;
      await ingest(results);
      teeTimes.push(...results);
      await delay(1200);
    }
  }
  return teeTimes;
}

// ── GolfNow ───────────────────────────────────────────────────────────────────

const GN_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function toGolfNowDate(isoDate) {
  // "2026-04-12" → "Apr 12 2026" — manual to avoid timezone shift from new Date(isoStr)
  const [year, mon, day] = isoDate.split('-').map(Number);
  return `${GN_MONTHS[mon - 1]} ${day} ${year}`;
}

async function getGolfNowCookies(facilityId) {
  try {
    const res = await fetch(`https://www.golfnow.com/tee-times/facility/${facilityId}/search`, {
      headers: { 'User-Agent': UA, 'Accept': 'text/html', 'Connection': 'keep-alive' },
      signal: AbortSignal.timeout(10000),
    });
    const raw = res.headers.get('set-cookie') || '';
    return raw.split(/,(?=[^ ])/).map(c => c.split(';')[0].trim()).filter(Boolean).join('; ');
  } catch {
    return '';
  }
}

async function scrapeGolfNow(course, dates) {
  process.stdout.write(`\n[${course.name}] GolfNow (ID: ${course.golfnowId})\n`);

  const cookie = await getGolfNowCookies(course.golfnowId);
  const teeTimes = [];

  for (const date of dates) {
    try {
      const gnDate = toGolfNowDate(date);
      const res = await fetch('https://www.golfnow.com/api/tee-times/tee-time-search-results', {
        method: 'POST',
        headers: {
          'User-Agent': UA,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Referer': `https://www.golfnow.com/tee-times/facility/${course.golfnowId}/search`,
          'Origin': 'https://www.golfnow.com',
          'Cookie': cookie,
        },
        body: JSON.stringify({
          useWidgetNextAvailableDays: null,
          nextAvailableTeeTime: null,
          tags: null,
          address: null,
          pageSize: 50,
          teeTimeCount: 50,
          pageNumber: 0,
          date: gnDate,
          sortBy: 'Date',
          sortByRollup: 'Date.MinDate',
          sortDirection: 0,
          hotDealsOnly: false,
          golfPassPerksOnly: false,
          bestDealsOnly: false,
          promotedCampaignsOnly: false,
          priceMin: 0,
          priceMax: 10000,
          players: 1,
          timePeriod: 'Any',
          timeMin: 0,
          timeMax: 47,
          holes: '18',
          facilityType: 'GolfCourse',
          latitude: null,
          longitude: null,
          radius: 35,
          maxAllowedRadius: null,
          facilityId: parseInt(course.golfnowId),
          facilityIds: [],
          marketId: null,
          marketName: null,
          searchType: 'Facility',
          view: 'Grouping',
          nonGPS: null,
          excludeFeaturedFacilities: true,
          excludePrivateFacilities: false,
          rateTagCodes: null,
          customerToken: null,
          rateType: 'all',
          currentClientDate: new Date().toISOString(),
          daysToSearch: null,
          facilityTagsExclusive: null,
          isSimulator: null,
          isHotDealsZoneMoreDeals: null,
          facilityGroupId: null,
          trackmanOnly: false,
        }),
        signal: AbortSignal.timeout(12000),
      });

      if (!res.ok) {
        process.stdout.write(`  ${date}: HTTP ${res.status}\n`);
        await delay(500);
        continue;
      }

      const data = await res.json();
      const list = data?.ttResults?.teeTimes || data?.results || [];

      const batch = list
        .map(tt => {
          // Time is an object: { formatted: '6:22', formattedTimeMeridian: 'AM', date: ISO }
          const timeObj = tt.time;
          const timeStr = timeObj?.formatted
            ? `${timeObj.formatted} ${timeObj.formattedTimeMeridian}`
            : (timeObj?.date || tt.Time || tt.startTime || '');

          // Price: displayRate object has formattedValue2 like "$36.00"
          const priceVal = tt.displayRate?.formattedValue2
            || tt.minTeeTimeRate?.formattedValue2
            || tt.teeTimeRates?.[0]?.singlePlayerPrice?.greensFees?.formattedValue2
            || '';

          return {
            course: course.name,
            date,
            time: formatTime(timeStr),
            players: 4, // GolfNow playerRule is "Any" — always default 4
            price: priceVal || 'N/A',
            holes: tt.teeTimeRates?.[0]?.holeCount || course.holes || 18,
            bookingUrl: tt.detailUrl
              ? `https://www.golfnow.com${tt.detailUrl}`
              : `${course.bookingUrl}#date=${date}`,
            source: 'golfnow',
          };
        })
        .filter(tt => tt.time);

      process.stdout.write(`  ${date}: ${batch.length} times\n`);
      if (batch.length > 0) {
        teeTimes.push(...batch);
        await ingest(batch);
      }
    } catch (err) {
      process.stdout.write(`  ${date}: error — ${err.message}\n`);
    }
    await delay(400);
  }
  return teeTimes;
}

// ── CPS (Premier Golf) — js1 password grant + TeeTimes REST API ──────────────
//
// Auth:    POST /identityapi/connect/token (grant_type=password, js1/v4secret)
// Pre-req: POST /RegisterTransactionId before each TeeTimes call
// Search:  GET  /TeeTimes?searchDate=Thu+Apr+09+2026&courseIds=3,4,2,6,11,5&...
//
// Confirmed from live browser capture 2026-04-09:
//   - Endpoint: TeeTimes (NOT GetAvailableTimeSheet, NOT SearchTeetimes)
//   - Date format: Date.toDateString() e.g. "Thu Apr 09 2026"
//   - x-moduleid must be "7" (not "1")
//   - One call returns all courses — no per-course loop needed
//
// Requires CPS_EMAIL and CPS_PASSWORD env vars. Skips cleanly if missing.

// Confirmed courseIds from GetAllOptions (captured 2026-04-09)
const CPS_COURSES = {
  'Jackson Park Golf Course':    { id: 3,  holes: 18 },
  'Jefferson Park Golf Course':  { id: 4,  holes: 18 },
  'West Seattle Golf Course':    { id: 2,  holes: 18 },
  'Interbay Golf Center':        { id: 6,  holes: 9  },
  'Legion Memorial Golf Course': { id: 11, holes: 18 },
  'Bellevue Golf Course':        { id: 5,  holes: 18 },
};
const CPS_ID_TO_NAME = Object.fromEntries(
  Object.entries(CPS_COURSES).map(([name, { id }]) => [id, name])
);
const CPS_ALL_IDS = Object.values(CPS_COURSES).map(c => c.id).join(',');
const CPS_API = 'https://premiergolf.cps.golf/onlineres/onlineapi/api/v1/onlinereservation';

let cpsToken = null;
let cpsTokenExpiry = 0;

async function getCpsToken() {
  if (cpsToken && Date.now() < cpsTokenExpiry - 60_000) return cpsToken;

  const res = await fetch('https://premiergolf.cps.golf/identityapi/connect/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
    body: new URLSearchParams({
      grant_type: 'password',
      scope: 'openid profile onlinereservation sale inventory sh customer email recommend references',
      username: CPS_EMAIL,
      password: CPS_PASSWORD,
      client_id: 'js1',
      client_secret: 'v4secret',
    }),
    signal: AbortSignal.timeout(15000),
  });

  const json = await res.json();
  if (!json.access_token) throw new Error(`CPS auth failed: ${JSON.stringify(json)}`);

  cpsToken = json.access_token;
  cpsTokenExpiry = Date.now() + (json.expires_in ?? 3600) * 1000;
  console.log(`  [CPS] Token OK (expires in ${json.expires_in}s)`);
  return cpsToken;
}

function buildCpsHeaders(token) {
  return {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/json',
    'User-Agent': UA,
    'client-id': 'onlineresweb',
    'x-terminalid': '3',
    'x-requestid': randomUUID(),
    'x-websiteid': 'fbe1de5b-8700-4db9-d7d2-08da3ce0bbaa',
    'x-ismobile': 'false',
    'x-productid': '1',
    'x-componentid': '1',
    'x-siteid': '1',
    'x-timezone-offset': String(new Date().getTimezoneOffset()),
    'x-timezoneid': 'America/Los_Angeles',
    'x-moduleid': '7',
  };
}

// CPS expects "Thu Apr 09 2026" — use local date parts to avoid UTC shift
function toCpsDate(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d).toDateString();
}

function extractCpsPrice(slot) {
  const rate = slot.defaultBookingRate;
  if (!rate) return 'N/A';
  if (rate.price != null) return `$${Number(rate.price).toFixed(2)}`;
  if (rate.greensFee != null) return `$${Number(rate.greensFee).toFixed(2)}`;
  if (rate.amount != null) return `$${Number(rate.amount).toFixed(2)}`;
  return 'N/A';
}

async function scrapeCpsAll(dates) {
  if (!CPS_EMAIL || !CPS_PASSWORD) {
    console.log('[CPS] Skipping — CPS_EMAIL / CPS_PASSWORD not set');
    return [];
  }

  console.log('\n[CPS] Starting — all courses, pure HTTP (no browser)');
  let token;
  try {
    token = await getCpsToken();
  } catch (err) {
    console.error(`[CPS] Auth failed: ${err.message}`);
    return [];
  }

  const allResults = [];

  for (const date of dates) {
    const transactionId = randomUUID();

    // Register transaction (required before TeeTimes)
    try {
      await fetch(`${CPS_API}/RegisterTransactionId`, {
        method: 'POST',
        headers: { ...buildCpsHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId }),
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      // Non-fatal — continue anyway
    }

    // Refresh token if needed
    try {
      token = await getCpsToken();
    } catch (err) {
      console.error(`  [CPS] Token refresh failed: ${err.message}`);
      break;
    }

    // Query all courses for this date in one call
    const params = new URLSearchParams({
      searchDate: toCpsDate(date),
      holes: '0',
      numberOfPlayer: '0',
      courseIds: CPS_ALL_IDS,
      searchTimeType: '0',
      transactionId,
      teeOffTimeMin: '0',
      teeOffTimeMax: '23',
      isChangeTeeOffTime: 'true',
      teeSheetSearchView: '5',
      classCode: 'R',
      defaultOnlineRate: 'N',
      isUseCapacityPricing: 'false',
      memberStoreId: '1',
      searchType: '1',
    });

    try {
      const res = await fetch(`${CPS_API}/TeeTimes?${params}`, {
        headers: buildCpsHeaders(token),
        signal: AbortSignal.timeout(15000),
      });

      if (res.status === 401) {
        console.log('  [CPS] 401 — forcing token refresh');
        cpsToken = null;
        token = await getCpsToken();
        continue;
      }

      if (!res.ok) {
        process.stdout.write(`  [CPS] ${date}: HTTP ${res.status}\n`);
        await delay(500);
        continue;
      }

      const json = await res.json();
      if (!json.isSuccess || !Array.isArray(json.content)) {
        process.stdout.write(`  [CPS] ${date}: isSuccess=${json.isSuccess}, no content array\n`);
        continue;
      }

      const batch = [];
      for (const slot of json.content) {
        const courseName = CPS_ID_TO_NAME[slot.courseId];
        if (!courseName) continue;

        const course = COURSES.find(c => c.name === courseName);
        if (!course) continue;

        const time = formatTime(slot.startTime);
        if (!time) continue;

        // Available spots = max participants minus already-booked
        const booked = Array.isArray(slot.bookingList) ? slot.bookingList.length : 0;
        const available = (slot.participants ?? 4) - booked;

        batch.push({
          course: courseName,
          date,
          time,
          players: available > 0 ? available : (slot.participants ?? 4),
          price: extractCpsPrice(slot),
          holes: slot.is18HoleOnly ? 18 : (CPS_COURSES[courseName]?.holes ?? 18),
          bookingUrl: `${course.bookingUrl}?date=${date}`,
          source: 'cps',
        });
      }

      process.stdout.write(`  [CPS] ${date}: ${batch.length} times\n`);
      if (batch.length > 0) {
        await ingest(batch);
        allResults.push(...batch);
      }
    } catch (err) {
      process.stdout.write(`  [CPS] ${date}: error — ${err.message.split('\n')[0]}\n`);
    }

    await delay(400);
  }

  return allResults;
}

// ── Routing ───────────────────────────────────────────────────────────────────

async function processCourse(course, dates) {
  if (course.bookingSystem === 'chronogolf') return scrapeChronogolf(course, dates);
  if (course.bookingSystem === 'golfnow') return scrapeGolfNow(course, dates);
  process.stdout.write(`\n[${course.name}] Unknown booking system: ${course.bookingSystem}\n`);
  return [];
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const dates = getDateRange(DAYS_AHEAD);
  const start = Date.now();

  const chronogolfCourses = COURSES.filter(c => c.bookingSystem === 'chronogolf');
  const golfnowCourses = COURSES.filter(c => c.bookingSystem === 'golfnow');
  const cpsCourses = COURSES.filter(c => c.bookingSystem === 'cps');

  console.log(`TeeDrop scraper — ${dates.length} days ahead`);
  console.log(`Courses: ${chronogolfCourses.length} Chronogolf, ${golfnowCourses.length} GolfNow, ${cpsCourses.length} CPS`);
  console.log(`CPS credentials: ${CPS_EMAIL ? 'SET' : 'NOT SET'}`);
  console.log(`Ingest: ${INGEST_URL}\n`);

  let total = 0;

  // GolfNow — parallel (different domain)
  await withConcurrency(golfnowCourses, CONCURRENCY, async course => {
    const found = await processCourse(course, dates);
    total += found.length;
  });

  // Chronogolf — sequential (same domain, avoid Cloudflare rate limits)
  for (const course of chronogolfCourses) {
    const found = await processCourse(course, dates);
    total += found.length;
    await delay(2000);
  }

  // CPS — single HTTP-only pass covering all 6 courses × all dates
  if (cpsCourses.length > 0) {
    const found = await scrapeCpsAll(dates);
    total += found.length;
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n✓ Done in ${elapsed}s — ${total} tee times found`);
}

main().catch(e => { console.error(e); process.exit(1); });
