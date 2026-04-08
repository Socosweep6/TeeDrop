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

// ── CPS (Premier Golf) — OAuth + API via Playwright browser ──────────────────
//
// Auth: grant_type=password OAuth to get a bearer token.
// Course IDs: GetAllOptions API, intercepted from Angular's own requests.
// Tee times: GetAvailableTimeSheet API, called in-browser to inherit cookies.
//
// Requires CPS_EMAIL and CPS_PASSWORD env vars. Skips cleanly if missing.
// client_id/client_secret are public constants baked into the Angular app.

let cpsToken = null;
let cpsCourseIdMap = {};
let cpsComponentId = null;
let cpsAngularHeaders = null;
let cpsPage = null;
let cpsInitialized = false;

async function initCps(browser) {
  if (cpsInitialized) return;

  if (!CPS_EMAIL || !CPS_PASSWORD) {
    console.log('  [CPS] Skipping — CPS_EMAIL / CPS_PASSWORD not set');
    cpsInitialized = true;
    return;
  }

  // Step 1: OAuth token
  console.log(`  [CPS] OAuth login as ${CPS_EMAIL}...`);
  try {
    const tokenRes = await fetch(
      'https://premiergolf.cps.golf/identityapi/connect/token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'password',
          username: CPS_EMAIL,
          password: CPS_PASSWORD,
          client_id: 'js1',
          client_secret: 'v4secret',
          scope: 'onlinereservation references',
        }),
        signal: AbortSignal.timeout(15000),
      }
    );
    const tokenJson = await tokenRes.json();
    if (!tokenJson.access_token) {
      throw new Error(`Token error: ${JSON.stringify(tokenJson)}`);
    }
    cpsToken = tokenJson.access_token;
    try {
      const payload = JSON.parse(Buffer.from(cpsToken.split('.')[1], 'base64url').toString());
      cpsComponentId = payload.component_id ? String(payload.component_id) : null;
      console.log(`  [CPS] Token OK. component_id=${cpsComponentId}`);
    } catch {
      console.log('  [CPS] Token OK (could not decode JWT)');
    }
  } catch (err) {
    console.error(`  [CPS] OAuth failed: ${err.message}`);
    cpsInitialized = true;
    return;
  }

  // Step 2: Browser session — intercept Angular's own GetAllOptions call to
  // capture the real componentid header and build the course ID map.
  try {
    const context = await browser.newContext({
      userAgent: UA,
      viewport: { width: 1280, height: 900 },
    });
    cpsPage = await context.newPage();

    const headersReady = new Promise((resolve) => {
      cpsPage.on('request', req => {
        if (req.url().includes('GetAllOptions')) {
          const headers = req.headers();
          cpsAngularHeaders = headers;
          const cidKey = Object.keys(headers).find(k => k.toLowerCase().includes('componentid'));
          if (cidKey) {
            cpsComponentId = headers[cidKey];
            console.log(`  [CPS] componentid captured: ${cpsComponentId}`);
          }
          resolve(headers);
        }
      });
      cpsPage.on('response', async resp => {
        if (resp.url().includes('GetAllOptions') && resp.status() === 200) {
          try { buildCpsCourseMap(await resp.json()); } catch {}
        }
      });
    });

    await cpsPage.goto(
      'https://premiergolf.cps.golf/reserve/jackson-park-golf-course',
      { waitUntil: 'networkidle', timeout: 30000 }
    );
    await Promise.race([headersReady, delay(5000)]);
    console.log(`  [CPS] Browser at: ${cpsPage.url().slice(0, 80)}`);
  } catch (err) {
    console.error(`  [CPS] Browser setup error: ${err.message}`);
    cpsPage = null;
  }

  // Step 3: If Angular didn't fire GetAllOptions, try a direct call
  if (Object.keys(cpsCourseIdMap).length === 0) {
    console.log('  [CPS] No courses from Angular — trying direct GetAllOptions');
    await fetchCpsAllOptions();
  }

  cpsInitialized = true;
  console.log(`  [CPS] Ready. Token: ${cpsToken ? 'YES' : 'NO'} | Courses: ${Object.keys(cpsCourseIdMap).length} | Browser: ${cpsPage ? 'YES' : 'NO'}`);
}

