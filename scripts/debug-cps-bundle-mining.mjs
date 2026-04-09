#!/usr/bin/env node
/**
 * Task 3: Mine the live Angular bundle for the real tee time search request shape.
 *
 * Downloads main.*.js and the TeetimeModule chunk (276.*.js), searches for
 * known API-related terms, extracts context windows, and writes
 * scripts/cps-artifacts/bundle-findings.md.
 *
 * Run: node scripts/debug-cps-bundle-mining.mjs
 */

import { mkdir, writeFile, readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const artifactsDir = join(__dir, 'cps-artifacts');
await mkdir(artifactsDir, { recursive: true });

// ── Fetch bundles ─────────────────────────────────────────────────────────────

// First: get the current bundle hashes from the HTML
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

console.log('Fetching index HTML to find current bundle hashes...');
const html = await fetchText('https://premiergolf.cps.golf/onlineresweb/');
const scriptMatches = [...html.matchAll(/src="([^"]*\.js)"/g)].map(m => m[1]);
console.log('Script tags found:', scriptMatches.length);

// Find main and chunk 276 (TeetimeModule)
const mainUrl = scriptMatches.find(s => s.includes('main.') && !s.includes('chunk'))
  || 'https://premiergolf.cps.golf/onlineresweb/main.5565433da59b56f2.js';
const teetimeUrl = scriptMatches.find(s => s.includes('276.'))
  || 'https://premiergolf.cps.golf/onlineresweb/276.250989493077ad17.js';

// Resolve relative URLs
const resolveUrl = (path) => path.startsWith('http') ? path : `https://premiergolf.cps.golf/onlineresweb/${path.replace(/^\/onlineresweb\//, '')}`;
const mainFullUrl = resolveUrl(mainUrl);
const teetimeFullUrl = resolveUrl(teetimeUrl);

console.log(`Main bundle:     ${mainFullUrl}`);
console.log(`Teetime chunk:   ${teetimeFullUrl}`);

// Download bundles (cache locally to avoid re-downloading)
const mainCachePath = join(artifactsDir, 'main-bundle.js');
const teeCachePath = join(artifactsDir, 'teetime-chunk.js');

let mainBundle, teetimeChunk;
try {
  mainBundle = await readFile(mainCachePath, 'utf8');
  console.log(`Main bundle loaded from cache (${mainBundle.length} bytes)`);
} catch {
  console.log('Downloading main bundle...');
  mainBundle = await fetchText(mainFullUrl);
  await writeFile(mainCachePath, mainBundle);
  console.log(`Main bundle downloaded (${mainBundle.length} bytes)`);
}

try {
  teetimeChunk = await readFile(teeCachePath, 'utf8');
  console.log(`Teetime chunk loaded from cache (${teetimeChunk.length} bytes)`);
} catch {
  console.log('Downloading teetime chunk...');
  teetimeChunk = await fetchText(teetimeFullUrl);
  await writeFile(teeCachePath, teetimeChunk);
  console.log(`Teetime chunk downloaded (${teetimeChunk.length} bytes)`);
}

// ── Search terms ──────────────────────────────────────────────────────────────

const SEARCH_TERMS = [
  'SearchTeetimes',
  'SearchTeeTimes',
  'GetTeeSheet',
  'GetAvailableTimeSheet',
  'protectedSearchTeeTime',
  'x-componentid',
  'x-websiteid',
  'x-siteid',
  'x-terminalid',
  'X-TerminalId',
  'x-moduleid',
  'x-requestid',
  'x-productid',
  'myconnect/token/short',
  'onlineResBaseUrl',
  'resourceServer',
  'GetAllOptions',
  'teeTimeSearch',
  'teeTimeService',
  'getTeeTime',
];

function findAllOccurrences(source, term) {
  const results = [];
  let idx = 0;
  while (true) {
    const pos = source.indexOf(term, idx);
    if (pos === -1) break;
    results.push(pos);
    idx = pos + 1;
  }
  return results;
}

function extractContext(source, pos, before = 800, after = 1500) {
  const start = Math.max(0, pos - before);
  const end = Math.min(source.length, pos + term.length + after);
  return source.slice(start, end);
}

// ── Mine both bundles ─────────────────────────────────────────────────────────

const findings = [];

for (const [bundleName, bundleContent] of [['main', mainBundle], ['teetime-chunk-276', teetimeChunk]]) {
  for (const term of SEARCH_TERMS) {
    const hits = findAllOccurrences(bundleContent, term);
    if (hits.length === 0) {
      findings.push({ bundle: bundleName, term, count: 0, contexts: [] });
      continue;
    }
    const contexts = hits.slice(0, 5).map(pos => {
      const start = Math.max(0, pos - 800);
      const end = Math.min(bundleContent.length, pos + term.length + 1500);
      return {
        position: pos,
        context: bundleContent.slice(start, end),
      };
    });
    findings.push({ bundle: bundleName, term, count: hits.length, contexts });
    console.log(`  [${bundleName}] "${term}": ${hits.length} hit(s)`);
  }
}

// ── Specific: find HTTP service calls near SearchTeetimes / GetTeeSheet ───────

function findHttpCallContext(bundleContent, bundleName, term) {
  const idx = bundleContent.indexOf(term);
  if (idx === -1) return null;
  // Look for fetch/http calls in surrounding 5000 chars
  const region = bundleContent.slice(Math.max(0, idx - 2000), Math.min(bundleContent.length, idx + 3000));
  const httpPatterns = ['fetch(', '.get(', '.post(', 'http.get', 'http.post', 'HttpClient', 'this.http.', 'xmlhttp', 'XmlHttp'];
  const found = httpPatterns.filter(p => region.toLowerCase().includes(p.toLowerCase()));
  return { term, bundle: bundleName, nearestHttpPatterns: found, region };
}

const httpContexts = [];
for (const term of ['SearchTeetimes', 'SearchTeeTimes', 'GetTeeSheet']) {
  for (const [bundleName, bundleContent] of [['main', mainBundle], ['teetime-chunk-276', teetimeChunk]]) {
    const result = findHttpCallContext(bundleContent, bundleName, term);
    if (result && result.nearestHttpPatterns.length > 0) {
      httpContexts.push(result);
    }
  }
}

// ── Write findings to markdown ────────────────────────────────────────────────

const lines = [
  '# CPS Bundle Mining Findings',
  '',
  `Generated: ${new Date().toISOString()}`,
  `Main bundle URL: ${mainFullUrl}`,
  `Teetime chunk URL: ${teetimeFullUrl}`,
  '',
  '---',
  '',
  '## Hit Summary',
  '',
  '| Bundle | Term | Hits |',
  '|--------|------|------|',
];

for (const f of findings) {
  lines.push(`| ${f.bundle} | \`${f.term}\` | ${f.count} |`);
}

lines.push('', '---', '', '## HTTP Call Analysis (SearchTeetimes / GetTeeSheet)', '');

if (httpContexts.length === 0) {
  lines.push('No HTTP call patterns found near SearchTeetimes or GetTeeSheet.');
} else {
  for (const ctx of httpContexts) {
    lines.push(`### "${ctx.term}" in ${ctx.bundle}`);
    lines.push(`HTTP patterns found nearby: ${ctx.nearestHttpPatterns.join(', ')}`);
    lines.push('');
    lines.push('```javascript');
    lines.push(ctx.region.slice(0, 3000));
    lines.push('```');
    lines.push('');
  }
}

lines.push('---', '', '## Full Context Windows (terms with hits)', '');

for (const f of findings.filter(f => f.count > 0)) {
  lines.push(`### \`${f.term}\` in ${f.bundle} (${f.count} hit(s))`);
  lines.push('');
  for (const [i, ctx] of f.contexts.entries()) {
    lines.push(`**Hit ${i + 1}** (position ${ctx.position}):`);
    lines.push('');
    lines.push('```javascript');
    lines.push(ctx.context.slice(0, 2500));
    lines.push('```');
    lines.push('');
  }
}

lines.push('---', '', '## Questions to Answer', '');

// Try to answer the key questions from evidence
const searchTermHits = findings.filter(f => ['SearchTeetimes', 'SearchTeeTimes', 'GetTeeSheet'].includes(f.term) && f.count > 0);
const hasSearch = searchTermHits.length > 0;
const hasGetTeeSheet = findings.find(f => f.term === 'GetTeeSheet' && f.count > 0);
const hasGATS = findings.find(f => f.term === 'GetAvailableTimeSheet' && f.count > 0);

lines.push(`- **Is GetAvailableTimeSheet in the bundle?** ${hasGATS ? 'YES — found in bundle (unexpected)' : 'NO — confirmed absent'}`);
lines.push(`- **Is SearchTeetimes in the bundle?** ${hasSearch ? 'YES' : 'NO'}`);
lines.push(`- **Is GetTeeSheet in the bundle?** ${hasGetTeeSheet ? 'YES' : 'NO'}`);
lines.push('- **Is SearchTeetimes GET or POST?** See context windows above for fetch/http call pattern');
lines.push('- **Guest token or verified session needed?** See Task 4 probe results');
lines.push('');

const findingsPath = join(artifactsDir, 'bundle-findings.md');
await writeFile(findingsPath, lines.join('\n'));
console.log(`\nFindings saved to: ${findingsPath}`);

// Also save raw findings JSON for programmatic use
await writeFile(join(artifactsDir, 'bundle-findings.json'), JSON.stringify(findings, null, 2));

// Print the condensed answer
console.log('\n=== KEY ANSWERS ===');
console.log(`GetAvailableTimeSheet in bundle: ${hasGATS ? 'YES' : 'NO'}`);
console.log(`SearchTeetimes in bundle: ${hasSearch ? 'YES' : 'NO'}`);
console.log(`GetTeeSheet in bundle: ${hasGetTeeSheet ? 'YES' : 'NO'}`);
console.log('\nTerms with hits:');
findings.filter(f => f.count > 0).forEach(f => console.log(`  [${f.bundle}] ${f.term}: ${f.count}`));
