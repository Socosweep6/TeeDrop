/**
 * TeeDrop Cloud Scraper
 * Runs in GitHub Actions every 15 minutes.
 * Scrapes tee times from Chronogolf, CPS (Premier Golf), and GolfNow.
 * POSTs results to /api/ingest.
 *
 * Booking systems covered:
 *   chronogolf — Seattle city courses, Oki Golf network, Chambers Bay
 *   cps        — Interbay, Legion Memorial, Bellevue (Premier Golf platform)
 *   golfnow    — Various (requires GOLFNOW_API_KEY when available)
 */

const INGEST_URL = process.env.INGEST_URL;
const INGEST_SECRET = process.env.INGEST_SECRET || 'teedrop-ingest-2026';
const GOLFNOW_API_KEY = process.env.GOLFNOW_API_KEY || null;

if (!INGEST_URL) {
  console.error('ERROR: INGEST_URL environment variable is required');
  process.exit(1);
}

// ── Course list (mirrors lib/courses.js) ─────────────────────────────────────
// Keep in sync with lib/courses.js. Using a local copy so the scraper is
// a self-contained Node.js script (no Next.js imports needed).

const COURSES = [
  // Seattle City
  { name: 'Jackson Park Golf Course', bookingSystem: 'chronogolf', chronogolfSlug: 'jackson-park-golf-club-washington' },
  { name: 'Jefferson Park Golf Course', bookingSystem: 'chronogolf', chronogolfSlug: 'jefferson-park-golf-course' },
  { name: 'West Seattle Golf Course', bookingSystem: 'chronogolf', chronogolfSlug: 'west-seattle-golf-course' },
  { name: 'Interbay Golf Center', bookingSystem: 'cps', cpsSlug: 'interbay-golf-center', holes: 9 },
  // North
  { name: 'Legion Memorial Golf Course', bookingSystem: 'cps', cpsSlug: 'legion-memorial-golf-course' },
  { name: 'Walter E. Hall Memorial Golf Course', bookingSystem: 'golfnow', golfnowId: '4726' },
  { name: 'Harbour Pointe Golf Club', bookingSystem: 'chronogolf', chronogolfSlug: 'harbour-pointe-golf-club' },
  { name: 'Battle Creek Golf Course', bookingSystem: 'golfnow', golfnowId: '1679' },
  // Eastside
  { name: 'Bellevue Golf Course', bookingSystem: 'cps', cpsSlug: 'bellevue-golf-course' },
  { name: 'Willows Run Golf Complex', bookingSystem: 'golfnow', golfnowId: '7422' },
  { name: 'Redmond Ridge Golf Course', bookingSystem: 'chronogolf', chronogolfSlug: 'redmond-ridge-golf-course' },
  { name: 'Golf Club at Newcastle', bookingSystem: 'chronogolf', chronogolfSlug: 'golf-club-at-newcastle' },
  { name: 'Snoqualmie Falls Golf Course', bookingSystem: 'golfnow', golfnowId: '5555' },
  { name: 'Tall Chief Golf Course', bookingSystem: 'golfnow', golfnowId: '7093' },
  // South
  { name: 'Foster Golf Links', bookingSystem: 'golfnow', golfnowId: '4153' },
  { name: 'Riverbend Golf Complex', bookingSystem: 'golfnow', golfnowId: '4154' },
  { name: 'Maplewood Golf Course', bookingSystem: 'golfnow', golfnowId: '6607' },
  { name: 'Washington National Golf Club', bookingSystem: 'chronogolf', chronogolfSlug: 'washington-national-golf-club' },
  { name: 'Auburn Golf Course', bookingSystem: 'golfnow', golfnowId: '1244' },
  { name: 'Druids Glen Golf Course', bookingSystem: 'golfnow', golfnowId: '19498' },
  { name: 'Trophy Lake Golf & Casting', bookingSystem: 'chronogolf', chronogolfSlug: 'trophy-lake-golf-casting' },
  { name: 'Madrona Links Golf Course', bookingSystem: 'golfnow', golfnowId: '4908' },
  { name: 'Chambers Bay', bookingSystem: 'chronogolf', chronogolfSlug: 'chambers-bay-golf-club' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns the next N days as YYYY-MM-DD strings, starting tomorrow. */
function getDateRange(days = 14) {
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
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Chronogolf scraper ────────────────────────────────────────────────────────

/**
 * Fetch available tee times from Chronogolf for a single course + date.
 * Uses their public booking widget API.
 * Returns array of tee time objects.
 */
async function fetchChronogolfDay(slug, date, players = 1) {
  // Chronogolf booking widget API endpoint
  const url = `https://www.chronogolf.com/club/${slug}/tee_times.json?date=${date}&nb_players=${players}&nb_holes=18`;
  const headers = {
    'Accept': 'application/json',
    'User-Agent': 'Mozilla/5.0 (compatible; TeeDrop/1.0)',
    'Referer': `https://www.chronogolf.com/club/${slug}`,
  };

  const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });

  if (res.status === 404) return []; // Course not found on Chronogolf with this slug
  if (!res.ok) {
    console.warn(`  Chronogolf ${slug} ${date}: HTTP ${res.status}`);
    return [];
  }

  let data;
  try {
    data = await res.json();
  } catch {
    return [];
  }

  // Chronogolf returns { tee_times: [...] } or an array directly
  const slots = Array.isArray(data) ? data : (data.tee_times || data.teeTimes || []);

  return slots.map(slot => ({
    course: null, // filled by caller
    date,
    time: formatChronogolfTime(slot.time || slot.start_time || slot.tee_time),
    players: slot.max_players || slot.players || 4,
    price: slot.price != null ? `$${(slot.price / 100).toFixed(2)}` : null,
    holes: slot.nb_holes || 18,
    booking_url: slot.booking_url || slot.url || `https://www.chronogolf.com/club/${slug}#date=${date}`,
    source: 'chronogolf',
  }));
}

function formatChronogolfTime(raw) {
  if (!raw) return null;
  // Chronogolf times come as "HH:MM" (24h) — convert to "H:MM AM/PM"
  if (/^\d{2}:\d{2}$/.test(raw)) {
    const [h, m] = raw.split(':').map(Number);
    const suffix = h >= 12 ? 'PM' : 'AM';
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
  }
  return raw;
}

async function scrapeChronogolf(course, dates) {
  const results = [];
  for (const date of dates) {
    try {
      const times = await fetchChronogolfDay(course.chronogolfSlug, date);
      for (const t of times) {
        results.push({ ...t, course: course.name });
      }
    } catch (err) {
      console.warn(`  Chronogolf ${course.name} ${date}: ${err.message}`);
    }
    await sleep(300); // polite delay
  }
  return results;
}

// ── CPS (Premier Golf) scraper ────────────────────────────────────────────────

/**
 * CPS (Club Propulsion Services) is the platform used by Seattle Parks Golf,
 * Bellevue Golf Course, and Legion Memorial.
 *
 * Their booking widget makes XHR calls to an internal API. We try the most
 * common endpoint pattern here. If the CPS API format changes, update this.
 */
async function fetchCpsDay(slug, date, players = 1) {
  // CPS API — common endpoint pattern for their booking widget
  const url = `https://premiergolf.cps.golf/api/booking/tee-times?facility=${encodeURIComponent(slug)}&date=${date}&players=${players}`;
  const headers = {
    'Accept': 'application/json',
    'User-Agent': 'Mozilla/5.0 (compatible; TeeDrop/1.0)',
    'Referer': `https://premiergolf.cps.golf/reserve/${slug}`,
    'X-Requested-With': 'XMLHttpRequest',
  };

  const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });

  if (!res.ok) {
    // Try alternate endpoint format
    const url2 = `https://premiergolf.cps.golf/tee-times/${slug}?date=${date}&players=${players}&format=json`;
    const res2 = await fetch(url2, { headers, signal: AbortSignal.timeout(15000) });
    if (!res2.ok) {
      console.warn(`  CPS ${slug} ${date}: HTTP ${res.status} / ${res2.status} — may need endpoint update`);
      return [];
    }
    return parseCpsResponse(await res2.json(), slug, date);
  }

  return parseCpsResponse(await res.json(), slug, date);
}

