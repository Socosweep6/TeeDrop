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

// ── CPS Scraper (Playwright) ──────────────────────────────────────────────────
//
// CPS (Club Prophet Systems) booking pages are React SPAs at:
//   https://premiergolf.cps.golf/reserve/{slug}
//
// The page shows tee times for the selected date. We use Playwright to
// intercept the API responses directly rather than scraping the DOM.

async function scrapeCpsWithPlaywright(course, dates, browser) {
  const results = [];
  const url = `https://premiergolf.cps.golf/reserve/${course.cpsSlug}`;
  console.log(`  Opening ${url}`);

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
    extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
  });
  const page = await context.newPage();

  // Intercept JSON API calls the page makes — captures tee time data
  const interceptedTeeTimes = new Map(); // date → tee times array
  page.on('response', async (response) => {
    const resUrl = response.url();
    if (!resUrl.includes('cps.golf') && !resUrl.includes('premiergolf')) return;
    if (!response.headers()['content-type']?.includes('json')) return;
    try {
      const json = await response.json();
      // Look for tee time data in the response
      const times = extractCpsTeeTimesFromJson(json);
      if (times.length > 0) {
        // Try to determine the date from the URL or request params
        const urlDate = extractDateFromUrl(resUrl);
        if (urlDate) {
          interceptedTeeTimes.set(urlDate, times);
        }
      }
    } catch { /* not JSON or parse error */ }
  });

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(2000); // let initial React render complete

    const title = await page.title();
    console.log(`  Page title: "${title}"`);

    // Try to navigate to each date and collect tee times
    for (const date of dates) {
      try {
        // Navigate to the date — CPS usually accepts date as URL param or query string
        const dateUrl = `${url}?date=${date}`;
        interceptedTeeTimes.delete(date);

        await page.goto(dateUrl, { waitUntil: 'networkidle', timeout: 20000 });
        await sleep(1500);

        // Try extracting from DOM if interception didn't work
        const domTimes = await extractCpsTeeTimesFromDom(page, date, course);
        if (domTimes.length > 0) {
          results.push(...domTimes);
          console.log(`  ${date}: ${domTimes.length} tee times (DOM)`);
        } else if (interceptedTeeTimes.has(date)) {
          const apiTimes = interceptedTeeTimes.get(date).map(t => ({
            ...t,
            course: course.name,
            date,
            source: 'cps',
          }));
          results.push(...apiTimes);
          console.log(`  ${date}: ${apiTimes.length} tee times (API intercept)`);
        } else {
          // Log DOM snapshot for debugging
          const bodyPreview = await page.evaluate(() =>
            Array.from(document.querySelectorAll('h1,h2,h3,[class*="tee"],[class*="time"],[class*="slot"]'))
              .slice(0, 5)
              .map(el => `${el.tagName}.${el.className}: ${el.textContent.trim().slice(0, 50)}`)
              .join('\n')
          ).catch(() => 'could not read DOM');
          console.log(`  ${date}: 0 tee times. DOM sample:\n    ${bodyPreview.replace(/\n/g, '\n    ')}`);
        }
      } catch (err) {
        console.warn(`  ${date} error: ${err.message}`);
      }
    }
  } catch (err) {
    console.error(`  Failed to load ${url}: ${err.message}`);
  } finally {
    await context.close();
  }

  return results;
}

function extractCpsTeeTimesFromJson(json) {
  // Common CPS JSON shapes
  const candidates = [
    json.tee_times, json.teeTimes, json.times, json.data,
    json.availableTimes, json.available_times,
    Array.isArray(json) ? json : null,
  ].filter(Boolean);

  for (const arr of candidates) {
    if (Array.isArray(arr) && arr.length > 0) {
      const first = arr[0];
      if (first.time || first.start_time || first.teeTime || first.TeeTime) {
        return arr.map(slot => ({
          time: to12Hour(slot.time || slot.start_time || slot.teeTime || slot.TeeTime),
          players: slot.available_spots || slot.availableSpots || slot.players || slot.maxPlayers || 4,
          price: slot.price != null
            ? (typeof slot.price === 'string' ? slot.price : `$${(slot.price / 100).toFixed(2)}`)
            : null,
          holes: slot.holes || slot.nb_holes || 18,
          booking_url: slot.booking_url || slot.bookingUrl || null,
        }));
      }
    }
  }
  return [];
}

async function extractCpsTeeTimesFromDom(page, date, course) {
  return page.evaluate(({ date, courseName, defaultHoles }) => {
    const results = [];

    // Try common CSS patterns for tee time slots
    const selectors = [
      '[class*="tee-time"]',
      '[class*="teeTime"]',
      '[class*="time-slot"]',
      '[class*="timeSlot"]',
      '[data-time]',
      '[class*="booking-item"]',
      '[class*="available"]',
      '[class*="reservation"]',
    ];

    let slots = [];
    for (const sel of selectors) {
      const found = document.querySelectorAll(sel);
      if (found.length > 0) { slots = Array.from(found); break; }
    }

    for (const slot of slots) {
      const text = slot.innerText || slot.textContent || '';
      const timeMatch = text.match(/\b(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm))\b/);
      if (!timeMatch) continue;

      const priceMatch = text.match(/\$[\d.]+/);
      const playerMatch = text.match(/(\d)\s*(?:player|spot|golfer)/i);

      results.push({
        course: courseName,
        date,
        time: timeMatch[1],
        players: playerMatch ? parseInt(playerMatch[1]) : 4,
        price: priceMatch ? priceMatch[0] : null,
        holes: defaultHoles || 18,
        booking_url: null,
        source: 'cps',
      });
    }

    return results;
  }, { date, courseName: course.name, defaultHoles: course.holes || 18 });
}

