/**
 * TeeDrop Cloud Scraper
 *
 * CPS (Club Prophet Systems): Playwright login → bearer token → direct HTTP for tee times
 * GolfNow: HTTP API (needs GOLFNOW_API_KEY)
 *
 * Oki Golf courses (Newcastle, Harbour Pointe, etc.) removed — they use a
 * waitlist system and have no standard online tee time booking.
 * Chambers Bay moved to GolfNow (facility 4231).
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

// ── CPS: Login → token → direct HTTP ─────────────────────────────────────────
//
// Flow:
//   1. Open a course page with Playwright
//   2. Submit email on the gate → existing account triggers password step
//   3. Enter password → OAuth completes → capture bearer token from token/short
//   4. Call GetAllOptions to build slug→courseId map
//   5. Fetch tee times via HTTP for each course/date (no more Playwright needed)

let cpsToken = null;
let cpsCourseIdMap = {};   // cpsSlug → courseId (number)
let cpsComponentId = null; // required header for GetAvailableTimeSheet
let cpsInitialized = false;

async function initCps(browser) {
  if (cpsInitialized) return;

  if (!CPS_EMAIL || !CPS_PASSWORD) {
    console.log('  [CPS] Skipping — CPS_EMAIL / CPS_PASSWORD not set');
    cpsInitialized = true;
    return;
  }

  console.log(`  [CPS] Logging in as ${CPS_EMAIL}...`);

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();

  // Intercept GetAvailableTimeSheet requests to capture ALL headers the Angular app sends
  let capturedRequestHeaders = null;
  await context.route('**GetAvailableTimeSheet**', async (route) => {
    const req = route.request();
    capturedRequestHeaders = req.headers();
    console.log(`  [CPS] Intercepted GetAvailableTimeSheet — headers: ${JSON.stringify(Object.keys(capturedRequestHeaders))}`);
    const cid = capturedRequestHeaders['componentid'] || capturedRequestHeaders['ComponentId'];
    if (cid) {
      cpsComponentId = cid;
      console.log(`  [CPS] componentid intercepted: ${cid}`);
    }
    await route.continue();
  });

  // Intercept JSON responses to capture token + course options
  page.on('response', async (response) => {
    const url = response.url();
    const ct  = response.headers()['content-type'] || '';
    if (!ct.includes('json')) return;
    try {
      const json = await response.json();
      if (url.includes('token/short') && json.access_token) {
        cpsToken = json.access_token;
        // Log full token/short response (non-token fields)
        const logFields = Object.fromEntries(Object.entries(json).filter(([k]) => k !== 'access_token' && k !== 'refresh_token'));
        console.log(`  [CPS] token/short non-token fields: ${JSON.stringify(logFields)}`);
        try {
          const payload = JSON.parse(Buffer.from(cpsToken.split('.')[1], 'base64url').toString());
          console.log(`  [CPS] JWT payload: ${JSON.stringify(payload)}`);
        } catch { console.log('  [CPS] Bearer token captured'); }
      }
      if (url.includes('GetAllOptions')) {
        // Log top-level keys and first-level structure to find componentid
        if (typeof json === 'object' && json !== null && !Array.isArray(json)) {
          // Log shRules[0] values to find siteId
          if (Array.isArray(json.shRules) && json.shRules.length > 0) {
            console.log(`  [CPS] shRules[0]: ${JSON.stringify(json.shRules[0])}`);
          }
          // Log courseOptions[0] webSiteId and siteId fields
          if (Array.isArray(json.courseOptions) && json.courseOptions.length > 0) {
            const c = json.courseOptions[0];
            console.log(`  [CPS] courseOptions[0] webSiteId: ${c.webSiteId}, courseGUID: ${c.courseGUID}`);
          }
        }
        buildCpsCourseMap(json);
        console.log(`  [CPS] Course map built: ${Object.keys(cpsCourseIdMap).length} entries`);
      }
    } catch { /* ignore */ }
  });

  try {
    // Load Jackson Park — any course page works to trigger the login flow
    await page.goto('https://premiergolf.cps.golf/reserve/jackson-park-golf-course',
      { waitUntil: 'networkidle', timeout: 30000 });
    await sleep(1500);

    // Step 1: Email gate
    const emailInput = await page.$('input[type="email"], input[formcontrolname="email"], input[name="email"]');
    if (emailInput) {
      console.log('  [CPS] Email gate — submitting email');
      await emailInput.fill(CPS_EMAIL);
      await page.keyboard.press('Tab');
      await sleep(400);
      const nextBtn = await page.$('button[type="submit"], button:has-text("NEXT"), button:has-text("Next"), button:has-text("Continue")');
      if (nextBtn) await nextBtn.click();
      await sleep(2000);
    }

    // Step 2: Password step (may appear inline or via redirect to identityapi)
    // CPS IdentityServer login page URL pattern: /identityapi/Account/Login or /identityapi/connect/authorize
    await page.waitForFunction(
      () => document.querySelector('input[type="password"]') !== null ||
            document.querySelector('input[name="Password"]') !== null ||
            document.title.toLowerCase().includes('booking') ||
            document.querySelector('[class*="tee-time"]') !== null,
      { timeout: 10000 }
    ).catch(() => {});

    const passwordInput = await page.$('input[type="password"], input[name="Password"], input[id*="password" i]');
    if (passwordInput) {
      console.log(`  [CPS] Password field found at: ${page.url().slice(0, 80)}`);
      // Fill email again if on a separate login page
      const loginEmailInput = await page.$('input[type="email"], input[name="Email"], input[id*="email" i], input[name="Username"]');
      if (loginEmailInput) {
        const currentVal = await loginEmailInput.inputValue().catch(() => '');
        if (!currentVal) await loginEmailInput.fill(CPS_EMAIL);
      }
      await passwordInput.fill(CPS_PASSWORD);
      await sleep(300);
      const loginBtn = await page.$('button[type="submit"], button:has-text("Log in"), button:has-text("Sign in"), button:has-text("Login"), input[type="submit"]');
      if (loginBtn) {
        console.log(`  [CPS] Clicking login button`);
        await loginBtn.click();
      }
      // Track URL changes through the OAuth flow
      console.log(`  [CPS] URL after click: ${page.url().slice(0, 120)}`);
      await sleep(1000);
      console.log(`  [CPS] URL +1s: ${page.url().slice(0, 120)}`);
      await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
      console.log(`  [CPS] URL after nav1: ${page.url().slice(0, 120)}`);
      await sleep(1000);
      console.log(`  [CPS] URL +1s: ${page.url().slice(0, 120)}`);
      await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
      console.log(`  [CPS] URL after nav2: ${page.url().slice(0, 120)}`);
      await sleep(2000);
      console.log(`  [CPS] URL final: ${page.url().slice(0, 120)}`);
      // Check for any error text on the page
      const errorText = await page.locator('[class*="error"], [class*="alert"], [class*="danger"]').first().textContent().catch(() => '');
      if (errorText) console.log(`  [CPS] Error on page: ${errorText.slice(0, 200)}`);
      // If stuck on verify-email, inspect the page and try to proceed
      if (page.url().includes('verify-email')) {
        console.log('  [CPS] On verify-email page — getting rendered text...');
        // Wait for Angular to render the component
        await sleep(2000);
        const bodyText = await page.locator('body').innerText().catch(() => '');
        console.log(`  [CPS] verify-email rendered text: ${bodyText.replace(/\s+/g,' ').slice(0, 500)}`);
        // Get all button texts
        const buttons = await page.$$('button, a[role="button"]');
        for (const btn of buttons) {
          const txt = await btn.textContent().catch(() => '');
          if (txt.trim()) console.log(`  [CPS] Button: "${txt.trim()}"`);
        }
        // Try clicking any "Continue" / "Already verified" / "Skip" / "Resend" buttons
        const skipBtn = await page.$('button:has-text("Continue"), button:has-text("Skip"), a:has-text("Continue"), button:has-text("Already"), button:has-text("Resend"), button:has-text("verified")').catch(() => null);
        if (skipBtn) {
          const btnText = await skipBtn.textContent().catch(() => 'unknown');
          console.log(`  [CPS] Clicking: "${btnText}"`);
          await skipBtn.click();
          await sleep(3000);
          console.log(`  [CPS] After click: ${page.url().slice(0, 80)}`);
        }
      }
    } else {
      console.log('  [CPS] No password field — checking if already past gate');
    }

    // Log page state for debugging
    const title = await page.title().catch(() => '');
    const url   = page.url();
    console.log(`  [CPS] Post-login: "${title}" @ ${url.slice(0, 80)}`);

    // If we got the token, fetch GetAllOptions now to get all course IDs
    if (cpsToken && Object.keys(cpsCourseIdMap).length === 0) {
      await fetchCpsAllOptions();
    }

    // Navigate back to force the Angular app to make GetAvailableTimeSheet calls
    if (!cpsComponentId) {
      console.log('  [CPS] Navigating to booking page to intercept GetAvailableTimeSheet...');
      await page.goto('https://premiergolf.cps.golf/reserve/jackson-park-golf-course',
        { waitUntil: 'networkidle', timeout: 25000 }).catch(() => {});
      await sleep(4000);
      console.log(`  [CPS] componentid after re-nav: ${cpsComponentId || 'not yet'}`);
    }

    // Try to find componentid in Angular app state / sessionStorage
    if (!cpsComponentId) {
      try {
        const cid = await page.evaluate(() => {
          // Check sessionStorage
          for (const key of Object.keys(sessionStorage)) {
            const val = sessionStorage.getItem(key);
            if (key.toLowerCase().includes('component') || key.toLowerCase().includes('website') || key.toLowerCase().includes('site')) {
              return `session:${key}=${val}`;
            }
            try {
              const obj = JSON.parse(val);
              if (obj && typeof obj === 'object') {
                const cid = obj.componentId || obj.componentid || obj.component_id || obj.websiteId || obj.siteId;
                if (cid) return String(cid);
              }
            } catch {}
          }
          // Check window globals
          const candidates = ['__componentId', '__websiteId', '__siteId', 'componentId', 'websiteId'];
          for (const k of candidates) {
            if (window[k] != null) return String(window[k]);
          }
          // Dump all sessionStorage keys + values for debugging
          const dump = {};
          for (const key of Object.keys(sessionStorage)) { dump[key] = sessionStorage.getItem(key); }
          return 'DUMP:' + JSON.stringify(dump).slice(0, 500);
        });
        console.log(`  [CPS] page.evaluate result: ${cid}`);
        if (cid && !cid.startsWith('DUMP:') && !cid.startsWith('session:')) {
          cpsComponentId = cid;
        }
      } catch (err) {
        console.warn(`  [CPS] page.evaluate error: ${err.message}`);
      }
    }

  } catch (err) {
    console.error(`  [CPS] Login error: ${err.message}`);
  } finally {
    await context.close();
  }

  cpsInitialized = true;
  console.log(`  [CPS] Init done. Token: ${cpsToken ? 'YES' : 'NO'} | Courses mapped: ${Object.keys(cpsCourseIdMap).length}`);
}

