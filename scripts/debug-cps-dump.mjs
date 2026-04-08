#!/usr/bin/env node
// Dump full GetAllOptions response to find actual bookable courseId fields

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
if (!email || !password) { console.error('Set CPS_EMAIL and CPS_PASSWORD in .env.local'); process.exit(1); }

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
console.log('Token OK');

// Step 2: GetAllOptions with CORRECT header name x-componentid
for (const cid of ['1', null]) {
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/json',
  };
  if (cid) headers['x-componentid'] = cid;

  console.log(`\nTrying x-componentid=${cid}...`);
  const r = await fetch(
    'https://premiergolf.cps.golf/onlineres/onlineapi/api/v1/onlinereservation/GetAllOptions/premiergolf?version=25.4.2&product=3',
    { headers, signal: AbortSignal.timeout(15000) }
  );
  const body = await r.text();
  console.log(`Status: ${r.status}`);

  if (r.ok) {
    const { writeFileSync } = await import('fs');
    const outPath = new URL('./cps-alloptions-dump.json', import.meta.url).pathname;
    writeFileSync(outPath.replace(/^\/([A-Z]:)/, '$1'), body);
    console.log(`Full JSON written to scripts/cps-alloptions-dump.json (${body.length} bytes)`);

    // Find top-level keys
    const data = JSON.parse(body);
    console.log('\nTop-level keys:', Object.keys(data));

    // Find all objects that have both an id-like field AND a name-like field
    const courseKeywords = ['jackson', 'jefferson', 'west seattle', 'interbay', 'legion', 'bellevue'];
    const idFields = new Set();

    function findCourseEntries(obj, path = '', depth = 0) {
      if (!obj || typeof obj !== 'object' || depth > 15) return;
      if (Array.isArray(obj)) {
        obj.forEach((o, i) => findCourseEntries(o, `${path}[${i}]`, depth + 1));
        return;
      }
      const str = JSON.stringify(obj).toLowerCase();
      const isCourse = courseKeywords.some(k => str.includes(k));
      if (isCourse && depth > 1) {
        // Collect all keys from this object
        const keys = Object.keys(obj);
        const numericIdKeys = keys.filter(k => k.toLowerCase().includes('id') && typeof obj[k] === 'number');
        numericIdKeys.forEach(k => idFields.add(k));
        if (numericIdKeys.length > 0) {
          const relevant = {};
          keys.forEach(k => {
            if (k.toLowerCase().includes('id') || k.toLowerCase().includes('name') ||
                k.toLowerCase().includes('site') || k.toLowerCase().includes('course') ||
                k.toLowerCase().includes('slug') || k.toLowerCase().includes('url')) {
              relevant[k] = obj[k];
            }
          });
          console.log(`\nPath: ${path}`);
          console.log(JSON.stringify(relevant, null, 2).slice(0, 600));
        }
      }
      Object.entries(obj).forEach(([k, v]) => findCourseEntries(v, `${path}.${k}`, depth + 1));
    }

    findCourseEntries(data);
    console.log('\nAll numeric ID field names found near course names:', [...idFields]);
    break;
  } else {
    console.log(`Error: ${body.slice(0, 200)}`);
  }
  await new Promise(r => setTimeout(r, 500));
}
