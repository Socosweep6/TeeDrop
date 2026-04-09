#!/usr/bin/env node
/**
 * Task 4: Probe the proven CPS request shape.
 *
 * Evidence basis:
 * - Endpoint: SearchTeetimes (found in bundle, not GetAvailableTimeSheet)
 * - Auth: short-lived guest token via /myconnect/token/short (multipart FormData)
 * - Headers: full set from HTTP interceptor in main bundle
 * - Body: POST JSON with courseIds[], searchDate, holes, numberOfPlayer, transactionId
 * - Config values: siteId=1, terminalId=3, webSiteId from GetAllOptions
 *
 * Run: node scripts/debug-cps-probe-live-search.mjs
 */

import { mkdir, writeFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { randomUUID } from 'crypto';

const __dir = dirname(fileURLToPath(import.meta.url));
const artifactsDir = join(__dir, 'cps-artifacts');
await mkdir(artifactsDir, { recursive: true });

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const TENANT = 'premiergolf';
const API_BASE = `https://premiergolf.cps.golf/onlineres/onlineapi/api/v1/onlinereservation`;

const results = [];

// ── Step 1: Short-lived guest token ──────────────────────────────────────────

console.log('Step 1: Get short-lived guest token...');
const formData = new FormData();
formData.append('client_id', 'onlinereswebshortlived');

const tokenRes = await fetch('https://premiergolf.cps.golf/identityapi/myconnect/token/short', {
  method: 'POST',
  body: formData,
  signal: AbortSignal.timeout(15000),
});
const tokenJson = await tokenRes.json();
const token = tokenJson.access_token;
if (!token) {
  console.error('Token failed:', JSON.stringify(tokenJson));
  process.exit(1);
}
console.log(`Token: OK (${token.length} chars)`);

// Decode JWT to confirm scope
const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
console.log(`  client_id: ${payload.client_id}`);
console.log(`  scope: ${Array.isArray(payload.scope) ? payload.scope.join(' ') : payload.scope}`);

// ── Step 2: GetAllOptions to confirm config values ────────────────────────────

console.log('\nStep 2: GetAllOptions to get webSiteId, siteId, terminalId...');
const optRes = await fetch(`${API_BASE}/GetAllOptions/${TENANT}?version=25.4.2.21241&product=3`, {
  headers: {
    'Authorization': `Bearer ${token}`,
    'x-componentid': '1',
    'Accept': 'application/json',
    'User-Agent': UA,
  },
  signal: AbortSignal.timeout(15000),
});
const optJson = await optRes.json();
const webSiteId = optJson.webSiteId || 'fbe1de5b-8700-4db9-d7d2-08da3ce0bbaa';
const siteId = optJson.reservationOptions?.siteId ?? 1;
const terminalId = optJson.reservationOptions?.terminalId ?? 3;
console.log(`  webSiteId: ${webSiteId}`);
console.log(`  siteId: ${siteId}`);
console.log(`  terminalId: ${terminalId}`);

// ── Step 3: Build proven headers ─────────────────────────────────────────────

// From bundle: HTTP interceptor injects all of these on every API request
const tzOffsetMin = new Date().getTimezoneOffset(); // PDT = 420, PST = 480
const tzId = 'America/Los_Angeles'; // server timezone context for Seattle courses

function buildHeaders(extraHeaders = {}) {
  return {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'User-Agent': UA,
    // From bundle HTTP interceptor (main bundle pos 55632 and 212354)
    'client-id': 'onlineresweb',         // from Home/Configuration clientId
    'X-TerminalId': String(terminalId),  // 3 — from GetAllOptions
    'x-requestid': randomUUID(),
    'x-websiteid': webSiteId,
    'x-ismobile': 'false',
    'x-productid': '1',
    'x-componentid': '1',
    'x-siteid': String(siteId),
    'x-timezone-offset': String(tzOffsetMin),
    'x-timezoneid': tzId,
    'x-moduleid': '1',                   // OnlineReservation enum — likely 1
    ...extraHeaders,
  };
}

// ── Step 4: Build probe dates ─────────────────────────────────────────────────

const dates = [];
for (let i = 1; i <= 7; i++) {
  const d = new Date();
  d.setDate(d.getDate() + i);
  dates.push(d.toISOString().split('T')[0]);
}

// Courses to test
const COURSES = [
  { courseId: 3, name: 'Jackson Park', holes: 18 },
  { courseId: 2, name: 'West Seattle', holes: 18 },
  { courseId: 6, name: 'Interbay', holes: 9 },
];

async function probe(label, method, url, body, extraHeaders = {}) {
  const hdrs = buildHeaders(extraHeaders);
  const opts = {
    method,
    headers: hdrs,
    signal: AbortSignal.timeout(12000),
  };
  if (body !== null) opts.body = JSON.stringify(body);

  try {
    const res = await fetch(url, opts);
    const text = await res.text();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch {}

    const entry = { label, method, url, requestBody: body, requestHeaders: hdrs, status: res.status, responseBody: parsed ?? text };
    results.push(entry);

    const preview = text.slice(0, 150).replace(/\n/g, ' ');
    console.log(`  [${res.status}] ${label}: ${preview || '(empty)'}`);
    return { status: res.status, body: parsed ?? text };
  } catch (err) {
    const entry = { label, method, url, requestBody: body, error: err.message };
    results.push(entry);
    console.log(`  [ERR] ${label}: ${err.message}`);
    return { status: 0, body: null };
  }
}

// ── Step 5: Probe SearchTeetimes ──────────────────────────────────────────────

console.log('\nStep 5: Probing SearchTeetimes endpoint...');

for (const course of COURSES) {
  for (const date of dates.slice(0, 2)) { // Test 2 dates per course first
    const transactionId = randomUUID();

    // Attempt A: POST /SearchTeetimes/premiergolf with JSON body
    const bodyA = {
      searchDate: `${date}T00:00:00`,
      holes: course.holes,
      numberOfPlayer: 1,
      courseIds: [course.courseId],
      searchTimeType: 0,      // AnyTime = 0
      classCode: '',
      isUseCapacityPricing: false,
      teeSheetSearchView: 1,  // ResponsiveView = 1
      teeOffTime: null,
      transactionId,
      pageSize: 50,
    };

    const r = await probe(
      `POST SearchTeetimes ${course.name} ${date}`,
      'POST',
      `${API_BASE}/SearchTeetimes/${TENANT}`,
      bodyA,
    );

    if (r.status === 200) {
      console.log(`  ✓ GOT 200 for ${course.name} on ${date}!`);
      console.log(`    Keys: ${r.body && typeof r.body === 'object' ? Object.keys(r.body).join(', ') : '(string)'}`);
    }

    await new Promise(x => setTimeout(x, 300));

    // Attempt B: GET /SearchTeetimes/premiergolf with query params
    const params = new URLSearchParams({
      courseIds: course.courseId,
      searchDate: `${date}T00:00:00`,
      holes: course.holes,
      numberOfPlayer: 1,
      searchTimeType: 0,
      classCode: '',
      transactionId,
      pageSize: 50,
    });
    const rB = await probe(
      `GET SearchTeetimes ${course.name} ${date}`,
      'GET',
      `${API_BASE}/SearchTeetimes/${TENANT}?${params}`,
      null,
    );

    if (rB.status === 200) {
      console.log(`  ✓ GOT 200 (GET) for ${course.name} on ${date}!`);
    }

    await new Promise(x => setTimeout(x, 300));
  }
}

// ── Step 6: Try alternate endpoint spellings ───────────────────────────────────

console.log('\nStep 6: Alternate endpoint name variations...');
const testDate = dates[1];
const transId = randomUUID();
const testBody = {
  searchDate: `${testDate}T00:00:00`,
  holes: 18,
  numberOfPlayer: 1,
  courseIds: [3],
  searchTimeType: 0,
  classCode: '',
  isUseCapacityPricing: false,
  transactionId: transId,
  pageSize: 50,
};

for (const variant of [
  'SearchTeetimes',
  'SearchTeeTimes',
  'SearchTeeTime',
  'SearchTeeTimeSheet',
  'FetchTeeTimes',
  'GetTeeTimes',
]) {
  const r = await probe(
    `POST ${variant}`,
    'POST',
    `${API_BASE}/${variant}/${TENANT}`,
    testBody,
  );
  if (r.status === 200) {
    console.log(`  ✓ GOT 200 for ${variant}!`);
  }
  await new Promise(x => setTimeout(x, 200));
}

// ── Step 7: Try without tenant slug ───────────────────────────────────────────

console.log('\nStep 7: Without tenant slug...');
const r7 = await probe(
  'POST SearchTeetimes (no slug)',
  'POST',
  `${API_BASE}/SearchTeetimes`,
  { ...testBody, courseIds: [3] },
);

// ── Step 8: Try with x-moduleid variations ─────────────────────────────────────

console.log('\nStep 8: x-moduleid variations...');
for (const moduleid of ['0', '2', '3', '4']) {
  const r8 = await probe(
    `POST SearchTeetimes x-moduleid=${moduleid}`,
    'POST',
    `${API_BASE}/SearchTeetimes/${TENANT}`,
    testBody,
    { 'x-moduleid': moduleid },
  );
  if (r8.status === 200) console.log(`  ✓ GOT 200 with x-moduleid=${moduleid}!`);
  await new Promise(x => setTimeout(x, 200));
}

// ── Save results ──────────────────────────────────────────────────────────────

const outPath = join(artifactsDir, 'probe-results.json');
await writeFile(outPath, JSON.stringify(results, null, 2));

// Summary
console.log('\n=== PROBE SUMMARY ===');
const byStatus = {};
for (const r of results) {
  byStatus[r.status || 'ERR'] = (byStatus[r.status || 'ERR'] || 0) + 1;
}
console.log('Status distribution:', JSON.stringify(byStatus));

const successes = results.filter(r => r.status === 200);
if (successes.length > 0) {
  console.log('\nSuccessful calls:');
  successes.forEach(r => console.log(`  ${r.label}: ${JSON.stringify(r.responseBody).slice(0, 200)}`));
} else {
  console.log('\nNo 200 responses. All probes failed or returned non-200.');
}

console.log(`\nFull results saved to: ${outPath}`);
