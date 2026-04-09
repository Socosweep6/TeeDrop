#!/usr/bin/env node
/**
 * Task 3b: Extract the exact HTTP request shape for SearchTeetimes / GetTeeSheet
 * from the cached bundle files. Reads from scripts/cps-artifacts/ — run bundle-mining first.
 *
 * Run: node scripts/debug-cps-extract-request-shape.mjs
 */

import { readFile, writeFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const artifactsDir = join(__dir, 'cps-artifacts');

// Load cached bundles
let mainBundle, teetimeChunk;
try {
  mainBundle = await readFile(join(artifactsDir, 'main-bundle.js'), 'utf8');
  teetimeChunk = await readFile(join(artifactsDir, 'teetime-chunk.js'), 'utf8');
  console.log(`Bundles loaded: main=${mainBundle.length} bytes, chunk=${teetimeChunk.length} bytes`);
} catch (e) {
  console.error('Run debug-cps-bundle-mining.mjs first to cache the bundles.');
  process.exit(1);
}

const bundles = [['teetime-chunk-276', teetimeChunk], ['main', mainBundle]];

function extractWindows(src, term, before = 1500, after = 3000, max = 3) {
  const results = [];
  let idx = 0;
  while (results.length < max) {
    const pos = src.indexOf(term, idx);
    if (pos === -1) break;
    results.push({ pos, text: src.slice(Math.max(0, pos - before), Math.min(src.length, pos + term.length + after)) });
    idx = pos + 1;
  }
  return results;
}

const output = [];

// ── 1. Find SearchTeetimes call sites ─────────────────────────────────────────

console.log('\n=== SearchTeetimes context windows ===');
for (const [name, src] of bundles) {
  const windows = extractWindows(src, 'SearchTeetimes', 1500, 3000, 3);
  for (const { pos, text } of windows) {
    output.push(`\n--- [${name}] SearchTeetimes @ pos ${pos} ---\n${text}\n`);
    console.log(`[${name}] SearchTeetimes @ pos ${pos}: ...${text.slice(1400, 1600).replace(/\n/g, ' ')}...`);
  }
}

// ── 2. Find GetTeeSheet call sites ────────────────────────────────────────────

console.log('\n=== GetTeeSheet context windows ===');
for (const [name, src] of bundles) {
  const windows = extractWindows(src, 'GetTeeSheet', 1500, 3000, 3);
  for (const { pos, text } of windows) {
    output.push(`\n--- [${name}] GetTeeSheet @ pos ${pos} ---\n${text}\n`);
    console.log(`[${name}] GetTeeSheet @ pos ${pos}: ...${text.slice(1400, 1600).replace(/\n/g, ' ')}...`);
  }
}

// ── 3. Find protectedSearchTeeTimeService ─────────────────────────────────────

console.log('\n=== protectedSearchTeeTime context ===');
for (const [name, src] of bundles) {
  const windows = extractWindows(src, 'protectedSearchTeeTime', 1500, 4000, 2);
  for (const { pos, text } of windows) {
    output.push(`\n--- [${name}] protectedSearchTeeTime @ pos ${pos} ---\n${text}\n`);
    console.log(`[${name}] protectedSearchTeeTime @ pos ${pos}: ...${text.slice(1400, 1700).replace(/\n/g, ' ')}...`);
  }
}

// ── 4. Find URL template construction — look for /onlinereservation/ near params ──

console.log('\n=== URL patterns near onlinereservation/ ===');
for (const [name, src] of bundles) {
  // Find occurrences that look like URL template strings with course/search params
  const patterns = [
    'courseId',
    'bookingDate',
    'SearchTeetimes',
    'GetTeeSheet',
    'onlinereservation',
  ];
  for (const pat of patterns) {
    const wins = extractWindows(src, pat, 300, 800, 2);
    for (const { pos, text } of wins) {
      // Only show if it looks like a URL being constructed
      if (text.includes('http') || text.includes('Base') || text.includes('this.') || text.includes('url') || text.includes('Url')) {
        output.push(`\n--- [${name}] URL construction near "${pat}" @ pos ${pos} ---\n${text}\n`);
      }
    }
  }
}

// ── 5. Find header injection block ────────────────────────────────────────────

console.log('\n=== Header injection block (x-componentid region) ===');
for (const [name, src] of bundles) {
  const wins = extractWindows(src, 'x-componentid', 200, 2000, 2);
  for (const { pos, text } of wins) {
    output.push(`\n--- [${name}] x-componentid header block @ pos ${pos} ---\n${text}\n`);
    console.log(`[${name}] x-componentid @ pos ${pos}: ...${text.slice(150, 400).replace(/\n/g, ' ')}...`);
  }
}

// ── 6. Find myconnect/token/short usage ───────────────────────────────────────

console.log('\n=== myconnect/token/short usage ===');
for (const [name, src] of bundles) {
  const wins = extractWindows(src, 'myconnect/token/short', 300, 2000, 2);
  for (const { pos, text } of wins) {
    output.push(`\n--- [${name}] myconnect/token/short @ pos ${pos} ---\n${text}\n`);
    console.log(`[${name}] myconnect/token/short @ pos ${pos}: ...${text.slice(280, 500).replace(/\n/g, ' ')}...`);
  }
}

// ── Save full output ──────────────────────────────────────────────────────────

const outPath = join(artifactsDir, 'request-shape-extraction.txt');
await writeFile(outPath, output.join('\n'));
console.log(`\nFull extraction saved to: ${outPath}`);
console.log(`(${output.join('\n').length} bytes)`);
console.log('\nPaste the content of that file for analysis.');
