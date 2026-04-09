#!/usr/bin/env node
/**
 * Navigate through CPS verify-email → register → search.
 * Uses a throwaway email to register a guest account, captures the resulting
 * auth state, then navigates to search to intercept the actual HTTP call.
 *
 * Run: node scripts/debug-cps-register-and-search.mjs
 */

import { mkdir, writeFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const artifactsDir = join(__dir, 'cps-artifacts');
await mkdir(artifactsDir, { recursive: true });

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
// Use a unique email each run to avoid "already registered" issues
const RUN_ID = Date.now();
const DUMMY_EMAIL = `teedrop.debug+${RUN_ID}@gmail.com`;
const DUMMY_FIRST = 'Tee';
const DUMMY_LAST = 'Drop';
const DUMMY_PHONE = '2065550123';

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
  if (/\.(js|css|woff2?|png|ico|svg|jpg)(\?|$)/.test(url)) return;
  const entry = { ts: Date.now(), method: req.method(), url, headers: req.headers(), postData: req.postData() || null };
  allApiCalls.push(entry);

  // Any URL with tee/search/booking patterns
  if (/SearchTee|GetTeeSheet|GetAvailableTime|teetime|Teetime|FetchTee|Booking|teesheet/i.test(url)) {
    searchCalls.push(entry);
  }

  console.log(`REQ  ${req.method()} ${url}`);
  if (entry.postData && !entry.postData.includes('WebKit')) {
    console.log(`     body: ${entry.postData.slice(0, 300)}`);
  }
});

page.on('response', async resp => {
  const url = resp.url();
  if (!url.includes('cps.golf') && !url.includes('premiergolf')) return;
  if (/\.(js|css|woff2?|png|ico|svg|jpg)(\?|$)/.test(url)) return;
  const status = resp.status();
  const body = await resp.text().catch(() => '');
  const isSearch = /SearchTee|GetTeeSheet|GetAvailableTime|teetime|Teetime|FetchTee|Booking|teesheet/i.test(url);
  if (isSearch || (status !== 200 && status !== 204)) {
    console.log(`RESP ${status} ${url}`);
    if (body) console.log(`     ${body.slice(0, 400)}`);
  }
});

// ── Step 1: Navigate to search (triggers verify-email redirect) ───────────────

const targetDate = new Date();
targetDate.setDate(targetDate.getDate() + 7);
const dateStr = targetDate.toISOString().split('T')[0];
const searchUrl = `https://premiergolf.cps.golf/onlineresweb/search-teetime/premiergolf?courseId=3&searchDate=${dateStr}&player=1&hole=18`;

console.log(`\nEmail: ${DUMMY_EMAIL}`);
console.log(`Target date: ${dateStr}`);

console.log('\n=== Step 1: Navigate to search ===');
await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30000 }).catch(e => console.log('nav:', e.message));
await new Promise(r => setTimeout(r, 2000));
console.log(`Landed: ${page.url()}`);

// ── Step 2: Fill verify-email form ───────────────────────────────────────────

console.log('\n=== Step 2: Fill verify-email ===');
await page.fill('input[type="email"]', DUMMY_EMAIL).catch(async () => {
  // Try mat-input
  await page.fill('mat-form-field input', DUMMY_EMAIL).catch(() => {});
});
const filled = await page.$eval('input[type="email"]', el => el.value).catch(() => '');
console.log(`Email field value: ${filled}`);

// Click NEXT
await page.click('button:has-text("NEXT"), button[type="submit"]:not(:has-text("Sign"))').catch(async () => {
  await page.keyboard.press('Enter');
});
await new Promise(r => setTimeout(r, 4000));
console.log(`After verify-email submit: ${page.url()}`);

// ── Step 3: Handle register page ─────────────────────────────────────────────