async function fetchCpsAllOptions() {
  try {
    const aoHdrs = { 'Authorization': `Bearer ${cpsToken}`, 'Accept': 'application/json' };
    if (cpsComponentId) aoHdrs['componentid'] = cpsComponentId;
    const res = await fetch(
      'https://premiergolf.cps.golf/onlineres/onlineapi/api/v1/onlinereservation/GetAllOptions/premiergolf?version=25.4.2&product=3',
      { headers: aoHdrs, signal: AbortSignal.timeout(10000) }
    );
    if (res.ok) {
      const json = await res.json();
      buildCpsCourseMap(json);
      console.log(`  [CPS] GetAllOptions (HTTP): ${Object.keys(cpsCourseIdMap).length} courses mapped`);
    } else {
      console.log(`  [CPS] GetAllOptions HTTP ${res.status}`);
    }
  } catch (err) {
    console.warn(`  [CPS] GetAllOptions fetch error: ${err.message}`);
  }
}

function buildCpsCourseMap(options) {
  // Try to capture componentid from root-level fields
  if (!cpsComponentId && options && typeof options === 'object' && !Array.isArray(options)) {
    // Try root webSiteId (GUID)
    const wid = options.webSiteId || options.websiteId || options.WebSiteId || options.componentId;
    if (wid && wid !== '00000000-0000-0000-0000-000000000000') {
      cpsComponentId = String(wid);
      console.log(`  [CPS] componentid (webSiteId GUID): ${cpsComponentId}`);
    }
    // Also log siteId from shRules for debugging
    if (Array.isArray(options.shRules) && options.shRules.length > 0) {
      const siteIds = [...new Set(options.shRules.map(r => r.siteId).filter(Boolean))];
      console.log(`  [CPS] shRules siteIds: ${siteIds.join(', ')}`);
    }
  }

  // Walk the entire response tree looking for { courseId, name/courseName }
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
  // Convert slug to name tokens for fuzzy match
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

async function scrapeCps(course, dates) {
  if (!cpsToken) {
    console.log(`  [SKIP] No CPS token`);
    return [];
  }

  const courseId = getCpsCourseId(course.cpsSlug);
  if (!courseId) {
    console.log(`  [CPS] No courseId for ${course.cpsSlug}`);
    console.log(`  [CPS] Known names: ${Object.keys(cpsCourseIdMap).map(k=>k.replace('__name:','')).join(', ')}`);
    return [];
  }

  console.log(`  courseId=${courseId} componentid=${cpsComponentId || 'MISSING'}`);
  const holeCount = course.holes === 9 ? 9 : 18;
  const results = [];

  for (const date of dates) {
    const [y, m, d] = date.split('-');
    const bookingDate = encodeURIComponent(`${m}/${d}/${y}`);
    const url = `https://premiergolf.cps.golf/onlineres/onlineapi/api/v1/onlinereservation/GetAvailableTimeSheet?tenantAlias=premiergolf&courseId=${courseId}&bookingDate=${bookingDate}&holeCount=${holeCount}&players=1&numberOfGuests=0`;

    try {
      const hdrs = { 'Authorization': `Bearer ${cpsToken}`, 'Accept': 'application/json' };
      if (cpsComponentId) hdrs['componentid'] = cpsComponentId;
      const res = await fetch(url, {
        headers: hdrs,
        signal: AbortSignal.timeout(10000),
      });
      const text = await res.text();

      if (res.status === 401) {
        console.log(`  [CPS] 401 — token expired`);
        cpsToken = null;
        break;
      }
      if (!res.ok) {
        console.log(`  [CPS] ${date}: HTTP ${res.status} — ${text.slice(0, 100)}`);
        continue;
      }

      const json = JSON.parse(text);
      const times = extractCpsTeeTimesFromJson(json);
      results.push(...times.map(t => ({ ...t, course: course.name, date, source: 'cps' })));
      console.log(`  ${date}: ${times.length} tee times`);
    } catch (err) {
      console.warn(`  [CPS] ${date}: ${err.message}`);
    }
    await sleep(150);
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

  // Init CPS session (login + get token + build course map)
  const cpsCourses = COURSES.filter(c => c.bookingSystem === 'cps');
  if (cpsCourses.length > 0 && (CPS_EMAIL && CPS_PASSWORD)) {
    console.log('Launching browser for CPS login...');
    const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    try {
      await initCps(browser);
    } finally {
      await browser.close();
    }
    console.log('');
  }

  const allTeeTimes = [];
  const stats = { cps: 0, golfnow: 0, golfnowSkipped: 0 };

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
