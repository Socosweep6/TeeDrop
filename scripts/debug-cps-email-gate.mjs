#!/usr/bin/env node
/**
 * Navigate through the CPS verify-email gate, capture what localStorage/cookies
 * change afterward, then trigger a tee time search and intercept the HTTP call.
 *
 * Run: node scripts/debug-cps-email-gate.mjs
 */

import { mkdir, writeFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const artifactsDir = join(__dir, 'cps-artifacts');
await mkdir(artifactsDir, { recursive: true });

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const DUMMY_EMAIL = 'test@example.com';

const allApiCalls = [];
const searchCalls = [];

const { chromium } = await import('playwright');
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ userAgent: UA });
const page = await context.newPage();

// Capture all CPS API traffic
page.on('request', req => {
  const url = req.url();
  if (!url.includes('cps.golf') && !url.includes('premiergolf')) return;
  if (/\.(js|css|woff|png|ico|svg)(\?|$)/.test(url)) return;
  const entry = { ts: Date.now(), method: req.method(), url, postData: req.postData() || null };
  allApiCalls.push(entry);

  const isSearch = /SearchTee|GetTeeSheet|GetAvailable|teetime|Teetime|FetchTee|booking/i.test(url);
  if (isSearch) searchCalls.push(entry);

  console.log(`REQ  ${req.method()} ${url}`);
  if (entry.postData) console.log(`     body: ${entry.postData.slice(0, 200)}`);
});

page.on('response', async resp => {
  const url = resp.url();
  if (!url.includes('cps.golf') && !url.includes('premiergolf')) return;
  if (/\.(js|css|woff|png|ico|svg)(\?|$)/.test(url)) return;
  const status = resp.status();
  const body = await resp.text().catch(() => '');
  const isSearch = /SearchTee|GetTeeSheet|GetAvailable|teetime|Teetime|FetchTee|booking/i.test(url);
  if (isSearch || status !== 200) {
    console.log(`RESP ${status} ${url}`);
    if (body) console.log(`     body: ${body.slice(0, 300)}`);
  }
});

// ── Step 1: Navigate to search page (expect redirect to verify-email) ─────────

const targetDate = new Date();
targetDate.setDate(targetDate.getDate() + 7);
const dateStr = targetDate.toISOString().split('T')[0];
console.log(`\nTarget date: ${dateStr}`);

const searchUrl = `https://premiergolf.cps.golf/onlineresweb/search-teetime/premiergolf?courseId=3&searchDate=${dateStr}&player=1&hole=18`;

console.log('\n=== Step 1: Navigate to search (expect verify-email redirect) ===');
await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30000 }).catch(e => console.log('nav error:', e.message));
await new Promise(r => setTimeout(r, 2000));
console.log(`Landed: ${page.url()}`);

// ── Step 2: Inspect verify-email form ────────────────────────────────────────

console.log('\n=== Step 2: Inspect verify-email page ===');
const pageTitle = await page.title().catch(() => '');
console.log(`Title: ${pageTitle}`);

const formInputs = await page.$$eval('input', els =>
  els.map(e => ({ name: e.name, type: e.type, placeholder: e.placeholder, id: e.id, class: e.className?.slice?.(0, 80) }))
).catch(() => []);
console.log('Inputs:', JSON.stringify(formInputs));

const buttons = await page.$$eval('button', els =>
  els.map(e => ({ text: e.textContent?.trim(), type: e.type, class: e.className?.slice?.(0, 60) }))
).catch(() => []);
console.log('Buttons:', JSON.stringify(buttons));

// Capture pre-submission localStorage
const lsBefore = await page.evaluate(() => ({ ...localStorage })).catch(() => ({}));
console.log('\nLocalStorage before submit:', JSON.stringify(lsBefore));

// ── Step 3: Fill and submit the email form ────────────────────────────────────

console.log('\n=== Step 3: Fill email and submit ===');

// Try various selectors for the email input
const emailSelectors = [
  'input[type="email"]',
  'input[name="email"]',
  'input[placeholder*="email" i]',
  'input[placeholder*="Email" i]',
  'input[id*="email" i]',
  'mat-form-field input',
  'input',
];

let filled = false;
for (const sel of emailSelectors) {
  try {
    const el = await page.$(sel);
    if (el) {
      await el.click();
      await el.fill(DUMMY_EMAIL);
      const val = await el.inputValue();
      if (val) {
        console.log(`Filled email input (${sel}) with: ${val}`);
        filled = true;
        break;
      }
    }
  } catch {}
}

if (!filled) {
  console.log('Could not find/fill email input. Dumping page HTML snippet...');
  const html = await page.content().catch(() => '');
  console.log(html.slice(0, 2000));
}

// Try to submit
const submitSelectors = [
  'button[type="submit"]',
  'button:has-text("Continue")',
  'button:has-text("Submit")',
  'button:has-text("Next")',
  'button:has-text("Proceed")',
  'button:has-text("Verify")',
  'button:has-text("Confirm")',
  '[mat-raised-button]',
  'button:not([disabled])',
];

