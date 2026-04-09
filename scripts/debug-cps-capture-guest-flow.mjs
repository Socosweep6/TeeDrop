#!/usr/bin/env node
/**
 * Task 2: Capture a clean guest browser session
 *
 * Fresh Playwright context (no stored auth), hooks both Playwright network events
 * and window.fetch / XHR inside the page, navigates to three CPS entry points,
 * and saves all API traffic to scripts/cps-artifacts/guest-flow-log.json.
 *
 * Run: node scripts/debug-cps-capture-guest-flow.mjs
 */

import { mkdir, writeFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const artifactsDir = join(__dir, 'cps-artifacts');
await mkdir(artifactsDir, { recursive: true });

const API_PATTERNS = ['identityapi', 'onlineapi', 'onlinereservation'];
const isApiUrl = url => API_PATTERNS.some(p => url.includes(p));

const log = {
  playwrightRequests: [],
  playwrightResponses: [],
  browserHooks: [],
};

// ── Playwright ────────────────────────────────────────────────────────────────

const { chromium } = await import('playwright');
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  // No storageState — fresh session
});

await context.clearCookies();
const page = await context.newPage();

// Playwright-level request capture
page.on('request', req => {
  const url = req.url();
  if (!isApiUrl(url)) return;
  const entry = {
    ts: new Date().toISOString(),
    method: req.method(),
    url,
    headers: req.headers(),
    postData: req.postData() || null,
  };
  log.playwrightRequests.push(entry);
  console.log(`  REQ ${req.method()} ${url.slice(0, 100)}`);
  if (entry.postData) console.log(`    body: ${entry.postData.slice(0, 200)}`);
});

page.on('response', async resp => {
  const url = resp.url();
  if (!isApiUrl(url)) return;
  let body = null;
  try {
    const text = await resp.text();
    try { body = JSON.parse(text); } catch { body = text.slice(0, 2000); }
  } catch {}
  const entry = {
    ts: new Date().toISOString(),
    status: resp.status(),
    url,
    headers: resp.headers(), // already a plain object in Playwright
    body,
  };
  log.playwrightResponses.push(entry);
  const bodyStr = typeof body === 'string' ? body.slice(0, 120) : JSON.stringify(body).slice(0, 120);
  console.log(`  RESP ${resp.status()} ${url.slice(0, 100)}`);
  if (bodyStr) console.log(`    ${bodyStr}`);
});

// Browser-side fetch / XHR hook — captures requests that Playwright might miss
// due to service workers or Angular's HttpClient abstraction
await page.addInitScript(() => {
  window.__cpsLogs = [];

  // Hook fetch
  const origFetch = window.fetch.bind(window);
  window.fetch = async function (input, init = {}) {
    const url = typeof input === 'string' ? input : input.url;
    const method = (init.method || 'GET').toUpperCase();
    const headers = init.headers || {};
    const body = init.body || null;
    const t0 = Date.now();
    let status = null, respBody = null;
    try {
      const resp = await origFetch(input, init);
      status = resp.status;
      const clone = resp.clone();
      try { respBody = await clone.text(); } catch {}
      if (window.__cpsLogs && (url.includes('onlineapi') || url.includes('identityapi') || url.includes('onlinereservation'))) {
        window.__cpsLogs.push({
          type: 'fetch', method, url, headers, body, status, respBody: (respBody || '').slice(0, 2000), ms: Date.now() - t0,
        });
      }
      return resp;
    } catch (e) {
      if (window.__cpsLogs) window.__cpsLogs.push({ type: 'fetch-error', method, url, error: e.message });
      throw e;
    }
  };

  // Hook XHR
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__cpsMethod = method;
    this.__cpsUrl = url;
    return origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function (body) {
    const url = this.__cpsUrl || '';
    if (url.includes('onlineapi') || url.includes('identityapi') || url.includes('onlinereservation')) {
      this.addEventListener('loadend', () => {
        if (window.__cpsLogs) window.__cpsLogs.push({
          type: 'xhr', method: this.__cpsMethod, url, body: body ? String(body).slice(0, 500) : null,
          status: this.status, respBody: (this.responseText || '').slice(0, 2000),
        });
      });
    }
    return origSend.apply(this, arguments);
  };
});

// ── Navigate to three entry points ────────────────────────────────────────────

const PAGES = [
  'https://premiergolf.cps.golf/onlineresweb/',
  'https://premiergolf.cps.golf/reserve/jackson-park-golf-course',
  'https://premiergolf.cps.golf/onlineresweb/search-teetime/premiergolf',
];

for (const url of PAGES) {
  console.log(`\n--- Navigating: ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(e => console.log(`  nav error: ${e.message}`));
  console.log(`  landed: ${page.url()}`);
  // Give Angular time to settle and make API calls
  await new Promise(r => setTimeout(r, 4000));
}

// ── Collect browser-side hook logs ────────────────────────────────────────────

log.browserHooks = await page.evaluate(() => window.__cpsLogs || []).catch(() => []);
console.log(`\nBrowser hook entries: ${log.browserHooks.length}`);

await browser.close();

// ── Summarize what we captured ────────────────────────────────────────────────

console.log('\n=== SUMMARY ===');
console.log(`Playwright requests: ${log.playwrightRequests.length}`);
console.log(`Playwright responses: ${log.playwrightResponses.length}`);
console.log(`Browser hook entries: ${log.browserHooks.length}`);

const searchUrls = log.playwrightRequests
  .map(r => r.url)
  .filter(u => u.includes('Search') || u.includes('TeeSheet') || u.includes('Tee'));
if (searchUrls.length > 0) {
  console.log('\nTee time search requests captured:');
  searchUrls.forEach(u => console.log(`  ${u}`));
} else {
  console.log('\nNo tee time search requests captured.');
}

// Save artifacts
const logPath = join(artifactsDir, 'guest-flow-log.json');
const browserPath = join(artifactsDir, 'guest-flow-browser-hooks.json');
await writeFile(logPath, JSON.stringify(log, null, 2));
await writeFile(browserPath, JSON.stringify(log.browserHooks, null, 2));
console.log(`\nArtifacts saved:`);
console.log(`  ${logPath}`);
console.log(`  ${browserPath}`);
