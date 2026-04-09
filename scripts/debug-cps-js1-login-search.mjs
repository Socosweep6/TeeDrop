#!/usr/bin/env node
/**
 * Use js1 password grant (confirmed: client_id=js1, client_secret=v4secret)
 * to get a full user token, then use Playwright to login via the SPA
 * and capture the actual tee time search HTTP call.
 *
 * Run:
 *   CPS_EMAIL='...' CPS_PASSWORD='...' node scripts/debug-cps-js1-login-search.mjs
 */

import { mkdir, writeFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { randomUUID } from 'crypto';

const __dir = dirname(fileURLToPath(import.meta.url));
const artifactsDir = join(__dir, 'cps-artifacts');
await mkdir(artifactsDir, { recursive: true });

const EMAIL = process.env.CPS_EMAIL;
const PASSWORD = process.env.CPS_PASSWORD;
if (!EMAIL || !PASSWORD) {
  console.error('Usage: CPS_EMAIL="..." CPS_PASSWORD="..." node scripts/debug-cps-js1-login-search.mjs');
  process.exit(1);
}

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const TENANT = 'premiergolf';
const IDENTITY_BASE = 'https://premiergolf.cps.golf/identityapi';
const API_BASE = 'https://premiergolf.cps.golf/onlineres/onlineapi/api/v1/onlinereservation';

// ── Step 1: Get js1 token directly ───────────────────────────────────────────

console.log('\n=== Step 1: Password grant via js1 ===');
const body = new URLSearchParams({
  grant_type: 'password',
  scope: 'openid profile onlinereservation sale inventory sh customer email recommend references',
  username: EMAIL,
  password: PASSWORD,
  client_id: 'js1',
  client_secret: 'v4secret',
});

const tokenRes = await fetch(`${IDENTITY_BASE}/connect/token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
  body: body.toString(),
  signal: AbortSignal.timeout(15000),
});
const tokenJson = await tokenRes.json();
console.log(`Token response status: ${tokenRes.status}`);

if (!tokenJson.access_token) {
  console.error('Token failed:', JSON.stringify(tokenJson));
  process.exit(1);
}

const token = tokenJson.access_token;
const refreshToken = tokenJson.refresh_token;
console.log(`Access token: OK (${token.length} chars)`);
console.log(`Refresh token: ${refreshToken ? 'yes' : 'no'}`);
console.log(`Token type: ${tokenJson.token_type}`);
console.log(`Expires in: ${tokenJson.expires_in}s`);

// Decode JWT claims
const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
console.log(`  sub: ${payload.sub}`);
console.log(`  scope: ${Array.isArray(payload.scope) ? payload.scope.join(' ') : payload.scope}`);
console.log(`  exp: ${new Date(payload.exp * 1000).toISOString()}`);

await writeFile(join(artifactsDir, 'js1-token.json'), JSON.stringify(tokenJson, null, 2));

// ── Step 2: GetAllOptions with js1 token to confirm config ───────────────────

console.log('\n=== Step 2: GetAllOptions with js1 token ===');
const optRes = await fetch(`${API_BASE}/GetAllOptions/${TENANT}?version=25.4.2.21241&product=3`, {
  headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json', 'User-Agent': UA, 'x-componentid': '1' },
  signal: AbortSignal.timeout(15000),
});
const optJson = await optRes.json();
console.log(`GetAllOptions status: ${optRes.status}`);
const webSiteId = optJson.webSiteId;
const siteId = optJson.reservationOptions?.siteId ?? 1;
const terminalId = optJson.reservationOptions?.terminalId ?? 3;
console.log(`  webSiteId: ${webSiteId}`);
console.log(`  siteId: ${siteId}`);
console.log(`  terminalId: ${terminalId}`);

// ── Step 3: Probe GetTeeSheet directly (most likely bundle candidate) ─────────

console.log('\n=== Step 3: Probe GetTeeSheet endpoint ===');
const tzOffsetMin = new Date().getTimezoneOffset();
const tzId = 'America/Los_Angeles';

function buildHeaders(extra = {}) {
  return {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'User-Agent': UA,
    'client-id': 'onlineresweb',
    'X-TerminalId': String(terminalId),
    'x-requestid': randomUUID(),
    'x-websiteid': webSiteId,
    'x-ismobile': 'false',
    'x-productid': '1',
    'x-componentid': '1',
    'x-siteid': String(siteId),
    'x-timezone-offset': String(tzOffsetMin),
    'x-timezoneid': tzId,
    'x-moduleid': '1',
    ...extra,
  };
}

const targetDate = new Date();
targetDate.setDate(targetDate.getDate() + 7);
const dateStr = targetDate.toISOString().split('T')[0];
const transactionId = randomUUID();

const probeResults = [];

async function probe(label, method, url, body) {
  const hdrs = buildHeaders();
  const opts = { method, headers: hdrs, signal: AbortSignal.timeout(12000) };
  if (body !== null) opts.body = typeof body === 'string' ? body : JSON.stringify(body);
  try {
    const res = await fetch(url, opts);
    const text = await res.text();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch {}
    probeResults.push({ label, method, url, requestBody: body, status: res.status, responseBody: parsed ?? text });
    const preview = text.slice(0, 200).replace(/\n/g, ' ');
    console.log(`  [${res.status}] ${label}: ${preview || '(empty)'}`);
    return { status: res.status, body: parsed ?? text };
  } catch (err) {
    probeResults.push({ label, method, url, error: err.message });
    console.log(`  [ERR] ${label}: ${err.message}`);
    return { status: 0, body: null };
  }
}

// GetTeeSheet variants — GET with query params
const courses = [
  { courseId: 3, name: 'Jackson Park', holes: 18 },
  { courseId: 2, name: 'West Seattle', holes: 18 },
];

for (const course of courses) {
  // GET variants
  for (const endpoint of ['GetTeeSheet', 'GetTeeSheets', 'GetTeeTimeSheet']) {
    const params = new URLSearchParams({
      courseId: course.courseId,
      searchDate: `${dateStr}T00:00:00`,
      holes: course.holes,
      numberOfPlayer: 1,
      searchTimeType: 0,
      transactionId,
    });
    await probe(
      `GET ${endpoint} ${course.name}`,
      'GET',
      `${API_BASE}/${endpoint}/${TENANT}?${params}`,
      null,
    );
    await new Promise(r => setTimeout(r, 200));
  }

  // POST variants
  const postBody = {
    searchDate: `${dateStr}T00:00:00`,
    holes: course.holes,
    numberOfPlayer: 1,
    courseIds: [course.courseId],
    searchTimeType: 0,
    classCode: '',
    transactionId,
    pageSize: 50,
  };
  for (const endpoint of ['GetTeeSheet', 'GetTeeSheets', 'GetAvailableTeeTimes', 'GetTeeTimes', 'SearchAvailableTeeTimes']) {
    await probe(
      `POST ${endpoint} ${course.name}`,
      'POST',
      `${API_BASE}/${endpoint}/${TENANT}`,
      postBody,
    );
    await new Promise(r => setTimeout(r, 200));
  }
}

await writeFile(join(artifactsDir, 'js1-probe-results.json'), JSON.stringify(probeResults, null, 2));

const successes = probeResults.filter(r => r.status === 200);
console.log(`\nProbe summary: ${successes.length} successes out of ${probeResults.length}`);

// ── Step 4: Playwright — seed js1 token into localStorage, navigate to search ─

console.log('\n=== Step 4: Playwright with seeded js1 token ===');

const allApiCalls = [];
const searchCalls = [];

const { chromium } = await import('playwright');
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ userAgent: UA });
const page = await context.newPage();

page.on('request', req => {
  const url = req.url();
  if (!url.includes('cps.golf')) return;
  if (/\.(js|css|woff2?|png|ico|svg)(\?|$)/.test(url)) return;
  const entry = { ts: Date.now(), method: req.method(), url, headers: req.headers(), postData: req.postData() || null };
  allApiCalls.push(entry);

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
  if (!url.includes('cps.golf')) return;
  if (/\.(js|css|woff2?|png|ico|svg)(\?|$)/.test(url)) return;
  const status = resp.status();
  const body = await resp.text().catch(() => '');
  const isSearch = /SearchTee|GetTeeSheet|GetAvailableTime|teetime|Teetime|FetchTee|Booking|teesheet/i.test(url);
  if (isSearch || (status !== 200 && status !== 204)) {
    console.log(`RESP ${status} ${url}`);
    if (body) console.log(`     ${body.slice(0, 400)}`);
  }
});

// Navigate to base URL first to set localStorage origin
await page.goto('https://premiergolf.cps.golf/onlineresweb/', { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
await new Promise(r => setTimeout(r, 2000));

// Seed the js1 token into localStorage (mirroring what the SPA stores after login)
// The SPA stores the full token JSON under a key; we know short_lived uses 'online-reservation-v5-short_lived_token'
// Full user token likely uses 'online-reservation-v5-token' or similar
await page.evaluate(({ tokenJson, email }) => {
  // Clear existing session
  localStorage.clear();

  // Try common storage key patterns used by Angular SPA
  const tokenStr = JSON.stringify(tokenJson);
  const keys = [
    'online-reservation-v5-token',
    'online-reservation-v5-user-token',
    'online-reservation-v5-access-token',
    `online-reservation-v5-${email}`,
    'cps-token',
    'auth-token',
  ];
  for (const key of keys) {
    localStorage.setItem(key, tokenStr);
  }
  // Also store as flat access_token
  localStorage.setItem('online-reservation-v5-access_token', tokenJson.access_token);
  console.log('localStorage keys set:', Object.keys(localStorage));
}, { tokenJson, email: EMAIL });

console.log('Seeded js1 token into localStorage');

// Navigate to the login page and try to authenticate via the form
console.log('\nTrying form login at /auth/sign-in...');
await page.goto('https://premiergolf.cps.golf/onlineresweb/auth/sign-in?returnUrl=%2Fsearch-teetime', {
  waitUntil: 'networkidle',
  timeout: 20000,
}).catch(e => console.log('nav:', e.message));
await new Promise(r => setTimeout(r, 2000));
console.log(`Landed: ${page.url()}`);

// Fill login form if we got one
const emailInput = await page.$('input[type="email"], input[placeholder*="Email" i], input[name="username"]').catch(() => null);
if (emailInput) {
  console.log('Found login form, filling...');
  await emailInput.fill(EMAIL).catch(() => {});
  const pwInput = await page.$('input[type="password"]').catch(() => null);
  if (pwInput) await pwInput.fill(PASSWORD).catch(() => {});
  const submit = await page.$('button[type="submit"]:has-text("Sign In"), button:has-text("LOGIN"), button:has-text("Log In"), button:has-text("NEXT")').catch(() => null);
  if (submit) {
    await submit.click().catch(() => {});
    await new Promise(r => setTimeout(r, 5000));
    console.log(`After login submit: ${page.url()}`);
  }
} else {
  console.log('No login form found on this page');
}

// If still on auth page, try verify-email path
if (page.url().includes('auth') && !page.url().includes('search')) {
  console.log('\nNavigating through verify-email with real email...');
  await page.goto('https://premiergolf.cps.golf/onlineresweb/auth/verify-email?returnUrl=%2Fsearch-teetime', {
    waitUntil: 'networkidle', timeout: 20000,
  }).catch(() => {});
  await new Promise(r => setTimeout(r, 2000));

  const emailEl = await page.$('input[type="email"]').catch(() => null);
  if (emailEl) {
    await emailEl.fill(EMAIL);
    await page.click('button:has-text("NEXT"), button[type="submit"]:not(:has-text("Sign"))').catch(() => {});
    await new Promise(r => setTimeout(r, 4000));
    console.log(`After verify-email: ${page.url()}`);
  }
}

// If we got to login (known email flow), fill password
if (page.url().includes('login') || page.url().includes('sign-in') || page.url().includes('password')) {
  console.log('\nFilling password...');
  const pwEl = await page.$('input[type="password"]').catch(() => null);
  if (pwEl) {
    await pwEl.fill(PASSWORD);
    const submit = await page.$('button[type="submit"]').catch(() => null);
    if (submit) {
      await submit.click().catch(() => {});
      await new Promise(r => setTimeout(r, 5000));
      console.log(`After password submit: ${page.url()}`);
    }
  }
}

// Navigate to search
console.log('\nNavigating to search page...');
const searchNavUrl = `https://premiergolf.cps.golf/onlineresweb/search-teetime/premiergolf?courseId=3&searchDate=${dateStr}&player=1&hole=18`;
await page.goto(searchNavUrl, { waitUntil: 'networkidle', timeout: 30000 }).catch(e => console.log('nav:', e.message));
await new Promise(r => setTimeout(r, 6000));
console.log(`Final URL: ${page.url()}`);

const lsFinal = await page.evaluate(() => ({ ...localStorage })).catch(() => ({}));
console.log('localStorage keys:', Object.keys(lsFinal));

// If on search page, try to trigger search
if (!page.url().includes('verify-email') && !page.url().includes('register') && !page.url().includes('login')) {
  console.log('On search page! Waiting for auto-search and trying button...');
  await new Promise(r => setTimeout(r, 4000));
  const btn = await page.$('button:has-text("Search"), button:has-text("SEARCH"), [type="submit"]').catch(() => null);
  if (btn) {
    await btn.click().catch(() => {});
    await new Promise(r => setTimeout(r, 5000));
  }
}

// ── Results ───────────────────────────────────────────────────────────────────

console.log('\n=== RESULTS ===');
console.log(`Total API calls: ${allApiCalls.length}`);
console.log(`Search calls: ${searchCalls.length}`);
console.log(`Final URL: ${page.url()}`);

if (searchCalls.length > 0) {
  console.log('\n*** SEARCH CALLS CAPTURED ***');
  for (const c of searchCalls) {
    console.log(`  ${c.method} ${c.url}`);
    if (c.postData) console.log(`    body: ${c.postData}`);
    const rel = Object.fromEntries(
      Object.entries(c.headers || {}).filter(([k]) => /auth|x-|content-type|client/i.test(k))
    );
    console.log(`    headers: ${JSON.stringify(rel)}`);
  }
}

await writeFile(join(artifactsDir, 'js1-playwright-api-calls.json'), JSON.stringify(allApiCalls, null, 2));
await writeFile(join(artifactsDir, 'js1-playwright-search-calls.json'), JSON.stringify(searchCalls, null, 2));

await browser.close();
console.log('\nArtifacts saved to scripts/cps-artifacts/');
