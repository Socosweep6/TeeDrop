/**
 * TeeDrop Cloud Scraper
 *
 * CPS (Club Prophet Systems):
 *   1. Direct OAuth login (grant_type=password) to get authenticated token
 *   2. GetAllOptions via HTTP to build courseId map
 *   3. Playwright browser session for in-browser fetch (bypasses componentid cookie check)
 * GolfNow: HTTP API (needs GOLFNOW_API_KEY)
 *
 * Oki Golf courses removed — they use a waitlist system, no standard online booking.
 * Chambers Bay on GolfNow (facility 4231).
 *
 * CPS env.js discovery:
 *   AUTH_CLIENT_ID = "js1"
 *   CLIENT_SECRET  = "v4secret"
 *   SHORT_LIVED_CLIENT_ID = "onlinereswebshortlived"
 */

import { chromium } from 'playwright';

const INGEST_URL    = process.env.INGEST_URL;
const INGEST_SECRET = process.env.INGEST_SECRET || 'teedrop-ingest-2026';
const GOLFNOW_API_KEY = process.env.GOLFNOW_API_KEY || null;
const CPS_EMAIL    = process.env.CPS_EMAIL || null;
const CPS_PASSWORD = process.env.CPS_PASSWORD || null;

if (!INGEST_URL) {
  console.error('ERROR: INGEST_URL is required');
  process.exit(1);
}

// ── Course list ───────────────────────────────────────────────────────────────

