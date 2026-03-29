/**
 * TeeDrop Cloud Scraper — Playwright Edition
 *
 * Uses Playwright (headless Chromium) for:
 *   - CPS (Club Prophet Systems / premiergolf.cps.golf) — Seattle city courses
 *   - Chronogolf — Oki Golf network, Chambers Bay
 *
 * GolfNow courses are skipped until GOLFNOW_API_KEY is set.
 *
 * Run: node .github/scripts/scraper.mjs
 */

import { chromium } from 'playwright';

const INGEST_URL    = process.env.INGEST_URL;
const INGEST_SECRET = process.env.INGEST_SECRET || 'teedrop-ingest-2026';
const GOLFNOW_API_KEY = process.env.GOLFNOW_API_KEY || null;

if (!INGEST_URL) {
  console.error('ERROR: INGEST_URL environment variable is required');
  process.exit(1);
}

// ── Course list ───────────────────────────────────────────────────────────────

const COURSES = [
  // CPS (Club Prophet Systems) — Seattle Parks Golf + Bellevue + Everett
  { name: 'Jackson Park Golf Course',      bookingSystem: 'cps', cpsSlug: 'jackson-park-golf-course' },
  { name: 'Jefferson Park Golf Course',    bookingSystem: 'cps', cpsSlug: 'jefferson-park-golf-course' },
  { name: 'West Seattle Golf Course',      bookingSystem: 'cps', cpsSlug: 'west-seattle-golf-course' },
  { name: 'Interbay Golf Center',          bookingSystem: 'cps', cpsSlug: 'interbay-golf-center', holes: 9 },
  { name: 'Legion Memorial Golf Course',   bookingSystem: 'cps', cpsSlug: 'legion-memorial-golf-course' },
  { name: 'Bellevue Golf Course',          bookingSystem: 'cps', cpsSlug: 'bellevue-golf-course' },

  // Chronogolf — Oki Golf network + Chambers Bay
  { name: 'Golf Club at Newcastle',        bookingSystem: 'chronogolf', chronogolfSlug: 'golf-club-at-newcastle' },
  { name: 'Harbour Pointe Golf Club',      bookingSystem: 'chronogolf', chronogolfSlug: 'harbour-pointe-golf-club' },
  { name: 'Washington National Golf Club', bookingSystem: 'chronogolf', chronogolfSlug: 'washington-national-golf-club' },
  { name: 'Redmond Ridge Golf Course',     bookingSystem: 'chronogolf', chronogolfSlug: 'redmond-ridge-golf-course' },
  { name: 'Trophy Lake Golf & Casting',    bookingSystem: 'chronogolf', chronogolfSlug: 'trophy-lake-golf-casting' },
  { name: 'Chambers Bay',                  bookingSystem: 'chronogolf', chronogolfSlug: 'chambers-bay-golf-club' },

  // GolfNow — activated when GOLFNOW_API_KEY is set
  { name: 'Walter E. Hall Memorial Golf Course', bookingSystem: 'golfnow', golfnowId: '4726' },
  { name: 'Battle Creek Golf Course',            bookingSystem: 'golfnow', golfnowId: '1679' },
  { name: 'Willows Run Golf Complex',            bookingSystem: 'golfnow', golfnowId: '7422' },
  { name: 'Snoqualmie Falls Golf Course',        bookingSystem: 'golfnow', golfnowId: '5555' },
  { name: 'Tall Chief Golf Course',              bookingSystem: 'golfnow', golfnowId: '7093' },
  { name: 'Foster Golf Links',                   bookingSystem: 'golfnow', golfnowId: '4153' },
  { name: 'Riverbend Golf Complex',              bookingSystem: 'golfnow', golfnowId: '4154' },
  { name: 'Maplewood Golf Course',               bookingSystem: 'golfnow', golfnowId: '6607' },
  { name: 'Auburn Golf Course',                  bookingSystem: 'golfnow', golfnowId: '1244' },
  { name: 'Druids Glen Golf Course',             bookingSystem: 'golfnow', golfnowId: '19498' },
  { name: 'Madrona Links Golf Course',           bookingSystem: 'golfnow', golfnowId: '4908' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function getDateRange(days = 10) {
  const dates = [];
  const today = new Date();
  for (let i = 1; i <= days; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// Convert "HH:MM" (24h) → "H:MM AM/PM"
function to12Hour(raw) {
  if (!raw) return null;
  if (/^\d{1,2}:\d{2}$/.test(raw)) {
    const [h, m] = raw.split(':').map(Number);
    const suffix = h >= 12 ? 'PM' : 'AM';
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
  }
  return raw;
}

// ── CPS Scraper ───────────────────────────────────────────────────────────────
//
// Strategy: bypass email gate entirely.
// 1. Load ONE CPS page (no email submission) to capture anonymous OAuth token
//    and GetAllOptions response (contains all courseIds).
// 2. Make direct HTTP calls to tee time API using the bearer token.
//    The email gate is frontend-only — the API doesn't enforce it.

let cpsAccessToken = null;    // anonymous bearer token
let cpsAllOptions = null;     // raw GetAllOptions response
let cpsCourseIdMap = {};      // cpsSlug → courseId (built from GetAllOptions)
let cpsInitDone = false;

// Hardcoded courseId map as fallback (populated after first successful run)
// Format: cpsSlug → courseId
// These will be discovered via logging on first run
const CPS_KNOWN_COURSE_IDS = {
  // Will be populated once we see the GetAllOptions response in logs
};

async function initCpsSession(browser) {
  if (cpsInitDone) return;

  console.log('  [CPS] Initializing — loading page to capture token...');
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();

  page.on('response', async (response) => {
    const url = response.url();
    const ct = response.headers()['content-type'] || '';
    if (!ct.includes('json')) return;
    try {
      const json = await response.json();

      // Capture anonymous OAuth token
      if (url.includes('token/short') && json.access_token) {
        cpsAccessToken = json.access_token;
        console.log('  [CPS] Anonymous token captured');
      }

      // Capture GetAllOptions — contains courseId list for this tenant
      if (url.includes('GetAllOptions')) {
        cpsAllOptions = json;
        buildCpsCourseIdMap(json);
        // Log full structure to understand courseId mapping
        console.log(`  [CPS] GetAllOptions (${url.split('/').pop()}):`, JSON.stringify(json).slice(0, 1000));
      }

      // Log ALL other API calls to discover tee sheet endpoint
      const skip = url.includes('version.json') || url.includes('i18n') ||
                   url.includes('openid') || url.includes('jwks') ||
                   url.includes('FavIcon') || url.includes('SiteLanguages') ||
                   url.includes('token/short') || url.includes('GetAllOptions');
      if (!skip) {
        const path = url.replace('https://premiergolf.cps.golf', '').split('?')[0];
        console.log(`  [CPS API] ${path} → ${JSON.stringify(json).slice(0, 150)}`);
      }
    } catch { /* ignore */ }
  });

  try {
    // Load first course page — just to trigger token/short and GetAllOptions
    // Do NOT submit email gate — just let the page load naturally
    await page.goto('https://premiergolf.cps.golf/reserve/jackson-park-golf-course',
      { waitUntil: 'networkidle', timeout: 30000 });
    await sleep(3000); // extra wait to ensure all init API calls complete
  } catch (err) {
    console.warn(`  [CPS] Init page load error: ${err.message}`);
  } finally {
    await context.close();
  }

  cpsInitDone = true;
  console.log(`  [CPS] Init done. Token: ${cpsAccessToken ? 'YES' : 'NO'} | CourseIds: ${Object.keys(cpsCourseIdMap).length}`);
}

function buildCpsCourseIdMap(options) {
  // GetAllOptions has various shapes — try to find courseId + name pairs
  const tryExtract = (obj) => {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) {
      obj.forEach(tryExtract);
      return;
    }
    // Look for objects with courseId and name/courseName
    if (obj.courseId && (obj.name || obj.courseName || obj.description)) {
      const name = (obj.name || obj.courseName || obj.description || '').toLowerCase();
      const id = obj.courseId;
      // Map name → id
      cpsCourseIdMap[`__name:${name}`] = id;
    }
    // Also look for siteId as an alternative
    if (obj.siteId && (obj.name || obj.siteName)) {
      const name = (obj.name || obj.siteName || '').toLowerCase();
      cpsCourseIdMap[`__site:${name}`] = obj.siteId;
    }
    Object.values(obj).forEach(v => {
      if (v && typeof v === 'object') tryExtract(v);
    });
  };
  tryExtract(options);
}

function getCpsCourseId(cpsSlug) {
  // Try hardcoded map first
  if (CPS_KNOWN_COURSE_IDS[cpsSlug]) return CPS_KNOWN_COURSE_IDS[cpsSlug];

  // Try matching by slug-derived name fragments
  const slugWords = cpsSlug.replace(/-golf-course$/, '').replace(/-golf-center$/, '').replace(/-/g, ' ');
  for (const [key, id] of Object.entries(cpsCourseIdMap)) {
    const name = key.replace('__name:', '').replace('__site:', '');
    if (name.includes(slugWords) || slugWords.includes(name.split(' ')[0])) {
      return id;
    }
  }
  return null;
}

// CPS tee sheet API endpoints to try (in order)
const CPS_TEESHEET_ENDPOINTS = [
  'GetAvailableTimeSheet',
  'GetAvailableTeeTimesByDate',
  'GetAvailableTeeTimes',
  'GetTeeSheet',
  'AvailableTeeTimes',
  'TeeSheet',
];

async function fetchCpsTeeTimesApi(courseId, date, holeCount = 18) {
  if (!cpsAccessToken) return null; // no token, skip

  const [y, m, d] = date.split('-');
  const bookingDate = encodeURIComponent(`${m}/${d}/${y}`);

  for (const endpoint of CPS_TEESHEET_ENDPOINTS) {
    const url = `https://premiergolf.cps.golf/onlineres/onlineapi/api/v1/onlinereservation/${endpoint}?tenantAlias=premiergolf&courseId=${courseId}&bookingDate=${bookingDate}&holeCount=${holeCount}&players=1&numberOfGuests=0`;
    try {
      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${cpsAccessToken}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      });
      const text = await res.text();
      if (res.status === 404) continue; // wrong endpoint name
      console.log(`  [CPS] ${endpoint}(courseId=${courseId}, ${date}) → ${res.status}: ${text.slice(0, 200)}`);
      if (res.ok) {
        try {
          const json = JSON.parse(text);
          const times = extractCpsTeeTimesFromJson(json);
          return times; // return even if empty — endpoint found
        } catch {
          return []; // valid endpoint, unparseable response
        }
      }
      // Non-404, non-200: log and continue trying
    } catch (err) {
      console.warn(`  [CPS] ${endpoint} fetch error: ${err.message}`);
    }
  }

  // All endpoints returned 404 — log for debugging
  console.log(`  [CPS] All endpoints 404 for courseId=${courseId}. CourseIdMap keys: ${Object.keys(cpsCourseIdMap).slice(0,10).join(', ')}`);
  return null;
}

async function scrapeCps(course, dates, browser) {
  // Initialize session once (captures token + courseIds)
  await initCpsSession(browser);

  const courseId = getCpsCourseId(course.cpsSlug);
  console.log(`  CourseId for ${course.cpsSlug}: ${courseId ?? 'UNKNOWN'}`);

  if (!courseId) {
    console.log(`  [CPS] Cannot scrape — no courseId. Check GetAllOptions log above.`);
    // Log all known IDs to help debug
    console.log(`  [CPS] Known IDs: ${JSON.stringify(cpsCourseIdMap).slice(0, 300)}`);
    return [];
  }

  const results = [];
  const holeCount = course.holes === 9 ? 9 : 18;

  for (const date of dates) {
    try {
      const times = await fetchCpsTeeTimesApi(courseId, date, holeCount);
      if (times === null) {
        console.log(`  ${date}: API not reachable`);
        break; // No point trying more dates if all endpoints fail
      }
      if (times.length > 0) {
        results.push(...times.map(t => ({ ...t, course: course.name, date, source: 'cps' })));
        console.log(`  ${date}: ${times.length} tee times`);
      } else {
        console.log(`  ${date}: 0 tee times`);
      }
    } catch (err) {
      console.warn(`  ${date}: ${err.message}`);
    }
    await sleep(200); // be polite
  }

  return results;
}

function extractCpsTeeTimesFromJson(json) {
  // Common CPS JSON shapes — check various field names
  const candidates = [
    json.tee_times, json.teeTimes, json.times, json.data,
    json.availableTimes, json.available_times, json.slots,
    json.timeSheet, json.TimeSheet, json.teeSheet,
    Array.isArray(json) ? json : null,
  ].filter(Boolean);

  for (const arr of candidates) {
    if (!Array.isArray(arr) || arr.length === 0) continue;
    const first = arr[0];
    // Check for common time field names
    if (first.time || first.start_time || first.teeTime || first.TeeTime ||
        first.startTime || first.StartTime || first.teeTimeFrom) {
      return arr.map(slot => ({
        time: to12Hour(
          slot.time || slot.start_time || slot.teeTime || slot.TeeTime ||
          slot.startTime || slot.StartTime || slot.teeTimeFrom
        ),
        players: slot.available_spots || slot.availableSpots || slot.players ||
                 slot.maxPlayers || slot.MaxPlayers || 4,
        price: slot.price != null
          ? (typeof slot.price === 'string' ? slot.price : `$${(slot.price / 100).toFixed(2)}`)
          : null,
        holes: slot.holes || slot.nb_holes || slot.HoleCount || 18,
        booking_url: slot.booking_url || slot.bookingUrl || null,
      }));
    }
  }
  return [];
}

// ── Chronogolf Scraper (Playwright) ──────────────────────────────────────────
//
// Chronogolf pages (https://www.chronogolf.com/club/{slug}) are React SPAs.
// We intercept ALL JSON network responses to discover the internal tee sheet API.

async function scrapeChronogolfWithPlaywright(course, dates, browser) {
  const results = [];
  const baseUrl = `https://www.chronogolf.com/club/${course.chronogolfSlug}`;
  console.log(`  Opening ${baseUrl}`);

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });
  const page = await context.newPage();

  // Intercept ALL JSON responses — log everything to discover tee sheet API
  const interceptedByDate = new Map();
  let foundApiPattern = null;

  page.on('response', async (response) => {
    const resUrl = response.url();
    const ct = response.headers()['content-type'] || '';
    if (!ct.includes('json')) return;

    try {
      const json = await response.json();

      // Try to extract tee times from any response
      const times = extractChronogolfTeeTimes(json);
      if (times.length > 0) {
        const date = extractDateFromUrl(resUrl) || extractDateFromJson(json);
        console.log(`  [CHRONO] Tee times found! ${resUrl.slice(0, 100)} → ${times.length} times`);
        if (date) interceptedByDate.set(date, times);
        interceptedByDate.set('__latest__', { date, times });
        foundApiPattern = resUrl;
        return;
      }

      // Log all API calls to understand the API shape
      const skip = resUrl.includes('google') || resUrl.includes('facebook') ||
                   resUrl.includes('analytics') || resUrl.includes('hotjar') ||
                   resUrl.includes('.css') || resUrl.includes('font') ||
                   resUrl.includes('stripe') || resUrl.includes('intercom') ||
                   resUrl.includes('segment.io') || resUrl.includes('sentry');
      if (!skip) {
        const shortUrl = resUrl.replace('https://', '').slice(0, 100);
        const preview = JSON.stringify(json).slice(0, 150);
        console.log(`  [CHRONO API] ${shortUrl} → ${preview}`);
      }
    } catch { /* ignore */ }
  });

  try {
    const resp = await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const status = resp?.status();
    console.log(`  HTTP ${status}`);

    if (status === 403 || status === 404) {
      console.log(`  Slug not found: ${course.chronogolfSlug}`);
      await context.close();
      return results;
    }

    // Wait for initial page load
    await sleep(3000);

    // First date — navigate using URL param
    const firstDate = dates[0];
    await page.goto(`${baseUrl}?date=${firstDate}`, { waitUntil: 'networkidle', timeout: 20000 });
    await sleep(2000);

    // Check if we found a tee time API pattern on first load
    if (interceptedByDate.has('__latest__')) {
      const { date, times } = interceptedByDate.get('__latest__');
      if (times.length > 0 && date) {
        results.push(...times.map(t => ({ ...t, course: course.name, date, source: 'chronogolf' })));
        console.log(`  ${date}: ${times.length} tee times (API)`);
      }
    }

    // Navigate remaining dates using the date picker (avoid full page reloads)
    for (const date of dates.slice(1)) {
      try {
        interceptedByDate.delete('__latest__');

        // Try the date input/picker
        const dateInput = await page.$('input[type="date"], input[placeholder*="date" i], [data-testid*="date"]');
        if (dateInput) {
          await dateInput.click({ clickCount: 3 });
          await dateInput.fill(date);
          await dateInput.press('Enter');
          await sleep(2000);
        } else {
          // Navigate by URL
          await page.goto(`${baseUrl}?date=${date}`, { waitUntil: 'networkidle', timeout: 20000 });
          await sleep(2000);
        }

        if (interceptedByDate.has('__latest__')) {
          const { times } = interceptedByDate.get('__latest__');
          results.push(...times.map(t => ({ ...t, course: course.name, date, source: 'chronogolf' })));
          console.log(`  ${date}: ${times.length} tee times`);
        } else {
          console.log(`  ${date}: 0 tee times`);
        }
      } catch (err) {
        console.warn(`  ${date} error: ${err.message}`);
      }
    }

    if (results.length === 0) {
      // Log current page URL and title for debugging
      const title = await page.title().catch(() => 'N/A');
      const url = page.url();
      console.log(`  [DEBUG] Final URL: ${url}`);
      console.log(`  [DEBUG] Page title: ${title}`);

      // Log visible text elements that might indicate error/auth state
      const text = await page.evaluate(() => {
        const els = Array.from(document.querySelectorAll('h1,h2,h3,p,[class*="error"],[class*="message"],[class*="sign"],[class*="login"]'));
        return els.slice(0, 5).map(e => e.textContent?.trim().slice(0, 80)).filter(Boolean).join(' | ');
      }).catch(() => '');
      if (text) console.log(`  [DEBUG] Page content: ${text}`);
    }

  } catch (err) {
    console.error(`  Failed to load ${baseUrl}: ${err.message}`);
  } finally {
    await context.close();
  }

  return results;
}