async function fetchCpsAllOptions() {
  const url = 'https://premiergolf.cps.golf/onlineres/onlineapi/api/v1/onlinereservation/GetAllOptions/premiergolf?version=25.4.2&product=3';
  try {
    if (cpsPage) {
      const result = await cpsPage.evaluate(
        async ({ url, userToken, componentId }) => {
          const hdrs = { 'Accept': 'application/json', 'Authorization': `Bearer ${userToken}` };
          if (componentId) hdrs['componentid'] = componentId;
          const r = await fetch(url, { headers: hdrs }).catch(e => ({ ok: false, status: 0, text: () => e.message }));
          const t = typeof r.text === 'function' ? await r.text() : (r.statusText || '');
          return { status: r.status, text: t };
        },
        { url, userToken: cpsToken, componentId: cpsComponentId }
      );
      if (result.status === 200) {
        buildCpsCourseMap(JSON.parse(result.text));
        console.log(`  [CPS] GetAllOptions OK (in-browser): ${Object.keys(cpsCourseIdMap).length} courses`);
        return;
      }
      console.log(`  [CPS] GetAllOptions HTTP ${result.status} — ${result.text.slice(0, 100)}`);
    } else {
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${cpsToken}`, 'Accept': 'application/json' },
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        buildCpsCourseMap(await res.json());
        console.log(`  [CPS] GetAllOptions OK (direct): ${Object.keys(cpsCourseIdMap).length} courses`);
      } else {
        console.log(`  [CPS] GetAllOptions HTTP ${res.status} (direct)`);
      }
    }
  } catch (err) {
    console.warn(`  [CPS] GetAllOptions error: ${err.message}`);
  }
}

function buildCpsCourseMap(options) {
  const walk = (obj) => {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) { obj.forEach(walk); return; }
    if (obj.courseId != null && (obj.name || obj.courseName || obj.siteName)) {
      const rawName = (obj.name || obj.courseName || obj.siteName || '').toLowerCase().trim();
      cpsCourseIdMap[`__name:${rawName}`] = obj.courseId;
    }
    Object.values(obj).forEach(walk);
  };
  walk(options);
}

function getCpsCourseId(cpsSlug) {
  const tokens = cpsSlug
    .replace(/-golf-course$|-golf-center$|-golf$/, '')
    .split('-')
    .filter(t => t.length > 2);
  for (const [key, id] of Object.entries(cpsCourseIdMap)) {
    const name = key.replace('__name:', '');
    if (tokens.every(t => name.includes(t))) return id;
    if (tokens[0] && name.startsWith(tokens[0])) return id;
  }
  return null;
}

function extractCpsTeeTimesFromJson(json) {
  const candidates = [
    json.tee_times, json.teeTimes, json.times, json.data,
    json.availableTimes, json.available_times, json.slots,
    json.timeSheet, json.TimeSheet, json.teeSheet, json.TeeSheet,
    Array.isArray(json) ? json : null,
  ].filter(Boolean);

  for (const arr of candidates) {
    if (!Array.isArray(arr) || arr.length === 0) continue;
    const first = arr[0];
    const timeField = ['time', 'start_time', 'teeTime', 'TeeTime', 'startTime', 'StartTime', 'teeTimeFrom']
      .find(f => first[f] != null);
    if (!timeField) continue;
    return arr.map(slot => ({
      time: formatTime(slot[timeField]),
      players: slot.available_spots ?? slot.availableSpots ?? slot.maxPlayers ?? slot.MaxPlayers ?? 4,
      price: slot.price != null
        ? (typeof slot.price === 'string' ? slot.price : `$${(slot.price / 100).toFixed(2)}`)
        : null,
      holes: slot.holes ?? slot.nb_holes ?? slot.HoleCount ?? 18,
    }));
  }
  return [];
}

async function scrapeCPS(course, dates) {
  if (!cpsToken) {
    process.stdout.write(`  [CPS] No token — skipping\n`);
    return [];
  }
  const courseId = getCpsCourseId(course.cpsSlug);
  if (!courseId) {
    process.stdout.write(`  [CPS] No courseId for ${course.cpsSlug} — skipping\n`);
    return [];
  }
  process.stdout.write(`  [CPS] courseId=${courseId} for ${course.cpsSlug}\n`);

  const holeCount = course.holes === 9 ? 9 : 18;
  const results = [];

  for (const date of dates) {
    const [y, m, d] = date.split('-');
    const bookingDate = `${m}/${d}/${y}`;
    const base = 'https://premiergolf.cps.golf/onlineres/onlineapi/api/v1/onlinereservation';
    const qs = `courseId=${courseId}&bookingDate=${encodeURIComponent(bookingDate)}&holeCount=${holeCount}&players=1&numberOfGuests=0`;
    const url = `${base}/GetAvailableTimeSheet/premiergolf?${qs}&product=3`;

    try {
      let status, text;

      if (cpsPage) {
        const result = await cpsPage.evaluate(
          async ({ url, token, angularHeaders }) => {
            try {
              const hdrs = angularHeaders ? { ...angularHeaders } : {};
              hdrs['authorization'] = `Bearer ${token}`;
              hdrs['accept'] = 'application/json';
              const res = await fetch(url, { headers: hdrs });
              return { status: res.status, text: await res.text() };
            } catch (e) {
              return { status: 0, text: e.message };
            }
          },
          { url, token: cpsToken, angularHeaders: cpsAngularHeaders }
        );
        status = result.status;
        text = result.text;
      } else {
        const res = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${cpsToken}`,
            'x-componentid': cpsComponentId || '1',
            'Accept': 'application/json',
          },
          signal: AbortSignal.timeout(10000),
        });
        status = res.status;
        text = await res.text();
      }

      if (status === 401) {
        process.stdout.write(`  [CPS] 401 — token expired\n`);
        cpsToken = null;
        break;
      }
      if (status !== 200) {
        process.stdout.write(`  ${date}: HTTP ${status} — ${text.slice(0, 80)}\n`);
        continue;
      }

      const times = extractCpsTeeTimesFromJson(JSON.parse(text));
      const batch = times.map(t => ({
        course: course.name,
        date,
        time: t.time,
        players: t.players,
        price: t.price || 'N/A',
        holes: t.holes || course.holes || 18,
        bookingUrl: `${course.bookingUrl}?date=${date}`,
        source: 'cps',
      })).filter(t => t.time);

      process.stdout.write(`  ${date}: ${batch.length} times\n`);
      if (batch.length > 0) {
        await ingest(batch);
        results.push(...batch);
      }
    } catch (err) {
      process.stdout.write(`  ${date}: error — ${err.message.split('\n')[0]}\n`);
    }
    await delay(500);
  }
  return results;
}