let submitted = false;
for (const sel of submitSelectors) {
  try {
    const el = await page.$(sel);
    if (el) {
      const text = await el.textContent();
      console.log(`Clicking button: "${text?.trim()}" (${sel})`);
      await el.click();
      submitted = true;
      break;
    }
  } catch {}
}

if (!submitted) {
  // Try pressing Enter on the input
  console.log('No submit button found, pressing Enter...');
  await page.keyboard.press('Enter');
}

// Wait for navigation or API calls
await new Promise(r => setTimeout(r, 5000));
console.log(`URL after submit: ${page.url()}`);

// Capture post-submission localStorage
const lsAfter = await page.evaluate(() => ({ ...localStorage })).catch(() => ({}));
console.log('\nLocalStorage after submit:', JSON.stringify(lsAfter));

// Keys that changed
const newKeys = Object.keys(lsAfter).filter(k => !lsBefore[k]);
const changedKeys = Object.keys(lsAfter).filter(k => lsBefore[k] && lsBefore[k] !== lsAfter[k]);
console.log('New localStorage keys:', newKeys);
console.log('Changed localStorage keys:', changedKeys);

// ── Step 4: If redirected to search, wait for search call ─────────────────────

console.log('\n=== Step 4: Wait for tee time search call ===');
await new Promise(r => setTimeout(r, 5000));
console.log(`Final URL: ${page.url()}`);
console.log(`Search calls so far: ${searchCalls.length}`);

// If still on verify-email, try navigating directly to search
if (page.url().includes('verify-email') || searchCalls.length === 0) {
  console.log('\nStill gated or no search call — navigating to search URL directly...');
  await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 20000 }).catch(e => console.log('nav error:', e.message));
  await new Promise(r => setTimeout(r, 6000));
  console.log(`URL: ${page.url()}`);
}

// ── Step 5: Try to trigger search via form if we reached the page ─────────────

if (!page.url().includes('verify-email') && searchCalls.length === 0) {
  console.log('\n=== Step 5: Attempt to trigger search on the search page ===');

  // Look for Search button
  const searchBtn = await page.$('button:has-text("Search"), button:has-text("Find"), [type="submit"]').catch(() => null);
  if (searchBtn) {
    console.log('Found search button, clicking...');
    await searchBtn.click().catch(e => console.log('click error:', e.message));
    await new Promise(r => setTimeout(r, 5000));
  }

  // Look at what's on the page
  const pageButtons = await page.$$eval('button', els =>
    els.map(e => e.textContent?.trim()).filter(Boolean)
  ).catch(() => []);
  console.log('Buttons on search page:', JSON.stringify(pageButtons));

  // Try mat-select interaction (course picker)
  const matSelects = await page.$$('mat-select').catch(() => []);
  console.log(`mat-select elements: ${matSelects.length}`);
  if (matSelects.length > 0) {
    await matSelects[0].click().catch(() => {});
    await new Promise(r => setTimeout(r, 1000));
    const opts = await page.$$('mat-option').catch(() => []);
    if (opts.length > 0) {
      await opts[0].click().catch(() => {});
      await new Promise(r => setTimeout(r, 2000));
    }

    // Now try search
    const btn = await page.$('button:has-text("Search"), [type="submit"]').catch(() => null);
    if (btn) {
      await btn.click().catch(() => {});
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

await new Promise(r => setTimeout(r, 3000));

// ── Results ───────────────────────────────────────────────────────────────────

console.log('\n=== RESULTS ===');
console.log(`Total API calls: ${allApiCalls.length}`);
console.log(`Search calls: ${searchCalls.length}`);

if (searchCalls.length > 0) {
  console.log('\nSEARCH CALLS:');
  for (const c of searchCalls) {
    console.log(`  ${c.method} ${c.url}`);
    if (c.postData) console.log(`    body: ${c.postData}`);
  }
} else {
  console.log('\nAll API calls:');
  for (const c of allApiCalls) console.log(`  ${c.method} ${c.url}`);
}

// Final localStorage state
const lsFinal = await page.evaluate(() => ({ ...localStorage })).catch(() => ({}));
console.log('\nFinal localStorage keys:', Object.keys(lsFinal));
for (const [k, v] of Object.entries(lsFinal)) {
  console.log(`  ${k}: ${String(v).slice(0, 120)}`);
}

await writeFile(join(artifactsDir, 'email-gate-api-calls.json'), JSON.stringify(allApiCalls, null, 2));
await writeFile(join(artifactsDir, 'email-gate-search-calls.json'), JSON.stringify(searchCalls, null, 2));
await writeFile(join(artifactsDir, 'email-gate-localstorage.json'), JSON.stringify({ before: lsBefore, after: lsAfter, final: lsFinal }, null, 2));

await browser.close();
console.log('\nArtifacts saved to scripts/cps-artifacts/');
