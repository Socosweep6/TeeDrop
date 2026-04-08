#!/usr/bin/env node
// Intercept CPS API calls from the browser to find real courseIds and endpoint format

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

const { chromium } = await import('playwright');
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
});
const page = await context.newPage();

// Intercept all CPS API calls
page.on('request', req => {
  const url = req.url();
  if (url.includes('onlineapi') || url.includes('onlineres')) {
    console.log(`\nREQ: ${req.method()} ${url}`);
    const hdrs = req.headers();
    const relevant = Object.fromEntries(Object.entries(hdrs).filter(([k]) =>
      k.match(/auth|component|content|accept/i)
    ));
    console.log('  headers:', JSON.stringify(relevant));
    const body = req.postData();
    if (body) console.log('  body:', body.slice(0, 200));
  }
});

page.on('response', async resp => {
  const url = resp.url();
  if (url.includes('onlineapi') || url.includes('onlineres')) {
    const body = await resp.text().catch(() => '');
    console.log(`RESP: ${resp.status()} ${url}`);
    console.log('  body:', body.slice(0, 300));
  }
});

// Get OAuth token first
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
const { access_token } = await tokenRes.json();
console.log(`Token: ${access_token ? 'OK' : 'FAILED'}`);

// Inject token into browser storage before navigation
await page.addInitScript(token => {
  Object.defineProperty(window, '__CPS_TOKEN__', { value: token });
}, access_token);

// Navigate to Jackson Park reservation page
console.log('\nNavigating to Jackson Park...');
await page.goto('https://premiergolf.cps.golf/reserve/jackson-park-golf-course', {
  waitUntil: 'networkidle',
  timeout: 30000,
}).catch(e => console.log('nav error:', e.message));

console.log(`\nFinal URL: ${page.url()}`);

// Wait a bit for any lazy-loaded API calls
await new Promise(r => setTimeout(r, 3000));

await browser.close();
console.log('\nDone.');