function parseCpsResponse(data, slug, date) {
  // CPS response shape varies — try common patterns
  const slots = data.tee_times || data.teeTimes || data.times || data.data || (Array.isArray(data) ? data : []);
  return slots.map(slot => ({
    course: null,
    date,
    time: formatChronogolfTime(slot.time || slot.start_time || slot.teeTime),
    players: slot.available_spots || slot.players || slot.max_players || 4,
    price: slot.price != null ? (typeof slot.price === 'string' ? slot.price : `$${(slot.price / 100).toFixed(2)}`) : null,
    holes: slot.holes || slot.nb_holes || 18,
    booking_url: slot.booking_url || `https://premiergolf.cps.golf/reserve/${slug}`,
    source: 'cps',
  }));
}

async function scrapeCps(course, dates) {
  const results = [];
  for (const date of dates) {
    try {
      const times = await fetchCpsDay(course.cpsSlug, date);
      for (const t of times) {
        results.push({ ...t, course: course.name });
      }
    } catch (err) {
      console.warn(`  CPS ${course.name} ${date}: ${err.message}`);
    }
    await sleep(400);
  }
  return results;
}

// ── GolfNow scraper ───────────────────────────────────────────────────────────

/**
 * GolfNow requires an API key for their partner API.
 * When GOLFNOW_API_KEY is available, this will use their tee time search API.
 * Until then, GolfNow courses are skipped and logged.
 */
