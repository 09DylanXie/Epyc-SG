// Drives the /lab bench in headless Edge. Usage:
//   node scripts/lab.mjs calibrate
//   node scripts/lab.mjs render <styleId> [json-opts]
//   node scripts/lab.mjs eval "<js expression using window.__lab>"
import { chromium } from 'playwright-core';

const base = process.env.EPYC_URL || 'http://localhost:3210';
const [cmd, a, b] = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ acceptDownloads: true });
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`);
});
page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));
await page.goto(base + '/lab', { waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.__lab, null, { timeout: 30000 });
let out;
try {
  if (cmd === 'calibrate') {
    out = await page.evaluate(() => window.__lab.calibrate());
    const lines = Object.entries(out).map(([k, r]) => `${k.padEnd(10)} rms ${String(r.rms).padStart(6)}  peak ${String(r.peak).padStart(6)}  tail ${String(r.tail).padStart(5)}  gain ${String(r.gain).padStart(6)} -> ${r.next}${r.bad ? '  NaN!' : ''}`);
    console.log(lines.join('\n'));
    console.log('\nGAIN = ' + JSON.stringify(Object.fromEntries(Object.entries(out).map(([k, r]) => [k, r.next]))));
  } else if (cmd === 'render') {
    out = await page.evaluate(([s, o]) => window.__lab.render(s, o), [a, b ? JSON.parse(b) : {}]);
    console.log(JSON.stringify(out, null, 1));
  } else if (cmd === 'eval') {
    out = await page.evaluate(`(async () => (${a}))()`);
    console.log(JSON.stringify(out, null, 1));
  }
} catch (e) {
  console.log('FAILED:', e.message);
}
if (errors.length) console.log('console:', errors.slice(0, 20));
await browser.close();