// ── Routing ───────────────────────────────────────────────────────────────────

async function processCourse(course, dates) {
  if (course.bookingSystem === 'chronogolf') return scrapeChronogolf(course, dates);
  if (course.bookingSystem === 'golfnow') return scrapeGolfNow(course, dates);
  if (course.bookingSystem === 'cps') return scrapeCPS(course, dates);
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

  // CPS — init browser once, share across all courses
  let cpsBrowser = null;
  if (cpsCourses.length > 0) {
    if (!CPS_EMAIL || !CPS_PASSWORD) {
      console.log('[CPS] Skipping all CPS courses — CPS_EMAIL / CPS_PASSWORD not set\n');
    } else {
      try {
        const { chromium } = await import('playwright');
        cpsBrowser = await chromium.launch({
          headless: HEADLESS,
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
        console.log('Initializing CPS...');
        await initCps(cpsBrowser);
        console.log('');
      } catch (err) {
        console.log(`[CPS] Playwright not available — skipping CPS courses: ${err.message}\n`);
      }
    }
  }

  try {
    for (const course of cpsCourses) {
      process.stdout.write(`\n[${course.name}] CPS/API\n`);
      const found = await scrapeCPS(course, dates);
      total += found.length;
      await delay(500);
    }
  } finally {
    if (cpsPage) await cpsPage.context().close().catch(() => {});
    if (cpsBrowser) await cpsBrowser.close().catch(() => {});
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n✓ Done in ${elapsed}s — ${total} tee times found`);
}

main().catch(e => { console.error(e); process.exit(1); });
