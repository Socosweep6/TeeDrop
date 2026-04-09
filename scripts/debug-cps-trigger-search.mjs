#!/usr/bin/env node
/**
 * Trigger a real tee time search via Playwright form interaction.
 * Fresh browser context (no stored session) navigates to the search page,
 * fills in course + date, clicks search, intercepts the resulting API call.
 *
 * Run: node scripts/debug-cps-trigger-search.mjs
 */

import { mkdir, writeFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const artifactsDir = join(__dir, 'cps-artifacts');
await mkdir(artifactsDir, { recursive: true });

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const capturedSearchCalls = [];
const allApiCalls = [];

const { chromium } = await import('playwright');
const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

// Fresh context — no stored session, no cookies
const context = await browser.newContext({ userAgent: UA });
await context.clearCookies();
const page = await context.newPage();

// Capture ALL network traffic
page.on('request', req => {
  const url = req.url();
  if (!url.includes('cps.golf') && !url.includes('premiergolf')) return;
  if (url.includes('.js') || url.includes('.css') || url.includes('.woff') || url.includes('.png')) return;
  const entry = {
    ts: Date.now(),
    method: req.method(),
    url,
    headers: req.headers(),
    postData: req.postData() || null,
  };
  allApiCalls.push(entry);

  const isSearch = url.includes('SearchTee') || url.includes('Teesheet') || url.includes('TeeSheet') ||
    url.includes('teetime') || url.includes('Teetime') || url.includes('search') ||
    url.includes('GroupBooking') || url.includes('Booking') || url.includes('FetchTee');
  if (isSearch) capturedSearchCalls.push(entry);

  console.log(`REQ ${req.method()} ${url}`);
  if (entry.postData) console.log(`  body: ${entry.postData.slice(0, 300)}`);
});

page.on('response', async resp => {
  const url = resp.url();
  if (!url.includes('cps.golf') && !url.includes('premiergolf')) return;
  if (url.includes('.js') || url.includes('.css') || url.includes('.woff') || url.includes('.png')) return;
  const body = await resp.text().catch(() => '');
  const status = resp.status();

  const isSearch = url.includes('SearchTee') || url.includes('Teesheet') || url.includes('TeeSheet') ||
    url.includes('teetime') || url.includes('Teetime') || url.includes('search') ||
    url.includes('GroupBooking') || url.includes('Booking') || url.includes('FetchTee');
  if (isSearch || status !== 200) {
    console.log(`RESP ${status} ${url}`);
    if (body) console.log(`  body: ${body.slice(0, 300)}`);
  }
});

// Target date: one week from now (likely to have availability)
const targetDate = new Date();
targetDate.setDate(targetDate.getDate() + 7);
const yyyy = targetDate.getFullYear();
const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
const dd = String(targetDate.getDate()).padStart(2, '0');
const dateStr = `${yyyy}-${mm}-${dd}`; // ISO format for query param
const dateDisplay = `${mm}/${dd}/${yyyy}`; // US format for display

console.log(`\nTarget date: ${dateStr}\n`);

// Navigate to search-teetime with query params to pre-fill the form
// The Angular router reads searchDate and courseId from query params (found in bundle)
console.log('=== Attempt 1: Navigate with query params ===');
await page.goto(
  `https://premiergolf.cps.golf/onlineresweb/search-teetime/premiergolf?courseId=3&searchDate=${dateStr}&player=1&hole=18`,
  { waitUntil: 'networkidle', timeout: 30000 }
).catch(e => console.log('nav error:', e.message));

console.log(`URL: ${page.url()}`);
await new Promise(r => setTimeout(r, 3000));

// Check what's on the page
const title = await page.title().catch(() => '');
console.log(`Title: ${title}`);

// Look for Angular app state / data
const angularState = await page.evaluate(() => {
  // Check if search was triggered
  return {
    url: window.location.href,
    localStorageKeys: Object.keys(localStorage),
    hasAngularApp: !!document.querySelector('app-root'),
  };
}).catch(() => ({}));
console.log('Angular state:', JSON.stringify(angularState));

// Wait for lazy chunks to load
await new Promise(r => setTimeout(r, 5000));

// If no search call happened yet, try to interact with the form
if (capturedSearchCalls.length === 0) {
  console.log('\nNo search call yet — attempting form interaction...');

  // Look for any clickable search/submit buttons
  const buttons = await page.$$eval('button, [type="submit"], mat-button, [mat-raised-button]', els =>
    els.map(e => ({ text: e.textContent?.trim(), type: e.type, disabled: e.disabled, class: e.className }))
  ).catch(() => []);
  console.log('Buttons found:', JSON.stringify(buttons.slice(0, 10)));

  // Look for input fields
  const inputs = await page.$$eval('input, select, mat-select', els =>
    els.map(e => ({ name: e.name, type: e.type, placeholder: e.placeholder, value: e.value, class: e.className?.slice?.(0, 50) }))
  ).catch(() => []);
  console.log('Inputs found:', JSON.stringify(inputs.slice(0, 10)));

  // Try clicking any search or submit button
  const searchBtn = await page.$('button:has-text("Search"), button:has-text("Find"), [type="submit"]').catch(() => null);
  if (searchBtn) {
    console.log('Found search button, clicking...');
    await searchBtn.click().catch(e => console.log('click error:', e.message));
    await new Promise(r => setTimeout(r, 3000));
  }

  // Try mat-select for course
  const matSelect = await page.$('mat-select').catch(() => null);
  if (matSelect) {
    console.log('Found mat-select, trying to interact...');
    await matSelect.click().catch(() => {});
    await new Promise(r => setTimeout(r, 1000));
    const options = await page.$$('mat-option').catch(() => []);
    console.log(`mat-option count: ${options.length}`);
    if (options.length > 0) {
      await options[0].click().catch(() => {});
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

// Wait more for any triggered calls
await new Promise(r => setTimeout(r, 5000));

// Try navigating to the reserve page directly (different SPA entry point)
if (capturedSearchCalls.length === 0) {
  console.log('\n=== Attempt 2: Reserve page for Jackson Park ===');
  await page.goto(
    `https://premiergolf.cps.golf/reserve/jackson-park-golf-course?date=${dateStr}`,
    { waitUntil: 'networkidle', timeout: 20000 }
  ).catch(e => console.log('nav error:', e.message));
  await new Promise(r => setTimeout(r, 5000));
  console.log(`URL: ${page.url()}`);
}

// Try the onlineresweb path directly
if (capturedSearchCalls.length === 0) {
  console.log('\n=== Attempt 3: Direct onlineresweb path ===');
  await page.goto(
    `https://premiergolf.cps.golf/onlineresweb/search-teetime/premiergolf`,
    { waitUntil: 'networkidle', timeout: 20000 }
  ).catch(e => console.log('nav error:', e.message));
  await new Promise(r => setTimeout(r, 5000));

  // Try evaluating Angular store dispatch directly
  console.log('Attempting to dispatch Angular store action via JS...');
  await page.evaluate(() => {
    // Try to find Angular's global ng object
    const appRoot = document.querySelector('app-root');
    if (appRoot) {
      const ngCtx = window.ng?.getComponent?.(appRoot);
      console.log('Angular component:', !!ngCtx);
    }
  }).catch(() => {});
}

// Final wait
await new Promise(r => setTimeout(r, 3000));

// ── Summary ───────────────────────────────────────────────────────────────────

console.log('\n=== RESULTS ===');
console.log(`Total API calls captured: ${allApiCalls.length}`);
console.log(`Search calls captured: ${capturedSearchCalls.length}`);

if (capturedSearchCalls.length > 0) {
  console.log('\nSEARCH CALLS:');
  for (const c of capturedSearchCalls) {
    console.log(`  ${c.method} ${c.url}`);
    if (c.postData) console.log(`    body: ${c.postData}`);
    console.log(`    headers: ${JSON.stringify(Object.fromEntries(Object.entries(c.headers).filter(([k]) => k.match(/auth|component|content|x-/i))))}`);
  }
} else {
  console.log('\nNo search calls captured. Listing all API calls:');
  for (const c of allApiCalls) console.log(`  ${c.method} ${c.url}`);
}

// Save everything
await writeFile(join(artifactsDir, 'trigger-search-api-calls.json'), JSON.stringify(allApiCalls, null, 2));
await writeFile(join(artifactsDir, 'trigger-search-captured.json'), JSON.stringify(capturedSearchCalls, null, 2));

await browser.close();
console.log('\nArtifacts saved to scripts/cps-artifacts/');
