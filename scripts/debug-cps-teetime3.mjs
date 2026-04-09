#!/usr/bin/env node
// Test GetAvailableTimeSheet across many dates and intercept real browser calls

try {
  const { readFileSync } = await import('fs');
  const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
  for (const line of env.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] ??= m[2].trim();
  }
} catch {}

const email = process.env.CPS_EMAIL;
const password = process.env.CPS_PASSWORD;
if (!email || !password) { console.error('Set CPS_EMAIL and CPS_PASSWORD'); process.exit(1); }

const tokenRes = await fetch('https://premiergolf.cps.golf/identityapi/connect/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'password', username: email, password,
    client_id: 'js1', client_secret: 'v4secret',
    scope: 'onlinereservation references',
  }),
  signal: AbortSignal.timeout(15000),
});
const { access_token: token } = await tokenRes.json();
if (!token) { console.error('Token failed'); process.exit(1); }
console.log('Token OK\n');

// Part 1: Try direct API across 14 dates for Jackson Park
console.log('=== Part 1: Direct API — 14 dates for Jackson Park (courseId=3) ===');
for (let i = 0; i < 14; i++) {
  const d = new Date();
  d.setDate(d.getDate() + i);
  const [y, mo, da] = d.toISOString().split('T')[0].split('-');
  const bookingDate = `${mo}/${da}/${y}`;

  const res = await fetch(
    `https://premiergolf.cps.golf/onlineres/onlineapi/api/v1/onlinereservation/GetAvailableTimeSheet/premiergolf?courseId=3&bookingDate=${encodeURIComponent(bookingDate)}&holeCount=18&players=1&numberOfGuests=0&product=3`,
    {
      headers: { 'Authorization': `Bearer ${token}`, 'x-componentid': '1', 'Accept': 'application/json' },
      signal: AbortSignal.timeout(8000),
    }
  );
  const body = await res.text();
  const preview = body.slice(0, 80).replace(/\n/g, ' ');
  console.log(`  ${bookingDate}: HTTP ${res.status} ${preview ? '— ' + preview : '(empty)'}`);
  await new Promise(r => setTimeout(r, 200));
}

// Part 2: Playwright browser — intercept ALL API calls, click through verify-email if needed
console.log('\n=== Part 2: Browser intercept — navigate past verify-email ===');
const { chromium } = await import('playwright');
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
});
const page = await context.newPage();

// Intercept all API calls
const intercepted = [];
page.on('request', req => {
  const url = req.url();
  if (url.includes('onlineapi') || url.includes('onlineres') || url.includes('identityapi')) {
    const body = req.postData();
    console.log(`REQ: ${req.method()} ${url.slice(0, 120)}`);
    if (body) console.log(`  body: ${body.slice(0, 150)}`);
    intercepted.push({ url, method: req.method(), headers: req.headers() });
  }
});

page.on('response', async resp => {
  const url = resp.url();
  if (url.includes('onlineapi') || url.includes('onlineres')) {
    const body = await resp.text().catch(() => '');
    console.log(`RESP: ${resp.status()} ${url.slice(0, 100)}`);
    if (body && body !== '') console.log(`  body: ${body.slice(0, 200)}`);
  }
});

// Navigate and handle verify-email redirect
console.log('Navigating to Jackson Park booking page...');
await page.goto('https://premiergolf.cps.golf/reserve/jackson-park-golf-course', {
  waitUntil: 'domcontentloaded', timeout: 30000,
}).catch(e => console.log('nav error:', e.message));

await new Promise(r => setTimeout(r, 2000));
const url1 = page.url();
console.log(`Page URL: ${url1}`);

// If redirected to verify-email, try to navigate directly to search
if (url1.includes('verify-email') || url1.includes('auth')) {
  console.log('At auth page — trying direct navigation to search-teetime...');
  await page.goto('https://premiergolf.cps.golf/onlineresweb/search-teetime/premiergolf', {
    waitUntil: 'domcontentloaded', timeout: 15000,
  }).catch(e => console.log('nav error:', e.message));
  await new Promise(r => setTimeout(r, 2000));
  console.log(`URL after direct nav: ${page.url()}`);

  // Also try the reserve page without auth
  await page.goto('https://premiergolf.cps.golf/onlineresweb/search-teetime/premiergolf?courseId=3', {
    waitUntil: 'domcontentloaded', timeout: 15000,
  }).catch(e => console.log('nav error:', e.message));
  await new Promise(r => setTimeout(r, 3000));
  console.log(`URL after courseId nav: ${page.url()}`);
}

// Print page title and any visible text
const title = await page.title().catch(() => '');
console.log(`Page title: ${title}`);

await new Promise(r => setTimeout(r, 3000));
await browser.close();
console.log('\nDone.');
