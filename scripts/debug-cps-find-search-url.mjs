#!/usr/bin/env node
/**
 * Find the actual HTTP URL for protectedSearchTeeTimeService.searchTeeTimes()
 * by downloading all JS chunks and searching for the method implementation.
 * Also fetches the full Home/Configuration to get all API base URLs.
 *
 * Run: node scripts/debug-cps-find-search-url.mjs
 */

import { mkdir, writeFile, readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const artifactsDir = join(__dir, 'cps-artifacts');
await mkdir(artifactsDir, { recursive: true });

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function fetchText(url, label = '') {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) });
    if (!res.ok) { console.log(`  SKIP ${label || url}: HTTP ${res.status}`); return null; }
    return res.text();
  } catch (e) {
    console.log(`  ERR ${label || url}: ${e.message}`);
    return null;
  }
}

// ── 1. Fetch full Configuration ───────────────────────────────────────────────

console.log('=== Step 1: Full Home/Configuration ===');
const config = await fetchText('https://premiergolf.cps.golf/onlineresweb/Home/Configuration', 'Configuration');
if (config) {
  console.log('Configuration response:');
  console.log(config);
  await writeFile(join(artifactsDir, 'home-configuration.json'), config);

  // Parse and list all API URLs
  try {
    const cfg = JSON.parse(config);
    console.log('\nAll API base URLs from Configuration:');
    Object.entries(cfg).filter(([k,v]) => typeof v === 'string' && v.includes('http')).forEach(([k,v]) => console.log(`  ${k}: ${v}`));
  } catch {}
}

// ── 2. Get all chunk URLs from the HTML ───────────────────────────────────────

console.log('\n=== Step 2: Discover all JS chunks ===');
const html = await fetchText('https://premiergolf.cps.golf/onlineresweb/', 'index HTML');
const chunkUrls = html
  ? [...html.matchAll(/src="([^"]*\.js)"/g)]
      .map(m => m[1])
      .map(p => p.startsWith('http') ? p : `https://premiergolf.cps.golf/onlineresweb/${p.replace(/^\/onlineresweb\//, '')}`)
  : [];
console.log(`Found ${chunkUrls.length} script tags in HTML`);

// Also try to find the ngsw-config or asset manifest for lazy chunks
const manifest = await fetchText('https://premiergolf.cps.golf/onlineresweb/ngsw.json', 'ngsw.json');
const extraChunks = [];
if (manifest) {
  const ngsw = JSON.parse(manifest);
  const allUrls = [
    ...(ngsw.assetGroups || []).flatMap(g => g.urls || []),
    ...(ngsw.dataGroups || []).flatMap(g => g.urls || []),
  ].filter(u => u.endsWith('.js'));
  extraChunks.push(...allUrls.map(u => `https://premiergolf.cps.golf${u}`));
  console.log(`Found ${extraChunks.length} additional chunks in ngsw.json`);
}

const allChunkUrls = [...new Set([...chunkUrls, ...extraChunks])].filter(u => u.includes('.js'));
console.log(`Total chunks to search: ${allChunkUrls.length}`);

// ── 3. Search each chunk for the searchTeeTimes implementation ────────────────

console.log('\n=== Step 3: Search chunks for searchTeeTimes HTTP implementation ===');

const SEARCH_TERMS = [
  'searchTeeTimes',
  'SearchTeeTimes',
  'SearchTeeTime(',
  'protectedSearch',
  '/SearchTee',
  '/searchTee',
  '/Teetime',
  '/teetime',
  '/tee-time',
  '/TeeTime',
  '/booking',
  '/Booking',
  '/GroupBooking',
  '/groupbooking',
  'protectedapi',
  'protected/api',
  'v2/online',
];

const findings = [];

// Also search cached bundles
const cachedBundles = [
  { name: 'main', path: join(artifactsDir, 'main-bundle.js') },
  { name: 'teetime-276', path: join(artifactsDir, 'teetime-chunk.js') },
];