function extractChronogolfTeeTimes(json) {
  // Chronogolf API shapes — check various structures
  const candidates = [
    json.tee_times, json.teeTimes, json.available_tee_times,
    json.data?.tee_times, json.data?.teeTimes, json.data,
    json.result?.tee_times, json.results,
    Array.isArray(json) ? json : null,
  ].filter(Boolean);

  for (const arr of candidates) {
    if (!Array.isArray(arr) || arr.length === 0) continue;
    const first = arr[0];
    if (first.time || first.start_time || first.tee_time || first.startTime ||
        first.teeTime || first.start || first.booking_time) {
      return arr.map(slot => ({
        time: to12Hour(
          slot.time || slot.start_time || slot.tee_time ||
          slot.startTime || slot.teeTime || slot.start || slot.booking_time
        ),
        players: slot.max_players || slot.nb_players || slot.players ||
                 slot.maxPlayers || slot.available_spots || 4,
        price: slot.price != null
          ? (typeof slot.price === 'number' && slot.price > 100
              ? `$${(slot.price / 100).toFixed(2)}` // price in cents
              : `$${Number(slot.price).toFixed(2)}`)
          : null,
        holes: slot.nb_holes || slot.holes || slot.holeCount || 18,
        booking_url: slot.booking_url || slot.url || slot.link || null,
      }));
    }
  }
  return [];
}