if (page.url().includes('register')) {
  console.log('\n=== Step 3: Fill registration form ===');

  // Dump all inputs on the page
  const inputs = await page.$$eval('input', els =>
    els.map(e => ({ name: e.name, type: e.type, placeholder: e.placeholder, id: e.id, value: e.value }))
  ).catch(() => []);
  console.log('Registration inputs:', JSON.stringify(inputs, null, 2));

  const buttons = await page.$$eval('button', els =>
    els.map(e => ({ text: e.textContent?.trim(), type: e.type, disabled: e.disabled }))
  ).catch(() => []);
  console.log('Registration buttons:', JSON.stringify(buttons));

  // Fill common registration fields
  const fieldMap = [
    { selectors: ['input[name="firstName"]', 'input[placeholder*="First" i]', 'input[id*="first" i]'], value: DUMMY_FIRST },
    { selectors: ['input[name="lastName"]', 'input[placeholder*="Last" i]', 'input[id*="last" i]'], value: DUMMY_LAST },
    { selectors: ['input[name="phone"]', 'input[type="tel"]', 'input[placeholder*="Phone" i]', 'input[id*="phone" i]'], value: DUMMY_PHONE },
    { selectors: ['input[name="email"]', 'input[type="email"]', 'input[placeholder*="Email" i]'], value: DUMMY_EMAIL },
    // Password if required
    { selectors: ['input[type="password"]', 'input[name="password"]'], value: 'TeeDropDebug2026!' },
    { selectors: ['input[name="confirmPassword"]', 'input[placeholder*="Confirm" i]'], value: 'TeeDropDebug2026!' },
    // Zip/Postal if required
    { selectors: ['input[name="zip"]', 'input[name="zipCode"]', 'input[name="postalCode"]', 'input[placeholder*="Zip" i]'], value: '98101' },
  ];

  for (const { selectors, value } of fieldMap) {
    for (const sel of selectors) {
      try {
        const el = await page.$(sel);
        if (el) {
          await el.click();
          await el.fill(value);
          const v = await el.inputValue();
          if (v) { console.log(`  Filled ${sel}: ${value}`); break; }
        }
      } catch {}
    }
  }

  await new Promise(r => setTimeout(r, 500));

  // Handle any checkboxes (terms of service, etc.)
  const checkboxes = await page.$$('input[type="checkbox"]:not(:checked)').catch(() => []);
  for (const cb of checkboxes) {
    await cb.click().catch(() => {});
    console.log('  Checked a checkbox');
  }

  // Try mat-checkbox
  const matCheckboxes = await page.$$('mat-checkbox:not(.mat-checkbox-checked)').catch(() => []);
  for (const cb of matCheckboxes) {
    await cb.click().catch(() => {});
    console.log('  Clicked mat-checkbox');
  }

  await new Promise(r => setTimeout(r, 500));

  // Submit registration
  const submitBtn = await page.$('button[type="submit"]:has-text("Register"), button:has-text("Create"), button:has-text("REGISTER"), button:has-text("SUBMIT"), button[type="submit"]:not(:disabled)').catch(() => null);
  if (submitBtn) {
    const btnText = await submitBtn.textContent();
    console.log(`Clicking submit: "${btnText?.trim()}"`);
    await submitBtn.click();
  } else {
    console.log('No submit button found, pressing Enter');
    await page.keyboard.press('Enter');
  }

  await new Promise(r => setTimeout(r, 6000));
  console.log(`After register submit: ${page.url()}`);
}

// ── Step 4: Handle any post-register gate (email confirmation, OTP, etc.) ────

const postRegUrl = page.url();
if (postRegUrl.includes('verify') || postRegUrl.includes('confirm') || postRegUrl.includes('otp')) {
  console.log('\n=== Step 4: Post-register gate detected ===');
  console.log(`URL: ${postRegUrl}`);
  const content = await page.content().catch(() => '');
  console.log('Page content snippet:');
  console.log(content.slice(0, 2000));
  // Can't proceed without email/OTP — log and bail
  console.log('\nNOTE: Registration requires email confirmation or OTP. Cannot automate further.');
}

// ── Step 5: Check if we can now access search ────────────────────────────────

console.log('\n=== Step 5: Navigate to search ===');
const lsBeforeSearch = await page.evaluate(() => ({ ...localStorage })).catch(() => ({}));
console.log('localStorage keys:', Object.keys(lsBeforeSearch));

await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30000 }).catch(e => console.log('nav:', e.message));
await new Promise(r => setTimeout(r, 6000));
console.log(`Landed: ${page.url()}`);

// ── Step 6: Trigger search if on search page ──────────────────────────────────

if (!page.url().includes('verify-email') && !page.url().includes('register') && !page.url().includes('login')) {
  console.log('\n=== Step 6: Trigger search ===');

  // Wait for Angular to finish lazy loading
  await new Promise(r => setTimeout(r, 3000));

  // Dump visible buttons
  const visibleBtns = await page.$$eval('button', els =>
    els.filter(e => e.offsetParent !== null).map(e => e.textContent?.trim())
  ).catch(() => []);
  console.log('Visible buttons:', JSON.stringify(visibleBtns));

  // Click search/find button
  for (const sel of ['button:has-text("Search")', 'button:has-text("SEARCH")', 'button:has-text("Find")', '[type="submit"]']) {
    const btn = await page.$(sel).catch(() => null);
    if (btn) {
      console.log(`Clicking: ${sel}`);
      await btn.click().catch(() => {});
      await new Promise(r => setTimeout(r, 5000));
      break;
    }
  }
}

// ── Results ───────────────────────────────────────────────────────────────────

console.log('\n=== RESULTS ===');
console.log(`Total API calls: ${allApiCalls.length}`);
console.log(`Search calls: ${searchCalls.length}`);
console.log(`Final URL: ${page.url()}`);

const lsFinal = await page.evaluate(() => ({ ...localStorage })).catch(() => ({}));
console.log('Final localStorage keys:', Object.keys(lsFinal));

if (searchCalls.length > 0) {
  console.log('\nSEARCH CALLS:');
  for (const c of searchCalls) {
    console.log(`  ${c.method} ${c.url}`);
    if (c.postData) console.log(`    body: ${c.postData}`);
    // Show auth + x- headers
    const relevantHdrs = Object.fromEntries(
      Object.entries(c.headers || {}).filter(([k]) => /auth|x-|content-type|client/i.test(k))
    );
    console.log(`    headers: ${JSON.stringify(relevantHdrs)}`);
  }
} else {
  console.log('\nNo search calls. All API calls:');
  for (const c of allApiCalls) console.log(`  ${c.method} ${c.url}`);
}

await writeFile(join(artifactsDir, 'register-search-api-calls.json'), JSON.stringify(allApiCalls, null, 2));
await writeFile(join(artifactsDir, 'register-search-calls.json'), JSON.stringify(searchCalls, null, 2));
await writeFile(join(artifactsDir, 'register-localstorage.json'), JSON.stringify(lsFinal, null, 2));

await browser.close();
console.log('\nArtifacts saved to scripts/cps-artifacts/');
