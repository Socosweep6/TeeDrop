#!/usr/bin/env node
// Debug: inspect GetAllOptions response to find correct courseId field

const CPS_EMAIL = process.env.CPS_EMAIL;
const CPS_PASSWORD = process.env.CPS_PASSWORD;

if (!CPS_EMAIL || !CPS_PASSWORD) {
  console.error('Set CPS_EMAIL and CPS_PASSWORD');
  process.exit(1);
}

// Load .env.local
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

// Step 1: OAuth token
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
const tokenJson = await tokenRes.json();
if (!tokenJson.access_token) {
  console.error('Token failed:', JSON.stringify(tokenJson));
  process.exit(1);
}
const token = tokenJson.access_token;
console.log('Token OK\n');

// Step 2: GetAllOptions
const optRes = await fetch(
  'https://premiergolf.cps.golf/onlineres/onlineapi/api/v1/onlinereservation/GetAllOptions/premiergolf?version=25.4.2&product=3',
  {
    headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
    signal: AbortSignal.timeout(15000),
  }
);
const opts = await optRes.json();
console.log(`GetAllOptions status: ${optRes.status}\n`);

// Step 3: Find all objects with any ID-like field near a course name
const seattleCourses = ['jackson', 'jefferson', 'west seattle', 'interbay', 'legion', 'bellevue'];

function findCourseObjects(obj, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 10) return;
  if (Array.isArray(obj)) { obj.forEach(o => findCourseObjects(o, depth + 1)); return; }

  const str = JSON.stringify(obj).toLowerCase();
  const isRelevant = seattleCourses.some(n => str.includes(n));

  if (isRelevant && depth > 1) {
    // Print ID-like fields
    const idFields = Object.entries(obj).filter(([k]) => k.toLowerCase().includes('id') || k.toLowerCase().includes('course') || k.toLowerCase().includes('site') || k.toLowerCase().includes('name'));
    if (idFields.length > 0) {
      console.log(JSON.stringify(Object.fromEntries(idFields), null, 2).slice(0, 500));
      console.log('---');
    }
  }

  Object.values(obj).forEach(v => findCourseObjects(v, depth + 1));
}

findCourseObjects(opts);

// Step 4: Also print top-level keys of opts
console.log('\nTop-level keys:', Object.keys(opts));

// Step 5: Try GetAvailableTimeSheet with a few different courseId guesses
console.log('\nTrying GetAvailableTimeSheet with various courseIds...');
for (const id of [2, 3, 4, 6, 100, 101, 102, 125, 200, 201]) {
  const url = `https://premiergolf.cps.golf/onlineres/onlineapi/api/v1/onlinereservation/GetAvailableTimeSheet/premiergolf?courseId=${id}&bookingDate=04%2F09%2F2026&holeCount=18&players=1&numberOfGuests=0&product=3`;
  const r = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  const body = await r.text();
  const preview = body.slice(0, 100).replace(/\n/g, ' ');
  console.log(`  courseId=${id}: ${r.status} — ${preview}`);
  await new Promise(r => setTimeout(r, 200));
}