const COURSES = [
  // CPS (Club Prophet Systems) — Seattle Parks + Bellevue + Legion Memorial
  { name: 'Jackson Park Golf Course',    bookingSystem: 'cps', cpsSlug: 'jackson-park-golf-course' },
  { name: 'Jefferson Park Golf Course',  bookingSystem: 'cps', cpsSlug: 'jefferson-park-golf-course' },
  { name: 'West Seattle Golf Course',    bookingSystem: 'cps', cpsSlug: 'west-seattle-golf-course' },
  { name: 'Interbay Golf Center',        bookingSystem: 'cps', cpsSlug: 'interbay-golf-center', holes: 9 },
  { name: 'Legion Memorial Golf Course', bookingSystem: 'cps', cpsSlug: 'legion-memorial-golf-course' },
  { name: 'Bellevue Golf Course',        bookingSystem: 'cps', cpsSlug: 'bellevue-golf-course' },

  // GolfNow — activated when GOLFNOW_API_KEY is set
  { name: 'Chambers Bay',                      bookingSystem: 'golfnow', golfnowId: '4231' },
  { name: 'Walter E. Hall Memorial Golf Course', bookingSystem: 'golfnow', golfnowId: '4726' },
  { name: 'Battle Creek Golf Course',          bookingSystem: 'golfnow', golfnowId: '1679' },
  { name: 'Willows Run Golf Complex',          bookingSystem: 'golfnow', golfnowId: '7422' },
  { name: 'Snoqualmie Falls Golf Course',      bookingSystem: 'golfnow', golfnowId: '5555' },
  { name: 'Tall Chief Golf Course',            bookingSystem: 'golfnow', golfnowId: '7093' },
  { name: 'Foster Golf Links',                 bookingSystem: 'golfnow', golfnowId: '4153' },
  { name: 'Riverbend Golf Complex',            bookingSystem: 'golfnow', golfnowId: '4154' },
  { name: 'Maplewood Golf Course',             bookingSystem: 'golfnow', golfnowId: '6607' },
  { name: 'Auburn Golf Course',                bookingSystem: 'golfnow', golfnowId: '1244' },
  { name: 'Druids Glen Golf Course',           bookingSystem: 'golfnow', golfnowId: '19498' },
  { name: 'Madrona Links Golf Course',         bookingSystem: 'golfnow', golfnowId: '4908' },
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

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

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

// ── CPS State ─────────────────────────────────────────────────────────────────

let cpsToken = null;
let cpsCourseIdMap = {};   // cpsSlug → courseId
let cpsComponentId = null; // from JWT component_id
let cpsPage = null;        // Playwright page for in-browser fetch (handles cookie auth)
let cpsInitialized = false;

// ── CPS Init ──────────────────────────────────────────────────────────────────

// Headers captured from Angular app's own successful API calls
let cpsAngularHeaders = null;

async function initCps(browser) {
  if (cpsInitialized) return;

  if (!CPS_EMAIL || !CPS_PASSWORD) {
    console.log('  [CPS] Skipping — CPS_EMAIL / CPS_PASSWORD not set');
    cpsInitialized = true;
    return;
  }

  // Step 1: Direct OAuth login (no browser needed for auth)
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

    // Extract component_id from JWT payload (fallback only)
    try {
      const payload = JSON.parse(Buffer.from(cpsToken.split('.')[1], 'base64url').toString());
      cpsComponentId = payload.component_id ? String(payload.component_id) : null;
      console.log(`  [CPS] Token OK. component_id=${cpsComponentId} sub=${payload.sub}`);
    } catch {
      console.log('  [CPS] Token OK (could not decode JWT)');
    }
  } catch (err) {
    console.error(`  [CPS] OAuth failed: ${err.message}`);
    cpsInitialized = true;
    return;
  }

  // Step 2: Launch browser, intercept Angular's own API calls to capture real headers
  // Angular's requests succeed because they include a valid componentid + session cookies.
  // We intercept to capture the exact headers, then reuse them.
  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 900 },
    });
    cpsPage = await context.newPage();

    // Intercept ALL Angular onlinereservation requests BEFORE navigation
    // This captures the exact URLs and headers the app uses successfully
    const allOptionsPromise = new Promise((resolve) => {
      cpsPage.on('request', req => {
        const url = req.url();
        if (url.includes('onlinereservation')) {
          const headers = req.headers();
          // Log ALL reservation API requests to understand URL patterns
          const shortUrl = url.replace('https://premiergolf.cps.golf/onlineres/onlineapi/api/v1/onlinereservation', '[api]');
          console.log(`  [CPS] Angular request: ${shortUrl.slice(0, 150)}`);
          const cidKey = Object.keys(headers).find(k => k.toLowerCase().includes('componentid'));
          if (cidKey) {
            console.log(`    ${cidKey}: ${headers[cidKey]}`);
          }
        }
        if (url.includes('GetAllOptions')) {
          const headers = req.headers();
          console.log(`  [CPS] Intercepted Angular GetAllOptions headers:`);
          for (const [k, v] of Object.entries(headers)) {
            console.log(`    ${k}: ${v.slice(0, 100)}`);
          }
          cpsAngularHeaders = headers;
          const cidKey = Object.keys(headers).find(k => k.toLowerCase().includes('componentid'));
          if (cidKey) {
            cpsComponentId = headers[cidKey];
            console.log(`  [CPS] componentid header name="${cidKey}" value="${cpsComponentId}"`);
          }
          resolve(headers);
        }
      });

      // Also capture response data from Angular's GetAllOptions
      cpsPage.on('response', async resp => {
        if (resp.url().includes('GetAllOptions') && resp.status() === 200) {
          try {
            const data = await resp.json();
            buildCpsCourseMap(data);
            console.log(`  [CPS] GetAllOptions captured from Angular (${Object.keys(cpsCourseIdMap).length} courses)`);
          } catch {}
        } else if (resp.url().includes('GetAllOptions')) {
          console.log(`  [CPS] Angular GetAllOptions → HTTP ${resp.status()}`);
        }
      });
    });

    await cpsPage.goto('https://premiergolf.cps.golf/reserve/jackson-park-golf-course',
      { waitUntil: 'networkidle', timeout: 30000 });

    // Give Angular a moment if networkidle wasn't enough
    await Promise.race([
      allOptionsPromise,
      sleep(5000),
    ]);

    const landedUrl = cpsPage.url();
    console.log(`  [CPS] Browser session at: ${landedUrl.slice(0, 120)}`);

    // If redirected to verify-email, try navigating to the returnUrl (search page)
    // The search/booking page may call GetAvailableTimeSheet anonymously
    if (landedUrl.includes('verify-email')) {
      const returnMatch = landedUrl.match(/returnUrl=([^&]+)/);
      if (returnMatch) {
        const returnUrl = decodeURIComponent(returnMatch[1]);
        console.log(`  [CPS] Redirected to verify-email. Trying returnUrl: ${returnUrl.slice(0, 80)}`);
        try {
          await cpsPage.goto(`https://premiergolf.cps.golf/onlineresweb${returnUrl}`,
            { waitUntil: 'networkidle', timeout: 15000 });
          console.log(`  [CPS] After returnUrl nav: ${cpsPage.url().slice(0, 80)}`);
          await sleep(2000);
        } catch {}
      }
    }
  } catch (err) {
    console.error(`  [CPS] Browser setup error: ${err.message}`);
    cpsPage = null;
  }

  // Step 3: If Angular's request didn't fire or we didn't get courses, try direct call
  // using the componentid we captured (or fall back to JWT value)
  if (Object.keys(cpsCourseIdMap).length === 0) {
    console.log(`  [CPS] No courses from Angular intercept — trying direct GetAllOptions`);
    await fetchCpsAllOptions();
  }

  // Step 4: Dump full sessionStorage for debugging
  if (cpsPage) {
    try {
      const sessionData = await cpsPage.evaluate(() => {
        const data = {};
        for (const key of Object.keys(sessionStorage)) {
          data[key] = sessionStorage.getItem(key);
        }
        return data;
      });
      console.log(`  [CPS] sessionStorage keys: ${Object.keys(sessionData).join(', ')}`);
      for (const [k, v] of Object.entries(sessionData)) {
        console.log(`  [CPS] ss[${k}]: ${String(v).slice(0, 120)}`);
      }
    } catch (err) {
      console.warn(`  [CPS] sessionStorage read error: ${err.message}`);
    }
  }

  cpsInitialized = true;
  console.log(`  [CPS] Init done. Token: ${cpsToken ? 'YES' : 'NO'} | componentid: ${cpsComponentId || 'UNKNOWN'} | Courses: ${Object.keys(cpsCourseIdMap).length} | Browser: ${cpsPage ? 'YES' : 'NO'}`);
  // Dump course map for debugging
  for (const [k, id] of Object.entries(cpsCourseIdMap)) {
    console.log(`  [CPS] course: id=${id} name="${k.replace('__name:', '')}"`);
  }
}