async function fetchGolfNowDay(facilityId, date, players = 1) {
  if (!GOLFNOW_API_KEY) {
    return null; // Signal "skipped" vs empty result
  }

  const url = `https://api.golfnow.com/v1/tee-times/search?facilityId=${facilityId}&date=${date}&players=${players}&time=all`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${GOLFNOW_API_KEY}`,
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    console.warn(`  GolfNow facility ${facilityId} ${date}: HTTP ${res.status}`);
    return [];
  }

  const data = await res.json();
  const slots = data.tee_times || data.teeTimes || data.results || [];

  return slots.map(slot => ({
    course: null,
    date,
    time: slot.time || slot.start_time,
    players: slot.max_players || players,
    price: slot.price ? `$${slot.price.toFixed(2)}` : null,
    holes: slot.holes || 18,
    booking_url: slot.booking_url || `https://www.golfnow.com/tee-times/facility/${facilityId}#date=${date}`,
    source: 'golfnow',
  }));
}

async function scrapeGolfNow(course, dates) {
  if (!GOLFNOW_API_KEY) {
    console.log(`  GolfNow [SKIP] ${course.name} — no GOLFNOW_API_KEY`);
    return [];
  }

  const results = [];
  for (const date of dates) {
    try {
      const times = await fetchGolfNowDay(course.golfnowId, date);
      if (times) {
        for (const t of times) {
          results.push({ ...t, course: course.name });
        }
      }
    } catch (err) {
      console.warn(`  GolfNow ${course.name} ${date}: ${err.message}`);
    }
    await sleep(300);
  }
  return results;
}

// ── POST to /api/ingest ───────────────────────────────────────────────────────

async function postToIngest(teeTimes) {
  if (teeTimes.length === 0) return { inserted: 0, skipped: 0 };

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
  const dates = getDateRange(14);
  console.log(`TeeDrop Scraper — ${new Date().toISOString()}`);
  console.log(`Scraping ${COURSES.length} courses × ${dates.length} days`);
  console.log(`Date range: ${dates[0]} → ${dates[dates.length - 1]}`);
  console.log(`Ingest URL: ${INGEST_URL}`);
  console.log('');

  const allTeeTimes = [];
  let chronogolfCount = 0;
  let cpsCount = 0;
  let golfnowCount = 0;
  let skippedCourses = 0;

  for (const course of COURSES) {
    console.log(`[${course.bookingSystem.toUpperCase()}] ${course.name}`);

    let times = [];
    try {
      if (course.bookingSystem === 'chronogolf') {
        times = await scrapeChronogolf(course, dates);
        chronogolfCount += times.length;
      } else if (course.bookingSystem === 'cps') {
        times = await scrapeCps(course, dates);
        cpsCount += times.length;
      } else if (course.bookingSystem === 'golfnow') {
        times = await scrapeGolfNow(course, dates);
        golfnowCount += times.length;
        if (!GOLFNOW_API_KEY) skippedCourses++;
      }
    } catch (err) {
      console.error(`  ERROR ${course.name}: ${err.message}`);
    }

    // Filter out slots with no time (parse failures)
    const valid = times.filter(t => t.course && t.date && t.time);
    console.log(`  → ${valid.length} tee times`);
    allTeeTimes.push(...valid);

    // Small pause between courses to avoid hammering servers
    await sleep(500);
  }

  console.log('');
  console.log(`Total scraped: ${allTeeTimes.length} tee times`);
  console.log(`  Chronogolf: ${chronogolfCount}`);
  console.log(`  CPS:        ${cpsCount}`);
  console.log(`  GolfNow:    ${golfnowCount} (${skippedCourses} courses skipped — no API key)`);
  console.log('');

  if (allTeeTimes.length === 0) {
    console.log('Nothing to ingest.');
    return;
  }

  // POST in batches of 200 to stay within Vercel's 4MB request limit
  const BATCH_SIZE = 200;
  let totalInserted = 0;
  let totalSkipped = 0;
  let totalAlerts = 0;

  for (let i = 0; i < allTeeTimes.length; i += BATCH_SIZE) {
    const batch = allTeeTimes.slice(i, i + BATCH_SIZE);
    console.log(`Posting batch ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} items)...`);
    try {
      const result = await postToIngest(batch);
      totalInserted += result.inserted || 0;
      totalSkipped += result.skipped || 0;
      totalAlerts += result.alertsSent || 0;
      console.log(`  inserted=${result.inserted} skipped=${result.skipped} alerts=${result.alertsSent}`);
    } catch (err) {
      console.error(`  Ingest batch failed: ${err.message}`);
    }
  }

  console.log('');
  console.log(`Done. inserted=${totalInserted} skipped=${totalSkipped} alerts=${totalAlerts}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