function extractDateFromUrl(url) {
  const match = url.match(/[?&]date=(\d{4}-\d{2}-\d{2})/) ||
                url.match(/[?&]booking_date=(\d{4}-\d{2}-\d{2})/) ||
                url.match(/[?&]BookingDate=(\d{1,2}%2F\d{1,2}%2F\d{4})/) ||
                url.match(/\/(\d{4}-\d{2}-\d{2})/);
  if (!match) return null;
  let d = match[1];
  if (d.includes('%2F')) {
    const [m, day, y] = decodeURIComponent(d).split('/');
    d = `${y}-${String(m).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  }
  return d;
}

function extractDateFromJson(json) {
  const d = json.date || json.booking_date || json.selected_date ||
            json.data?.date || json.bookingDate;
  if (d && /\d{4}-\d{2}-\d{2}/.test(String(d))) return String(d).match(/\d{4}-\d{2}-\d{2}/)[0];
  return null;
}

// ── GolfNow Scraper (HTTP — no Playwright needed) ─────────────────────────────

async function scrapeGolfNow(course, dates) {
  if (!GOLFNOW_API_KEY) {
    console.log(`  [SKIP] No GOLFNOW_API_KEY`);
    return [];
  }
  const results = [];
  for (const date of dates) {
    try {
      const url = `https://api.golfnow.com/v1/tee-times/search?facilityId=${course.golfnowId}&date=${date}&players=1&time=all`;
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${GOLFNOW_API_KEY}`, 'Accept': 'application/json' },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) { console.warn(`  GolfNow ${date}: HTTP ${res.status}`); continue; }
      const json = await res.json();
      const slots = json.tee_times || json.teeTimes || json.results || [];
      for (const s of slots) {
        results.push({
          course: course.name, date,
          time: s.time || s.start_time,
          players: s.max_players || 4,
          price: s.price ? `$${s.price.toFixed(2)}` : null,
          holes: s.holes || 18,
          booking_url: s.booking_url || `https://www.golfnow.com/tee-times/facility/${course.golfnowId}#date=${date}`,
          source: 'golfnow',
        });
      }
    } catch (err) { console.warn(`  GolfNow ${date}: ${err.message}`); }
    await sleep(300);
  }
  return results;
}