function extractDateFromUrl(url) {
  const match = url.match(/[?&]date=(\d{4}-\d{2}-\d{2})/) ||
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

// ── Chronogolf Scraper (Playwright) ──────────────────────────────────────────
//
// Chronogolf pages (https://www.chronogolf.com/club/{slug}) are React SPAs.
// We intercept the internal tee sheet API responses.

async function scrapeChronogolfWithPlaywright(course, dates, browser) {
  const results = [];
  const url = `https://www.chronogolf.com/club/${course.chronogolfSlug}`;
  console.log(`  Opening ${url}`);

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    },
  });
  const page = await context.newPage();

  // Intercept Chronogolf tee sheet API
  const interceptedByDate = new Map();
  page.on('response', async (response) => {
    const resUrl = response.url();
    if (!resUrl.includes('chronogolf.com') && !resUrl.includes('teesheet')) return;
    if (!response.headers()['content-type']?.includes('json')) return;
    try {
      const json = await response.json();
      const times = extractChronogolfTeeTimes(json);
      if (times.length > 0) {
        const date = extractDateFromUrl(resUrl) || extractDateFromJson(json);
        if (date) interceptedByDate.set(date, times);
      }
    } catch { /* ignore */ }
  });

  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const status = resp?.status();
    console.log(`  HTTP ${status}`);

    if (status === 403 || status === 404) {
      console.log(`  Course not accessible at this URL — may need different slug or auth`);
      return results;
    }

    await sleep(2000);

    for (const date of dates) {
      try {
        // Navigate with date in query param
        const dateUrl = `${url}?date=${date}`;
        interceptedByDate.delete(date);

        await page.goto(dateUrl, { waitUntil: 'networkidle', timeout: 20000 });
        await sleep(2000);

        if (interceptedByDate.has(date)) {
          const times = interceptedByDate.get(date).map(t => ({
            ...t,
            course: course.name,
            date,
            source: 'chronogolf',
          }));
          results.push(...times);
          console.log(`  ${date}: ${times.length} tee times (API intercept)`);
        } else {
          // DOM extraction fallback
          const domTimes = await extractChronogolfTeeTimesFromDom(page, date, course);
          if (domTimes.length > 0) {
            results.push(...domTimes);
            console.log(`  ${date}: ${domTimes.length} tee times (DOM)`);
          } else {
            console.log(`  ${date}: 0 tee times`);
          }
        }
      } catch (err) {
        console.warn(`  ${date} error: ${err.message}`);
      }
    }
  } catch (err) {
    console.error(`  Failed to load ${url}: ${err.message}`);
  } finally {
    await context.close();
  }

  return results;
}

function extractChronogolfTeeTimes(json) {
  // Chronogolf API shapes
  const candidates = [
    json.tee_times, json.teeTimes, json.available_tee_times,
    json.data?.tee_times, json.data,
    Array.isArray(json) ? json : null,
  ].filter(Boolean);

  for (const arr of candidates) {
    if (Array.isArray(arr) && arr.length > 0) {
      const first = arr[0];
      if (first.time || first.start_time || first.tee_time) {
        return arr.map(slot => ({
          time: to12Hour(slot.time || slot.start_time || slot.tee_time),
          players: slot.max_players || slot.nb_players || slot.players || 4,
          price: slot.price != null
            ? (typeof slot.price === 'number' && slot.price > 100
                ? `$${(slot.price / 100).toFixed(2)}` // cents
                : `$${Number(slot.price).toFixed(2)}`)
            : null,
          holes: slot.nb_holes || slot.holes || 18,
          booking_url: slot.booking_url || slot.url || null,
        }));
      }
    }
  }
  return [];
}

function extractDateFromJson(json) {
  // Look for date in JSON response
  const d = json.date || json.booking_date || json.selected_date || json.data?.date;
  if (d && /\d{4}-\d{2}-\d{2}/.test(d)) return d;
  return null;
}

async function extractChronogolfTeeTimesFromDom(page, date, course) {
  return page.evaluate(({ date, courseName }) => {
    const results = [];
    const selectors = [
      '[class*="tee-time"]', '[class*="teeTime"]',
      '[class*="slot"]', '[class*="booking"]',
      '[class*="available"]', '[class*="time-block"]',
    ];
    let slots = [];
    for (const sel of selectors) {
      const found = document.querySelectorAll(sel);
      if (found.length > 0) { slots = Array.from(found); break; }
    }
    for (const slot of slots) {
      const text = slot.innerText || '';
      const timeMatch = text.match(/\b(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm))\b/);
      if (!timeMatch) continue;
      const priceMatch = text.match(/\$[\d.]+/);
      const playerMatch = text.match(/(\d)\s*(?:player|golfer|people)/i);
      results.push({
        course: courseName,
        date,
        time: timeMatch[1],
        players: playerMatch ? parseInt(playerMatch[1]) : 4,
        price: priceMatch ? priceMatch[0] : null,
        holes: 18,
        booking_url: null,
        source: 'chronogolf',
      });
    }
    return results;
  }, { date, courseName: course.name });
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
          times = await scrapeCpsWithPlaywright(course, dates, browser);
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
