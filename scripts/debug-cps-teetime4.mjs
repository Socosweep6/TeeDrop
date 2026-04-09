#!/usr/bin/env node
// 1. Try short-lived token via /myconnect/token/short (multipart form data)
// 2. Try Playwright with cleared storage to skip verify-email redirect

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

// Part 1: Short-lived token via /myconnect/token/short with multipart
console.log('=== Part 1: Short-lived token via /myconnect/token/short ===');
const formData = new FormData();
formData.append('client_id', 'onlinereswebshortlived');

const shortRes = await fetch('https://premiergolf.cps.golf/identityapi/myconnect/token/short', {
  method: 'POST',
  body: formData,
  signal: AbortSignal.timeout(10000),
}).catch(e => ({ ok: false, status: 0, text: async () => e.message }));

const shortBody = await shortRes.text();
console.log(`Status: ${shortRes.status} — ${shortBody.slice(0, 200)}`);

let shortToken = null;
if (shortRes.ok) {
  try { shortToken = JSON.parse(shortBody).access_token; } catch {}
  console.log(`Short-lived token: ${shortToken ? 'OK' : 'no access_token in response'}`);
}

// Also try with username/password in the multipart form
console.log('\nTrying /myconnect/token/short with credentials...');
const formData2 = new FormData();
formData2.append('client_id', 'onlinereswebshortlived');
formData2.append('username', email);
formData2.append('password', password);

const shortRes2 = await fetch('https://premiergolf.cps.golf/identityapi/myconnect/token/short', {
  method: 'POST',
  body: formData2,
  signal: AbortSignal.timeout(10000),
}).catch(e => ({ ok: false, status: 0, text: async () => e.message }));
const shortBody2 = await shortRes2.text();
console.log(`Status: ${shortRes2.status} — ${shortBody2.slice(0, 200)}`);

// Part 2: Playwright with cleared storage — avoid verify-email redirect
console.log('\n=== Part 2: Playwright with cleared storage ===');
const { chromium } = await import('playwright');
const browser = await chromium.launch({ headless: true });
// Fresh context, no stored data
const context = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  storageState: undefined,
});
const page = await context.newPage();

// Intercept API calls (especially GetAvailableTimeSheet)
const capturedRequests = [];
page.on('request', req => {
  const url = req.url();
  if (url.includes('GetAvailableTimeSheet') || url.includes('GetAllOptions') || url.includes('myconnect') || url.includes('connect/token')) {
    console.log(`REQ: ${req.method()} ${url.slice(0, 120)}`);
    const hdrs = req.headers();
    const authHdr = Object.entries(hdrs).find(([k]) => k.toLowerCase() === 'authorization');
    if (authHdr) console.log(`  auth: ${authHdr[1].slice(0, 60)}...`);
    capturedRequests.push({ url, method: req.method(), headers: hdrs });
  }
});

page.on('response', async resp => {
  const url = resp.url();
  if (url.includes('GetAvailableTimeSheet') || url.includes('myconnect') || url.includes('connect/token')) {
    const body = await resp.text().catch(() => '');
    console.log(`RESP: ${resp.status()} ${url.slice(0, 100)}`);
    if (body && body.length > 0 && body.length < 500) console.log(`  body: ${body}`);
    else if (body && body.length >= 500) console.log(`  body: ${body.slice(0, 200)}...`);
  }
});

// Clear any cached state
await context.clearCookies();

console.log('Navigating (fresh session, no prior auth)...');
await page.goto('https://premiergolf.cps.golf/reserve/jackson-park-golf-course', {
  waitUntil: 'domcontentloaded', timeout: 30000,
}).catch(e => console.log('nav error:', e.message));

await new Promise(r => setTimeout(r, 2000));
const url1 = page.url();
console.log(`URL: ${url1}`);

if (url1.includes('verify-email') || url1.includes('auth/')) {
  console.log('Still at auth — trying to clear page storage before navigating...');

  // Navigate to the site root first, then clear storage
  await page.goto('https://premiergolf.cps.golf/', { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
  await page.evaluate(() => {
    try { localStorage.clear(); } catch {}
    try { sessionStorage.clear(); } catch {}
    // Clear OIDC-specific keys
    for (const key of Object.keys(localStorage)) {
      if (key.includes('oidc') || key.includes('auth') || key.includes('user')) {
        localStorage.removeItem(key);
      }
    }
  });
  console.log('Storage cleared. Re-navigating...');

  await page.goto('https://premiergolf.cps.golf/reserve/jackson-park-golf-course', {
    waitUntil: 'domcontentloaded', timeout: 30000,
  }).catch(e => console.log('nav error:', e.message));

  await new Promise(r => setTimeout(r, 3000));
  console.log(`URL after storage clear: ${page.url()}`);
}

// Wait for any lazy API calls (tee time search might trigger on page load)
await new Promise(r => setTimeout(r, 5000));
console.log(`Final URL: ${page.url()}`);

// Print captured GetAvailableTimeSheet requests
const tsReqs = capturedRequests.filter(r => r.url.includes('GetAvailableTimeSheet'));
if (tsReqs.length > 0) {
  console.log('\nGetAvailableTimeSheet requests captured:');
  tsReqs.forEach(r => console.log(`  ${r.method} ${r.url}`));
} else {
  console.log('\nNo GetAvailableTimeSheet requests captured.');
}

await browser.close();
console.log('Done.');
