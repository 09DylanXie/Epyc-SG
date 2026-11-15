// Drives the studio in headless Edge: screenshots, forge timing, frame cost, audio load, export.
//   node scripts/shot.mjs <outDir> [forge] [uncap] [profile] [export] [world=<id>] [w=1440] [h=900] [dsf=1] [wait=6000]
//   EPYC_URL=http://localhost:3211 node scripts/shot.mjs ...     (e.g. against `next start`)
import { chromium } from 'playwright-core';
import { mkdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const base = process.env.EPYC_URL || 'http://localhost:3210';
const [out, ...rest] = process.argv.slice(2);
const arg = (k, d) => (rest.find((a) => a.startsWith(k + '=')) || '').split('=')[1] ?? d;
const has = (k) => rest.includes(k);
const W = +arg('w', 1440);
const H = +arg('h', 900);
mkdirSync(out, { recursive: true });
const args = ['--autoplay-policy=no-user-gesture-required', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'];
// without these the compositor is pinned to the display's refresh and every frame "costs" the same
if (has('uncap')) args.push('--disable-gpu-vsync', '--disable-frame-rate-limit');
const browser = await chromium.launch({ channel: 'msedge', headless: true, args });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: +arg('dsf', 1), acceptDownloads: true });
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`);
});
page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));

const frames = (label) =>
  page
    .evaluate(async () => {
      const f = [];
      let last = performance.now();
      const t0 = last;
      await new Promise((res) => {
        const step = (now) => {
          f.push(now - last);
          last = now;
          if (now - t0 < 2500) requestAnimationFrame(step);
          else res();
        };
        requestAnimationFrame(step);
      });
      f.shift();
      f.sort((a, b) => a - b);
      const c = document.querySelector('.sky-gl');
      const q = (p) => +f[Math.min(f.length - 1, Math.floor(f.length * p))].toFixed(2);
      const pace = window.__epyc?.pace;
      return { displayHz: Math.round(f.length / 2.5), drawsPerSec: pace ? Math.round(pace.hz / pace.every) : null, median: q(0.5), p95: q(0.95), max: q(1), canvas: c ? `${c.width}x${c.height}` : 'none' };
    })
    .then((r) => console.log(`frames ${label}`, JSON.stringify(r)));

// GPU 3D-engine utilisation of this headless browser, averaged over a few seconds (Windows only)
const gpu = (label) => {
  if (!has('gpu')) return;
  const ps = [
    "$ids = (Get-CimInstance Win32_Process -Filter \"Name='msedge.exe'\" | Where-Object { $_.CommandLine -like '*playwright*' }).ProcessId",
    "$sets = Get-Counter '\\GPU Engine(*engtype_3D)\\Utilization Percentage' -SampleInterval 1 -MaxSamples 4",
    '$tot = 0',
    'foreach ($set in $sets) { foreach ($c in $set.CounterSamples) { foreach ($p in $ids) { if ($c.InstanceName -like ("pid_" + $p + "_*")) { $tot += $c.CookedValue } } } }',
    '[math]::Round($tot / 4, 1)',
  ].join('; ');
  try {
    console.log(`gpu % ${label}`, execFileSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' }).trim());
  } catch (e) {
    console.log('gpu counter failed', String(e.message).slice(0, 200));
  }
};

const t0 = Date.now();
await page.goto(base + '/', { waitUntil: 'load' });
await page.waitForSelector('.studio', { timeout: 60000 });
console.log('studio visible after ms', Date.now() - t0);
const world = arg('world', '');
if (world) await page.click(`[data-world="${world}"]`);
await page.waitForTimeout(1500);
console.log(
  'renderer',
  await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return 'no webgl2';
    const e = gl.getExtension('WEBGL_debug_renderer_info');
    return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'unknown';
  }),
);
await page.screenshot({ path: `${out}/1-idle.png` });
await frames('idle');
gpu('idle');
if (has('forge')) {
  for (const code of ['KeyA', 'KeyD', 'KeyG', 'KeyF', 'KeyS']) {
    await page.keyboard.down(code);
    await page.waitForTimeout(140);
    await page.keyboard.up(code);
    await page.waitForTimeout(60);
  }
  await page.click('[data-pad="2-0"]');
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${out}/2-motif.png` });
  console.log('tray notes', await page.locator('[data-testid="tray"] .note-chip').count());
  await page.evaluate(() => {
    window.__long = [];
    window.__t0 = performance.now();
    new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__long.push(`${Math.round(e.startTime - window.__t0)}+${Math.round(e.duration)}`))).observe({ entryTypes: ['longtask'] });
  });
  const f0 = Date.now();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/3-forging.png` });
  await page.waitForSelector('[data-testid="title"]', { timeout: 120000 });
  console.log('forge ms', Date.now() - f0, 'title', await page.textContent('[data-testid="title"]'));
  console.log('forge split', JSON.stringify(await page.evaluate(() => Object.fromEntries(Object.entries(window.__epyc.forgeTiming).map(([k, v]) => [k, Math.round(v)])))));
  await page.waitForTimeout(+arg('wait', 6000));
  await page.screenshot({ path: `${out}/4-playing.png` });
  await frames('playing');
  gpu('playing');
  console.log('longtasks at+dur (ms after Enter)', JSON.stringify(await page.evaluate(() => window.__long)));
  // the loudest movement
  await page.evaluate(() => {
    const { player, store } = window.__epyc;
    const sc = store.getState().score;
    const climax = sc.sections.reduce((a, b) => (b.energy > a.energy ? b : a));
    player.seek(climax.startBeat + 6);
  });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/5-climax.png` });
  await frames('climax');
  gpu('climax');
  if (has('profile')) {
    // audio-thread cost: offline render time / audio time for each 3 s of the piece
    const prof = await page.evaluate(async () => {
      const { player, store } = window.__epyc;
      player.pause();
      const sc = store.getState().score;
      const t = performance.now();
      const chunks = await player.profile();
      const wall = performance.now() - t;
      const spb = 60 / sc.bpm;
      const per = sc.sections.map((s) => {
        const a = s.startBeat * spb;
        const b = (s.startBeat + s.beats) * spb;
        const c = chunks.filter((x) => x.t > a && x.t <= b + 3).map((x) => x.load);
        return `${s.name}: ${c.length ? Math.max(...c).toFixed(2) : '-'}`;
      });
      return { seconds: Math.round(sc.durationSec), renderMs: Math.round(wall), peak: +Math.max(...chunks.map((c) => c.load)).toFixed(2), per };
    });
    console.log('audio load (render / realtime)', JSON.stringify(prof));
  }
  if (has('export')) {
    await page.evaluate(() => window.__epyc.player.pause());
    await page.click('[data-testid="download"]');
    await page.waitForSelector('[data-testid="dl-mp3"]');
    await page.screenshot({ path: `${out}/6-export.png` });
    const e0 = Date.now();
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 180000 }), page.click('[data-testid="dl-mp3"]')]);
    const file = `${out}/${dl.suggestedFilename()}`;
    await dl.saveAs(file);
    await page.waitForSelector('[data-testid="dl-done"]', { timeout: 10000 });
    console.log('export ms', Date.now() - e0, dl.suggestedFilename(), statSync(file).size, 'bytes');
    await page.screenshot({ path: `${out}/7-exported.png` });
  }
}
if (errors.length) console.log('console:', errors.slice(0, 20));
await browser.close();
