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

const INGEST_URL = process.env.INGEST_URL || 'https://web-xi-one-0b1g412w29.vercel.app/api/ingest';
const INGEST_SECRET = process.env.INGEST_SECRET || 'teedrop-ingest-2026';
const DAYS_AHEAD = 14;
const CONCURRENCY = 3;
const HEADLESS = process.env.HEADLESS !== 'false';

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
  const cookie = await getChronogolfCookie(course.chronogolfSlug);

  const teeTimes = [];
  for (const date of dates) {
    const results = await scrapeChronogolfDate(course, date, cookie);
    teeTimes.push(...results);
    if (results.length > 0) await ingest(results);
    await delay(350);
  }
  return teeTimes;
}

// ── GolfNow ───────────────────────────────────────────────────────────────────

async function scrapeGolfNow(course, dates) {
  process.stdout.write(`\n[${course.name}] GolfNow (ID: ${course.golfnowId})\n`);
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
          Date: date,
          Players: 1,    // 1 = show all slots regardless of group size
          Holes: 0,      // 0 = any
          PriceMin: 0,
          PriceMax: 10000,
          SortBy: 'Date',
          SortByRollup: 'Date',
          View: 'Grouping',
          ExcludeFeaturedDeals: false,
        }),
        signal: AbortSignal.timeout(12000),
      });

      if (!res.ok) {
        process.stdout.write(`  ${date}: HTTP ${res.status}\n`);
        await delay(300);
        continue;
      }

      const data = await res.json();
      // GolfNow API response structure varies — try all known paths
      const list = data?.ttResults?.teeTimes
        || data?.TeeTimeResults
        || data?.teeTimeResults
        || data?.results
        || data?.Results
        || [];

      const batch = list
        .map(tt => {
          const rates = tt.Rates || tt.rates || [];
          const price = rates[0]?.DisplayRate || tt.DisplayRate || tt.Price || tt.price || '';
          const timeStr = tt.Time || tt.time || tt.StartTime || tt.startTime || '';
          return {
            course: course.name,
            date,
            time: formatTime(timeStr),
            players: tt.PlayerRule?.MaxPlayers || tt.MaxPlayers || tt.maxPlayers || 4,
            price: typeof price === 'number'
              ? `$${price.toFixed(2)}`
              : (String(price).startsWith('$') ? String(price) : price ? `$${price}` : 'N/A'),
            holes: tt.Holes || tt.holes || course.holes || 18,
            bookingUrl: `${course.bookingUrl}#date=${date}`,
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
    await delay(300);
  }
  return teeTimes;
}

// ── CPS (Premier Golf) — Playwright ──────────────────────────────────────────

let playwrightAvailable = null;

async function checkPlaywright() {
  if (playwrightAvailable !== null) return playwrightAvailable;
  try {
    await import('playwright');
    playwrightAvailable = true;
  } catch {
    playwrightAvailable = false;
    console.log('\n⚠️  Playwright not installed. CPS courses will be skipped.');
    console.log('   To enable: npm install playwright && npx playwright install chromium\n');
  }
  return playwrightAvailable;
}

async function scrapeCPSDate(page, course, date) {
  const url = `https://premiergolf.cps.golf/reserve/${course.cpsSlug}?date=${date}`;
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });

    // Wait for tee time content — CPS renders a React app
    // Try multiple possible selectors for robustness
    const loaded = await Promise.race([
      page.waitForSelector('[class*="tee-time"], [class*="teetime"], .time-slot, [data-testid*="tee"]', { timeout: 8000 }).then(() => true),
      page.waitForSelector('table tr td', { timeout: 8000 }).then(() => true),
      page.waitForSelector('[class*="reservation"], [class*="booking"]', { timeout: 8000 }).then(() => true),
      new Promise(r => setTimeout(() => r(false), 9000)),
    ]);

    if (!loaded) {
      process.stdout.write(`  ${date}: no tee time elements found\n`);
      return [];
    }

    const times = await page.evaluate((courseName, dateStr) => {
      const results = [];

      // Strategy 1: look for tee-time specific elements
      const teeSelectors = [
        '[class*="tee-time"]',
        '[class*="teetime"]',
        '[class*="TeeTime"]',
        '.time-slot',
        '.tee-slot',
        '[data-testid*="tee"]',
      ];

      for (const sel of teeSelectors) {
        const els = document.querySelectorAll(sel);
        if (els.length > 0) {
          els.forEach(el => {
            const timeEl = el.querySelector('[class*="time"], time, [class*="hour"]');
            const priceEl = el.querySelector('[class*="price"], [class*="rate"], [class*="fee"], [class*="cost"]');
            const playerEl = el.querySelector('[class*="player"], [class*="spot"], [class*="avail"]');

            const timeText = timeEl?.textContent?.trim()
              || el.getAttribute('data-time')
              || el.getAttribute('data-start');

            if (timeText && /\d+:\d+/.test(timeText)) {
              results.push({
                time: timeText,
                price: priceEl?.textContent?.trim()?.replace(/[^\d.$]/g, '') || 'N/A',
                players: parseInt(playerEl?.textContent?.match(/\d+/)?.[0] || '4') || 4,
              });
            }
          });
          if (results.length > 0) return results;
        }
      }

      // Strategy 2: look in tables (common for booking sites)
      const rows = document.querySelectorAll('table tr');
      rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 2) {
          const firstCell = cells[0]?.textContent?.trim();
          if (firstCell && /\d+:\d+\s*(AM|PM)/i.test(firstCell)) {
            results.push({
              time: firstCell,
              price: cells[2]?.textContent?.trim() || cells[1]?.textContent?.trim() || 'N/A',
              players: 4,
            });
          }
        }
      });

      return results;
    }, course.name, date);

    process.stdout.write(`  ${date}: ${times.length} times\n`);

    return times.map(t => ({
      course: course.name,
      date,
      time: t.time,
      players: t.players || 4,
      price: t.price?.startsWith('$') ? t.price : (t.price && t.price !== 'N/A' ? `$${t.price}` : 'N/A'),
      holes: course.holes || 18,
      bookingUrl: `${course.bookingUrl}?date=${date}`,
      source: 'cps',
    }));
  } catch (err) {
    process.stdout.write(`  ${date}: error — ${err.message}\n`);
    return [];
  }
}

async function scrapeCPS(course, dates) {
  if (!course.cpsSlug) return [];
  if (!await checkPlaywright()) return [];

  process.stdout.write(`\n[${course.name}] CPS/Playwright\n`);

  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext({ userAgent: UA, viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  // Block images/fonts/media for speed
  await page.route('**/*.{png,jpg,jpeg,gif,svg,woff,woff2,mp4,webm}', r => r.abort());

  const teeTimes = [];
  try {
    for (const date of dates) {
      const results = await scrapeCPSDate(page, course, date);
      teeTimes.push(...results);
      if (results.length > 0) await ingest(results);
      await delay(600);
    }
  } finally {
    await browser.close();
  }
  return teeTimes;
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

  // CPS — sequential with Playwright (browser startup overhead)
  for (const course of cpsCourses) {
    const found = await processCourse(course, dates);
    total += found.length;
    await delay(1000);
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n✓ Done in ${elapsed}s — ${total} tee times found`);
}

main().catch(e => { console.error(e); process.exit(1); });