async function searchBundle(name, content) {
  const hits = {};
  for (const term of SEARCH_TERMS) {
    let idx = 0, count = 0, contexts = [];
    while (count < 5) {
      const pos = content.indexOf(term, idx);
      if (pos === -1) break;
      const ctx = content.slice(Math.max(0, pos - 300), Math.min(content.length, pos + 800));
      // Only keep contexts that look like HTTP service implementations
      const isHttpContext = ctx.includes('http.') || ctx.includes('.get(') || ctx.includes('.post(') ||
        ctx.includes('fetch(') || ctx.includes('onlineApi') || ctx.includes('BaseUrl') ||
        ctx.includes('this.url') || ctx.includes('onlinereservation');
      if (isHttpContext) contexts.push({ pos, ctx });
      count++;
      idx = pos + 1;
    }
    if (contexts.length > 0) hits[term] = contexts;
  }
  if (Object.keys(hits).length > 0) {
    findings.push({ bundle: name, hits });
    console.log(`  [${name}] Found HTTP-context hits for: ${Object.keys(hits).join(', ')}`);
    for (const [term, ctxs] of Object.entries(hits)) {
      for (const { pos, ctx } of ctxs.slice(0, 2)) {
        console.log(`\n  --- ${name} / "${term}" @ pos ${pos} ---`);
        console.log(ctx);
      }
    }
  }
}

// Search cached bundles first
for (const { name, path } of cachedBundles) {
  try {
    const content = await readFile(path, 'utf8');
    await searchBundle(name, content);
  } catch {}
}

// Download and search all other chunks
for (const url of allChunkUrls) {
  const chunkName = url.split('/').pop();
  // Skip chunks we already have cached
  if (chunkName.startsWith('main.') || chunkName.startsWith('276.')) continue;

  const cachePath = join(artifactsDir, `chunk-${chunkName}`);
  let content;
  try {
    content = await readFile(cachePath, 'utf8');
  } catch {
    content = await fetchText(url, chunkName);
    if (content) await writeFile(cachePath, content);
  }
  if (!content) continue;

  // Quick pre-check before full search
  const hasAnyTerm = SEARCH_TERMS.some(t => content.includes(t));
  if (!hasAnyTerm) continue;

  process.stdout.write(`  Searching ${chunkName} (${content.length} bytes)...`);
  await searchBundle(chunkName, content);
  if (!findings.find(f => f.bundle === chunkName)) process.stdout.write(' no relevant hits\n');
}

// ── 4. Extract full Configuration API URLs ────────────────────────────────────

console.log('\n=== Step 4: Extract all URL patterns from onlinereservation context ===');
// Re-search main bundle specifically for URL construction
try {
  const main = await readFile(join(artifactsDir, 'main-bundle.js'), 'utf8');
  // Find every occurrence of http.get / http.post near the onlineApi variable
  const urlPatterns = [];
  let idx = 0;
  while (true) {
    const pos = main.indexOf('this.http.', idx);
    if (pos === -1) break;
    const region = main.slice(Math.max(0, pos - 100), Math.min(main.length, pos + 500));
    if (region.includes('onlineApi') || region.includes('BaseUrl') || region.includes('onlinereservation')) {
      urlPatterns.push({ pos, region });
    }
    idx = pos + 1;
  }
  console.log(`Found ${urlPatterns.length} http calls near onlineApi in main bundle`);
  for (const { pos, region } of urlPatterns.slice(0, 20)) {
    console.log(`\n  pos ${pos}:`);
    console.log(`  ${region.replace(/\n/g, ' ')}`);
  }
} catch {}

// ── 5. Save findings ──────────────────────────────────────────────────────────

const outPath = join(artifactsDir, 'search-url-findings.json');
await writeFile(outPath, JSON.stringify(findings, null, 2));
console.log(`\nFindings saved to: ${outPath}`);