async function fetchCpsAllOptions() {
  const url = 'https://premiergolf.cps.golf/onlineres/onlineapi/api/v1/onlinereservation/GetAllOptions/premiergolf?version=25.4.2&product=3';
  try {
    // Use captured Angular headers if available — replicate them exactly
    if (cpsAngularHeaders && cpsPage) {
      const result = await cpsPage.evaluate(
        async ({ url, angularHeaders, userToken }) => {
          // Try 1: replicate Angular's exact headers (captured from its own request)
          const hdrs1 = { ...angularHeaders };
          // Swap in our auth token
          hdrs1['authorization'] = `Bearer ${userToken}`;
          const r1 = await fetch(url, { headers: hdrs1 }).catch(e => ({ ok: false, status: 0, statusText: e.message }));
          if (r1.ok) return { status: r1.status, text: await r1.text(), method: 'angular-headers+auth' };

          // Try 2: Angular headers without auth swap (use whatever token Angular had)
          const r2 = await fetch(url, { headers: angularHeaders }).catch(e => ({ ok: false, status: 0, statusText: e.message }));
          if (r2.ok) return { status: r2.status, text: await r2.text(), method: 'angular-headers-as-is' };

          const t2 = typeof r2.text === 'function' ? await r2.text() : (r2.statusText || '');
          return { status: r2.status, text: t2, method: 'angular-headers-as-is' };
        },
        { url, angularHeaders: cpsAngularHeaders, userToken: cpsToken }
      );
      if (result.status === 200) {
        const json = JSON.parse(result.text);
        buildCpsCourseMap(json);
        console.log(`  [CPS] GetAllOptions OK (${result.method}): ${Object.keys(cpsCourseIdMap).length} courses`);
        return;
      }
      console.log(`  [CPS] GetAllOptions HTTP ${result.status} (${result.method}) — ${result.text.slice(0, 150)}`);
    }

    // Fallback: try in-browser with componentid from JWT / sessionStorage
    if (cpsPage) {
      const result = await cpsPage.evaluate(
        async ({ url, userToken, sessionId }) => {
          const hdrs = { 'Accept': 'application/json' };
          if (sessionId) hdrs['componentid'] = sessionId;

          // Try 1: no auth
          const r1 = await fetch(url, { headers: hdrs }).catch(e => ({ ok: false, status: 0, text: () => e.message }));
          if (r1.ok) return { status: r1.status, text: await r1.text(), method: 'no-auth' };

          // Try 2: user token
          const r2 = await fetch(url, {
            headers: { ...hdrs, 'Authorization': `Bearer ${userToken}` },
          }).catch(e => ({ ok: false, status: 0, text: () => e.message }));
          const t2 = typeof r2.text === 'function' ? await r2.text() : (r2.statusText || '');
          return { status: r2.status, text: t2, method: 'user-token' };
        },
        { url, userToken: cpsToken, sessionId: cpsComponentId }
      );
      if (result.status === 200) {
        const json = JSON.parse(result.text);
        buildCpsCourseMap(json);
        console.log(`  [CPS] GetAllOptions OK (${result.method}): ${Object.keys(cpsCourseIdMap).length} courses`);
        return;
      }
      console.log(`  [CPS] GetAllOptions HTTP ${result.status} (${result.method}) — ${result.text.slice(0, 150)}`);
    } else {
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${cpsToken}`, 'Accept': 'application/json' },
        signal: AbortSignal.timeout(15000),
      });
      const text = await res.text();
      if (res.status === 200) {
        buildCpsCourseMap(JSON.parse(text));
        console.log(`  [CPS] GetAllOptions OK (direct): ${Object.keys(cpsCourseIdMap).length} courses`);
      } else {
        console.log(`  [CPS] GetAllOptions HTTP ${res.status} (direct) — ${text.slice(0, 150)}`);
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

// ── CPS Scraper ───────────────────────────────────────────────────────────────

async function scrapeCps(course, dates) {
  if (!cpsToken) {
    console.log(`  [SKIP] No CPS token`);
    return [];
  }

  const courseId = getCpsCourseId(course.cpsSlug);
  if (!courseId) {
    console.log(`  [CPS] No courseId for ${course.cpsSlug}`);
    console.log(`  [CPS] Known: ${Object.keys(cpsCourseIdMap).map(k => k.replace('__name:', '')).join(', ')}`);
    return [];
  }

  console.log(`  courseId=${courseId} componentid=${cpsComponentId || '?'}`);
  const holeCount = course.holes === 9 ? 9 : 18;
  const results = [];
  let workingUrlTemplate = null;

  for (const date of dates) {
    const [y, m, d] = date.split('-');
    const bookingDate = `${m}/${d}/${y}`;
    const base = 'https://premiergolf.cps.golf/onlineres/onlineapi/api/v1/onlinereservation';
    const qs = `courseId=${courseId}&bookingDate=${encodeURIComponent(bookingDate)}&holeCount=${holeCount}&players=1&numberOfGuests=0`;

    // URL is confirmed: tenant-in-path format, matching GetAllOptions pattern
    // product=3 is included based on GetAllOptions URL pattern
    const url = workingUrlTemplate
      ? workingUrlTemplate.replace('__DATE__', encodeURIComponent(bookingDate))
      : `${base}/GetAvailableTimeSheet/premiergolf?${qs}&product=3`;

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
          headers: { 'Authorization': `Bearer ${cpsToken}`, 'x-componentid': cpsComponentId || '1', 'Accept': 'application/json' },
          signal: AbortSignal.timeout(10000),
        });
        status = res.status;
        text = await res.text();
      }

      if (status === 401) {
        console.log(`  [CPS] 401 — token expired`);
        cpsToken = null;
        break;
      }
      if (status !== 200) {
        console.log(`  [CPS] ${date}: HTTP ${status} — ${text.slice(0, 120) || '(empty body)'}`);
        continue;
      }
      if (!workingUrlTemplate) {
        workingUrlTemplate = url.replace(encodeURIComponent(bookingDate), '__DATE__');
      }

      const json = JSON.parse(text);
      const times = extractCpsTeeTimesFromJson(json);
      results.push(...times.map(t => ({ ...t, course: course.name, date, source: 'cps' })));
      console.log(`  ${date}: ${times.length} tee times`);
    } catch (err) {
      console.warn(`  [CPS] ${date}: ${err.message}`);
    }
    await sleep(500); // 500ms between requests — CPS rate limit is 10/s but we share quota
  }

  return results;
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
    const timeField = ['time','start_time','teeTime','TeeTime','startTime','StartTime','teeTimeFrom']
      .find(f => first[f] != null);
    if (!timeField) continue;
    return arr.map(slot => ({
      time: to12Hour(slot[timeField]),
      players: slot.available_spots ?? slot.availableSpots ?? slot.maxPlayers ?? slot.MaxPlayers ?? 4,
      price: slot.price != null
        ? (typeof slot.price === 'string' ? slot.price : `$${(slot.price / 100).toFixed(2)}`)
        : null,
      holes: slot.holes ?? slot.nb_holes ?? slot.HoleCount ?? 18,
      booking_url: slot.booking_url ?? slot.bookingUrl ?? null,
    }));
  }
  return [];
}

// ── GolfNow Scraper (HTTP) ────────────────────────────────────────────────────

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
  const res = await fetch(`${INGEST_URL}?secret=${encodeURIComponent(INGEST_SECRET)}`, {
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
  console.log(`TeeDrop Scraper — ${new Date().toISOString()}`);
  console.log(`Dates: ${dates[0]} → ${dates[dates.length - 1]}`);
  console.log(`CPS credentials: ${CPS_EMAIL ? 'SET' : 'NOT SET'}`);
  console.log(`GolfNow API key: ${GOLFNOW_API_KEY ? 'SET' : 'NOT SET'}`);
  console.log('');

  const cpsCourses = COURSES.filter(c => c.bookingSystem === 'cps');
  let browser = null;

  if (cpsCourses.length > 0 && CPS_EMAIL && CPS_PASSWORD) {
    console.log('Initializing CPS...');
    browser = await chromium.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    await initCps(browser);
    console.log('');
  }

  const allTeeTimes = [];
  const stats = { cps: 0, golfnow: 0, golfnowSkipped: 0 };

  try {
    for (const course of COURSES) {
      console.log(`[${course.bookingSystem.toUpperCase()}] ${course.name}`);
      let times = [];

      try {
        if (course.bookingSystem === 'cps') {
          times = await scrapeCps(course, dates);
          stats.cps += times.length;
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
    // Close browser after all scraping is done
    if (cpsPage) await cpsPage.context().close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }

  console.log('');
  console.log(`Total: ${allTeeTimes.length} tee times`);
  console.log(`  CPS: ${stats.cps} | GolfNow: ${stats.golfnow} (${stats.golfnowSkipped} skipped)`);

  if (allTeeTimes.length === 0) {
    console.log('Nothing to ingest.');
    return;
  }

  const BATCH = 200;
  let inserted = 0, skipped = 0, alerts = 0;
  for (let i = 0; i < allTeeTimes.length; i += BATCH) {
    const batch = allTeeTimes.slice(i, i + BATCH);
    console.log(`\nPosting batch ${Math.floor(i / BATCH) + 1} (${batch.length} items)...`);
    try {
      const r = await postToIngest(batch);
      inserted += r.inserted || 0;
      skipped  += r.skipped  || 0;
      alerts   += r.alertsSent || 0;
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
