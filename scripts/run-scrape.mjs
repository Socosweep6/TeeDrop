#!/usr/bin/env node
/**
 * run-scrape.js — GitHub Actions scraper runner
 *
 * Scrapes tee times for all courses and POSTs results to /api/ingest.
 * Run via: node scripts/run-scrape.js
 *
 * Required env vars:
 *   INGEST_URL    — https://your-site.vercel.app/api/ingest
 *   INGEST_SECRET — the secret key for the ingest API
 */

import { COURSES } from '../lib/courses.js';

const INGEST_URL = process.env.INGEST_URL || 'https://teedrop-bryceclausen-3337s-projects.vercel.app/api/ingest';
const INGEST_SECRET = process.env.INGEST_SECRET || 'teedrop-ingest-2026';
const DAYS_AHEAD = 14;
const PLAYERS = 4;

// ── Date helpers ──────────────────────────────────────────────────────────────

function getDateRange(days) {
  const dates = [];
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

function formatTime(timeStr) {
  if (!timeStr) return '';
  if (timeStr.includes('AM') || timeStr.includes('PM')) return timeStr;
  if (timeStr.includes('T')) {
    const d = new Date(timeStr);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
}

function formatChronogolfTime(timeStr) {
  if (!timeStr) return '';
  if (timeStr.includes('T')) {
    return new Date(timeStr).toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Los_Angeles',
    });
  }
  return formatTime(timeStr);
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── GolfNow scraper ───────────────────────────────────────────────────────────

async function scrapeGolfNow(course, date) {
  try {
    const res = await fetch('https://www.golfnow.com/api/tee-times/tee-time-results', {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Referer': `https://www.golfnow.com/tee-times/facility/${course.golfnowId}/search`,
        'Origin': 'https://www.golfnow.com',
      },
      body: JSON.stringify({
        FacilityId: parseInt(course.golfnowId),
        Date: date,
        Players: PLAYERS,
        Holes: 0,
        PriceMin: 0,
        PriceMax: 10000,
        SortBy: 'Date',
        SortByRollup: 'Date',
        View: 'Grouping',
        ExcludeFeaturedDeals: false,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      console.log(`  GolfNow ${course.name} (${date}): HTTP ${res.status}`);
      return [];
    }

    const data = await res.json();
    const results = data?.TeeTimeResults || data?.ttResults || data?.Results || data?.teeTimeResults || data?.results || [];
    const teeTimes = [];

    if (Array.isArray(results)) {
      for (const tt of results) {
        const time = tt.Time || tt.time || tt.teeTime || tt.StartTime || '';
        const rates = tt.Rates || tt.rates || [];
        const bestRate = rates[0];
        const price = bestRate?.DisplayRate || bestRate?.Price || tt.DisplayRate || tt.Price || tt.price || '';
        const holes = tt.Holes || tt.holes || 18;
        const spots = tt.PlayerRule?.MaxPlayers || tt.MaxPlayers || tt.maxPlayers || tt.AvailableSpots || PLAYERS;
        const timeStr = typeof time === 'string' ? time : '';

        if (timeStr) {
          teeTimes.push({
            course: course.name,
            date,
            time: formatTime(timeStr),
            players: spots,
            price: typeof price === 'number' ? `$${price.toFixed(2)}` :
                   (typeof price === 'string' && price) ? (price.startsWith('$') ? price : `$${price}`) : 'N/A',
            holes,
            bookingUrl: `${course.bookingUrl}#date=${date}`,
            source: 'golfnow',
          });
        }
      }
    }

    console.log(`  GolfNow ${course.name} (${date}): ${teeTimes.length} times`);
    return teeTimes;
  } catch (err) {
    console.log(`  GolfNow error ${course.name} (${date}): ${err.message}`);
    return [];
  }
}

// ── Chronogolf scraper ────────────────────────────────────────────────────────

async function scrapeChronogolf(course, date) {
  if (!course.chronogolfSlug) return [];
  // Skip courses with no online booking — they use CPS or another system
  if (!course.affiliationTypeId) return [];
  try {
    // First get a session cookie to pass Cloudflare
    let cookieStr = '';
    try {
      const pageRes = await fetch(`https://www.chronogolf.com/club/${course.chronogolfSlug}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
        },
        signal: AbortSignal.timeout(8000),
      });
      const rawCookies = pageRes.headers.get('set-cookie') || '';
      cookieStr = rawCookies.split(',').map(c => c.split(';')[0]).join('; ');
    } catch { /* continue without cookie */ }

    const url = `https://www.chronogolf.com/marketplace/clubs/${course.chronogolfSlug}/teetimes?date=${date}&nb_holes=18&affiliation_type_ids=${course.affiliationTypeId}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        'Cookie': cookieStr,
        'Referer': `https://www.chronogolf.com/club/${course.chronogolfSlug}`,
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.log(`  Chronogolf ${course.name} (${date}): HTTP ${res.status}`);
      return [];
    }

    const data = await res.json();
    const slots = data?.teetimes || data?.slots || (Array.isArray(data) ? data : []);
    const teeTimes = [];

    if (Array.isArray(slots)) {
      for (const slot of slots) {
        const time = slot.start_time || slot.time || slot.teetime || '';
        const price = slot.green_fee || slot.price || slot.rate || '';
        const spots = slot.available_spots || slot.spots || 4;

        if (time && spots >= PLAYERS) {
          teeTimes.push({
            course: course.name,
            date,
            time: formatChronogolfTime(time),
            players: spots,
            price: price ? `$${parseFloat(price).toFixed(2)}` : 'N/A',
            holes: slot.nb_holes || 18,
            bookingUrl: `${course.bookingUrl}#date=${date}`,
            source: 'chronogolf',
          });
        }
      }
    }

    console.log(`  Chronogolf ${course.name} (${date}): ${teeTimes.length} times`);
    return teeTimes;
  } catch (err) {
    console.log(`  Chronogolf error ${course.name} (${date}): ${err.message}`);
    return [];
  }
}

// ── Ingest POST ───────────────────────────────────────────────────────────────

async function ingest(teeTimes) {
  if (teeTimes.length === 0) return;
  const CHUNK = 15;  // keep each Vercel call under 30s
  const url = INGEST_URL.includes('?') ? `${INGEST_URL}&secret=${INGEST_SECRET}` : `${INGEST_URL}?secret=${INGEST_SECRET}`;
  for (let i = 0; i < teeTimes.length; i += CHUNK) {
    const chunk = teeTimes.slice(i, i + CHUNK);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teeTimes: chunk }),
        signal: AbortSignal.timeout(45000),
      });
      const data = await res.json();
      process.stdout.write(`  → Ingest [${i}–${i + chunk.length}]: ${res.status} (${data.inserted ?? '?'} inserted)\n`);
    } catch (err) {
      console.log(`  → Ingest error [${i}–${i + chunk.length}]: ${err.message}`);
    }
    await delay(200);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const dates = getDateRange(DAYS_AHEAD);
  console.log(`TeeDrop scraper — ${dates.length} days × ${COURSES.length} courses`);
  console.log(`Ingest URL: ${INGEST_URL}\n`);

  let totalFound = 0;
  let totalIngested = 0;

  for (const course of COURSES) {
    console.log(`\n[${course.name}]`);
    const batch = [];

    for (const date of dates) {
      let results = [];

      if (course.bookingSystem === 'chronogolf') {
        results = await scrapeChronogolf(course, date);
        if (results.length === 0 && course.golfnowId) {
          results = await scrapeGolfNow(course, date);
        }
      } else if (course.bookingSystem === 'golfnow') {
        results = await scrapeGolfNow(course, date);
      } else {
        // CPS — not yet supported, skip
        console.log(`  ${course.name} (${date}): CPS not yet supported, skipping`);
        continue;
      }

      if (results.length > 0) {
        // Ingest immediately per day-course to stay within Vercel's 30s limit
        await ingest(results);
        totalIngested += results.length;
      }
      batch.push(...results);
      totalFound += results.length;
      await delay(1200);  // generous delay to avoid Cloudflare rate limiting
    }

    await delay(500);
  }

  console.log(`\n✓ Done. Found ${totalFound} tee times, ingested ${totalIngested}.`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
