#!/usr/bin/env node
// Test GetAvailableTimeSheet with correct x-componentid header and known courseIds

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

// Tomorrow's date
const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
const [y, m, d] = tomorrow.toISOString().split('T')[0].split('-');
const bookingDate = `${m}/${d}/${y}`;
console.log(`Testing date: ${bookingDate}\n`);

// Known courseIds from courseOptions
const courses = [
  { id: 2, name: 'West Seattle GC', holes: 18 },
  { id: 3, name: 'Jackson Park', holes: 18 },
  { id: 4, name: 'Jefferson Park', holes: 18 },
  { id: 5, name: 'Bellevue', holes: 18 },
  { id: 6, name: 'Interbay', holes: 9 },
  { id: 11, name: 'Legion Memorial', holes: 18 },
];

for (const course of courses) {
  const url = `https://premiergolf.cps.golf/onlineres/onlineapi/api/v1/onlinereservation/GetAvailableTimeSheet/premiergolf?courseId=${course.id}&bookingDate=${encodeURIComponent(bookingDate)}&holeCount=${course.holes}&players=1&numberOfGuests=0&product=3`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'x-componentid': '1',
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(10000),
  });
  const body = await res.text();
  const preview = body.slice(0, 150).replace(/\n/g, ' ');
  const timesCount = (body.match(/"teeTime"/g) || body.match(/"time"/g) || []).length;
  console.log(`courseId=${course.id} (${course.name}): HTTP ${res.status} — ${preview}`);
  if (res.ok) console.log(`  → JSON keys: ${Object.keys(JSON.parse(body)).join(', ')}`);
  await new Promise(r => setTimeout(r, 300));
}
