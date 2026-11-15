// Headless check that the MP3 worker bundles and encodes. Usage: node scripts/probe-mp3.mjs [baseUrl]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const base = process.argv[2] || 'http://localhost:3210';
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ acceptDownloads: true });
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.goto(base + '/lab', { waitUntil: 'networkidle' });
const dl = page.waitForEvent('download', { timeout: 60000 });
await page.click('#mp3-probe');
const d = await dl;
const out = path.join(os.tmpdir(), 'epyc-probe.mp3');
await d.saveAs(out);
const buf = fs.readFileSync(out);
console.log('log:', await page.textContent('#log'));
console.log('file bytes:', buf.length, 'head:', buf.subarray(0, 4).toString('hex'));
console.log('errors:', errors);
await browser.close();
process.exit(errors.length || buf.length < 1000 ? 1 : 0);
