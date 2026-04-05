#!/usr/bin/env node
/**
 * run-scrape.mjs — TeeDrop scraper
 *
 * Speed design:
 *   - Chronogolf: fetch session cookie ONCE per course, reuse for all dates
 *   - GolfNow: server-side API (returns empty from GH Actions / non-browser, works from Chester)
 *   - Ingest: bulk operations in the API (3 queries flat, not per-record)
 *   - Parallel: process up to CONCURRENCY courses simultaneously
 *
 * Env vars:
 *   INGEST_URL    — defaults to production Vercel URL
 *   INGEST_SECRET — defaults to 'teedrop-ingest-2026'
 */

import { COURSES } from '../lib/courses.js';

const INGEST_URL = process.env.INGEST_URL || 'https://teedrop-bryceclausen-3337s-projects.vercel.app/api/ingest';
const INGEST_SECRET = process.env.INGEST_SECRET || 'teedrop-ingest-2026';
const DAYS_AHEAD = 14;
const CONCURRENCY = 3;  // courses scraped in parallel

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
  if (timeStr.includes('AM') || timeStr.includes('PM')) return timeStr;
  if (timeStr.includes('T')) {
    const d = new Date(timeStr);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }
  const [h, m] = timeStr.split(':').map(Number);
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

// ── Session cookie (one per course, reused across all dates) ──────────────────

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

// ── Chronogolf scraper ────────────────────────────────────────────────────────

async function scrapeChronogolfDate(course, date, cookie) {
  const url = `https://www.chronogolf.com/marketplace/clubs/${course.chronogolfSlug}/teetimes`
    + `?date=${date}&nb_holes=18&affiliation_type_ids=${course.affiliationTypeId}`;
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
        holes: s.nb_holes || 18,
        bookingUrl: `${course.bookingUrl}#date=${date}`,
        source: 'chronogolf',
      }));

    process.stdout.write(`  ${date}: ${teeTimes.length} times\n`);
    return teeTimes;
  } catch (err) {
    process.stdout.write(`  ${date}: error — ${err.message}\n`);
    return [];
  }
}

async function scrapeChronogolf(course, dates) {
  if (!course.affiliationTypeId) return [];

  process.stdout.write(`\n[${course.name}] fetching session cookie...\n`);
  const cookie = await getChronogolfCookie(course.chronogolfSlug);

  const teeTimes = [];
  for (const date of dates) {
    const results = await scrapeChronogolfDate(course, date, cookie);
    teeTimes.push(...results);
    if (results.length > 0) await ingest(results);
    await delay(350);  // gentle pacing — cookie already obtained
  }
  return teeTimes;
}

// ── GolfNow scraper ───────────────────────────────────────────────────────────

async function scrapeGolfNow(course, dates) {
  if (!course.golfnowId) return [];
  process.stdout.write(`\n[${course.name}] GolfNow\n`);
  const teeTimes = [];

  for (const date of dates) {
    try {
      const res = await fetch('https://www.golfnow.com/api/tee-times/tee-time-results', {
        method: 'POST',
        headers: {
          'User-Agent': UA,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Referer': `https://www.golfnow.com/tee-times/facility/${course.golfnowId}/search`,
          'Origin': 'https://www.golfnow.com',
        },
        body: JSON.stringify({
          FacilityId: parseInt(course.golfnowId),
          Date: date, Players: 1, Holes: 0,
          PriceMin: 0, PriceMax: 10000,
          SortBy: 'Date', SortByRollup: 'Date',
          View: 'Grouping', ExcludeFeaturedDeals: false,
        }),
        signal: AbortSignal.timeout(12000),
      });

      if (!res.ok) { process.stdout.write(`  ${date}: HTTP ${res.status}\n`); continue; }

      const data = await res.json();
      const list = data?.ttResults?.teeTimes || data?.TeeTimeResults || data?.results || [];

      const batch = list.map(tt => {
        const rates = tt.Rates || tt.rates || [];
        const price = rates[0]?.DisplayRate || tt.DisplayRate || tt.Price || '';
        return {
          course: course.name,
          date,
          time: formatTime(tt.Time || tt.time || tt.StartTime || ''),
          players: tt.PlayerRule?.MaxPlayers || tt.MaxPlayers || 4,
          price: typeof price === 'number' ? `$${price.toFixed(2)}` : (price || 'N/A'),
          holes: tt.Holes || tt.holes || 18,
          bookingUrl: `${course.bookingUrl}#date=${date}`,
          source: 'golfnow',
        };
      }).filter(tt => tt.time);

      process.stdout.write(`  ${date}: ${batch.length} times\n`);
      if (batch.length > 0) {
        teeTimes.push(...batch);
        await ingest(batch);
      }
    } catch (err) {
      process.stdout.write(`  ${date}: error — ${err.message}\n`);
    }
    await delay(300);
  }
  return teeTimes;
}

// ── Ingest POST ───────────────────────────────────────────────────────────────
// Ingest API now uses bulk ops (3 queries flat), so no chunking needed here.

async function ingest(teeTimes) {
  if (teeTimes.length === 0) return;
  const url = `${INGEST_URL}${INGEST_URL.includes('?') ? '&' : '?'}secret=${INGEST_SECRET}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teeTimes }),
      signal: AbortSignal.timeout(20000),
    });
    const data = await res.json();
    process.stdout.write(`  → ingest ${res.status}: ${data.inserted ?? '?'} saved, ${data.newForAlerts ?? 0} new\n`);
  } catch (err) {
    process.stdout.write(`  → ingest error: ${err.message}\n`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function processCourse(course, dates) {
  if (course.bookingSystem === 'chronogolf') {
    return scrapeChronogolf(course, dates);
  } else if (course.bookingSystem === 'golfnow') {
    return scrapeGolfNow(course, dates);
  } else {
    process.stdout.write(`\n[${course.name}] CPS — skipped (needs Chester/Playwright)\n`);
    return [];
  }
}

async function main() {
  const dates = getDateRange(DAYS_AHEAD);
  const start = Date.now();
  console.log(`TeeDrop scraper — ${dates.length} days × ${COURSES.length} courses (concurrency: ${CONCURRENCY})`);
  console.log(`Ingest: ${INGEST_URL}\n`);

  let total = 0;
  const results = await withConcurrency(COURSES, CONCURRENCY, async course => {
    const found = await processCourse(course, dates);
    total += found.length;
    return found.length;
  });

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n✓ Done in ${elapsed}s — ${total} tee times across ${COURSES.length} courses`);
}

main().catch(e => { console.error(e); process.exit(1); });