// ── POST to /api/ingest ───────────────────────────────────────────────────────

async function postToIngest(teeTimes) {
  if (teeTimes.length === 0) return { inserted: 0, skipped: 0, alertsSent: 0 };
  const url = `${INGEST_URL}?secret=${encodeURIComponent(INGEST_SECRET)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ teeTimes }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Ingest HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const dates = getDateRange(10);
  console.log(`TeeDrop Scraper (Playwright) — ${new Date().toISOString()}`);
  console.log(`Courses: ${COURSES.length} | Dates: ${dates[0]} → ${dates[dates.length - 1]}`);
  console.log(`Ingest: ${INGEST_URL}`);
  console.log('');

  console.log('Launching browser...');
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });

  const allTeeTimes = [];
  const stats = { cps: 0, chronogolf: 0, golfnow: 0, golfnowSkipped: 0 };

  try {
    for (const course of COURSES) {
      console.log(`[${course.bookingSystem.toUpperCase()}] ${course.name}`);
      let times = [];

      try {
        if (course.bookingSystem === 'cps') {
          times = await scrapeCps(course, dates, browser);
          stats.cps += times.length;
        } else if (course.bookingSystem === 'chronogolf') {
          times = await scrapeChronogolfWithPlaywright(course, dates, browser);
          stats.chronogolf += times.length;
        } else if (course.bookingSystem === 'golfnow') {
          if (!GOLFNOW_API_KEY) { stats.golfnowSkipped++; }
          times = await scrapeGolfNow(course, dates);
          stats.golfnow += times.length;
        }
      } catch (err) {
        console.error(`  ERROR: ${err.message}`);
      }

      const valid = times.filter(t => t.course && t.date && t.time);
      console.log(`  → ${valid.length} valid tee times`);
      allTeeTimes.push(...valid);
    }
  } finally {
    await browser.close();
  }

  console.log('');
  console.log(`Total: ${allTeeTimes.length} tee times`);
  console.log(`  CPS: ${stats.cps} | Chronogolf: ${stats.chronogolf} | GolfNow: ${stats.golfnow} (${stats.golfnowSkipped} skipped)`);

  if (allTeeTimes.length === 0) {
    console.log('Nothing to ingest.');
    return;
  }

  // Batch POST
  const BATCH = 200;
  let inserted = 0, skipped = 0, alerts = 0;
  for (let i = 0; i < allTeeTimes.length; i += BATCH) {
    const batch = allTeeTimes.slice(i, i + BATCH);
    console.log(`\nPosting batch ${Math.floor(i/BATCH)+1} (${batch.length} items)...`);
    try {
      const r = await postToIngest(batch);
      inserted += r.inserted || 0;
      skipped += r.skipped || 0;
      alerts += r.alertsSent || 0;
      console.log(`  inserted=${r.inserted} skipped=${r.skipped} alerts=${r.alertsSent}`);
    } catch (err) {
      console.error(`  Batch failed: ${err.message}`);
    }
  }

  console.log(`\nDone. inserted=${inserted} skipped=${skipped} alerts=${alerts}`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
