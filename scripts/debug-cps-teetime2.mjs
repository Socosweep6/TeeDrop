#!/usr/bin/env node
// Test GetAvailableTimeSheet with short-lived token + dump 404 details

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

async function getToken(clientId, clientSecret, scope) {
  const res = await fetch('https://premiergolf.cps.golf/identityapi/connect/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'password', username: email, password, client_id: clientId, client_secret: clientSecret, scope }),
    signal: AbortSignal.timeout(15000),
  });
  const j = await res.json();
  return j.access_token || null;
}

// Try both token types
const js1Token = await getToken('js1', 'v4secret', 'onlinereservation references');
const shortLivedToken = await getToken('onlinereswebshortlived', 'v4secret', 'onlinereservation references');
console.log(`js1 token: ${js1Token ? 'OK' : 'FAILED'}`);
console.log(`shortlived token: ${shortLivedToken ? 'OK' : 'FAILED'}`);

// Tomorrow
const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
const [y, m, d] = tomorrow.toISOString().split('T')[0].split('-');
const bookingDate = `${m}/${d}/${y}`;

// Try today too
const today = new Date();
const [ty, tm, td] = today.toISOString().split('T')[0].split('-');
const todayDate = `${tm}/${td}/${ty}`;

console.log(`\nDates: today=${todayDate}, tomorrow=${bookingDate}`);

async function testTimeSheet(label, token, courseId, date, holeCount = 18) {
  const url = `https://premiergolf.cps.golf/onlineres/onlineapi/api/v1/onlinereservation/GetAvailableTimeSheet/premiergolf?courseId=${courseId}&bookingDate=${encodeURIComponent(date)}&holeCount=${holeCount}&players=1&numberOfGuests=0&product=3`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'x-componentid': '1',
      'Accept': 'application/json',
      'Origin': 'https://premiergolf.cps.golf',
      'Referer': 'https://premiergolf.cps.golf/reserve/jackson-park-golf-course',
    },
    signal: AbortSignal.timeout(10000),
  });
  const body = await res.text();
  const respHeaders = Object.fromEntries([...res.headers.entries()].filter(([k]) => k.match(/content|www-auth|location/i)));
  console.log(`  [${label}] courseId=${courseId} date=${date}: HTTP ${res.status} body="${body.slice(0, 120)}" headers=${JSON.stringify(respHeaders)}`);
  return res.status === 200 ? JSON.parse(body) : null;
}

console.log('\n--- js1 token, Jackson Park (3), today + tomorrow ---');
await testTimeSheet('js1', js1Token, 3, todayDate);
await testTimeSheet('js1', js1Token, 3, bookingDate);

if (shortLivedToken) {
  console.log('\n--- shortlived token, Jackson Park (3), today + tomorrow ---');
  await testTimeSheet('short', shortLivedToken, 3, todayDate);
  await testTimeSheet('short', shortLivedToken, 3, bookingDate);
}

// Also try the webSiteId as componentid (from GetAllOptions)
console.log('\n--- js1, Jackson Park (3), componentid=webSiteId ---');
const url = `https://premiergolf.cps.golf/onlineres/onlineapi/api/v1/onlinereservation/GetAvailableTimeSheet/premiergolf?courseId=3&bookingDate=${encodeURIComponent(bookingDate)}&holeCount=18&players=1&numberOfGuests=0&product=3`;
for (const cid of ['fbe1de5b-8700-4db9-d7d2-08da3ce0bbaa', '2', 'premiergolf']) {
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${js1Token}`, 'x-componentid': cid, 'Accept': 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  const body = await res.text();
  console.log(`  x-componentid=${cid}: HTTP ${res.status} — ${body.slice(0, 100)}`);
  await new Promise(r => setTimeout(r, 300));
}

// Try GetAvailableTimeSheet via URL slug instead of courseId
console.log('\n--- Trying slug-based URL patterns ---');
for (const slug of ['jackson-park-golf-course', 'jackson-park']) {
  const res = await fetch(`https://premiergolf.cps.golf/onlineres/onlineapi/api/v1/onlinereservation/GetAvailableTimeSheet/${slug}?courseId=3&bookingDate=${encodeURIComponent(bookingDate)}&holeCount=18&players=1&numberOfGuests=0&product=3`, {
    headers: { 'Authorization': `Bearer ${js1Token}`, 'x-componentid': '1', 'Accept': 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  const body = await res.text();
  console.log(`  slug=${slug}: HTTP ${res.status} — ${body.slice(0, 100)}`);
  await new Promise(r => setTimeout(r, 300));
}
