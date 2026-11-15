// End-to-end tour through the real UI in headless Edge: play, forge, switch worlds, mix, cinema,
// library, seek, loop, and download every format. Exits non-zero if anything is off.
//   node scripts/tour.mjs <outDir> [w=1920] [h=1080] [worlds=baile,requiem,...]
//   EPYC_URL=http://localhost:3211 node scripts/tour.mjs ...
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const base = process.env.EPYC_URL || 'http://localhost:3210';
const [out, ...rest] = process.argv.slice(2);
const arg = (k, d) => (rest.find((a) => a.startsWith(k + '=')) || '').split('=')[1] ?? d;
const worlds = arg('worlds', 'baile,requiem,hellforge,column,carousel').split(',').filter(Boolean);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  channel: 'msedge',
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'],
});
const page = await browser.newPage({ viewport: { width: +arg('w', 1920), height: +arg('h', 1080) }, acceptDownloads: true });
const errors = [];
const fails = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`);
});
page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));
// every recorded-instrument file the page fetches, by status
const sampleHits = {};
page.on('response', (r) => {
  if (r.url().includes('/samples/')) sampleHits[r.status()] = (sampleHits[r.status()] || 0) + 1;
});
const standIns = () => page.evaluate(() => ({ ...window.__epyc.standIns }));
const check = (ok, what) => {
  console.log(ok ? '  ok  ' : '  FAIL', what);
  if (!ok) fails.push(what);
};
const state = () =>
  page.evaluate(() => {
    const { player, store } = window.__epyc;
    const s = store.getState();
    return { pos: player.position, playing: player.playing, title: s.score?.title, style: s.styleId, key: s.score?.keyName, bpm: s.score?.bpm, secs: s.score?.durationSec, section: s.sectionIdx, phase: s.phase, motif: s.motif.length, library: s.library.length, loop: s.loop, cinema: s.cinema };
  });
const ready = async (prevTitle) => {
  await page.waitForFunction((t) => {
    const s = window.__epyc.store.getState();
    return s.phase === 'ready' && s.score && s.score.title !== t;
  }, prevTitle, { timeout: 60000 });
};
const download = async (testid, label) => {
  await page.click('[data-testid="download"]');
  await page.waitForSelector(`[data-testid="${testid}"]`);
  const t = Date.now();
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 240000 }), page.click(`[data-testid="${testid}"]`)]);
  const file = `${out}/${label}-${dl.suggestedFilename()}`;
  await dl.saveAs(file);
  await page.waitForSelector('[data-testid="dl-done"]', { timeout: 15000 });
  const took = ((Date.now() - t) / 1000).toFixed(1);
  const secs = (await state()).secs;
  const split = await page.evaluate(() => `render ${(window.__epyc.exportTiming.render / 1000).toFixed(1)}s + encode ${(window.__epyc.exportTiming.encode / 1000).toFixed(1)}s`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  let report;
  try {
    report = execFileSync('node', ['scripts/check-audio.mjs', file, String(secs)], { encoding: 'utf8' }).trim();
  } catch (e) {
    report = (e.stdout || String(e)).trim();
    fails.push(`${label} file check`);
  }
  console.log(`  ${label}: ${took}s to export (${split}) · ${report}`);
};

await page.goto(base + '/', { waitUntil: 'load' });
await page.waitForSelector('.studio', { timeout: 60000 });
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/01-idle.png` });

console.log('pads and keys');
for (const code of ['KeyA', 'KeyD', 'KeyG', 'KeyF']) {
  await page.keyboard.down(code);
  await page.waitForTimeout(130);
  await page.keyboard.up(code);
  await page.waitForTimeout(50);
}
await page.click('[data-pad="2-4"]');
await page.click('[data-pad="3-0"]');
check((await state()).motif === 6, 'four keys + two pad clicks record six notes');
await page.keyboard.press('Backspace');
check((await state()).motif === 5, 'Backspace removes the last note');

console.log('forge');
{
  const si = await standIns();
  const voice = await page.evaluate(() => window.__epyc.store.getState().styleId);
  check(si.n === 0, `live pad notes in ${voice} played recordings (${si.n} stand-ins${si.last ? ', last ' + si.last : ''})`);
}
// from here on, every note that should be a recording must be one
await page.evaluate(() => { window.__epyc.standIns.n = 0; window.__epyc.standIns.last = ''; });
let t = Date.now();
await page.keyboard.press('Enter');
await ready(undefined);
let s = await state();
console.log(`  "${s.title}" · ${s.key} · ${s.bpm} BPM · ${Math.round(s.secs)}s · forged in ${Date.now() - t} ms`);
await page.waitForTimeout(2500);
const p1 = (await state()).pos;
await page.waitForTimeout(1000);
const p2 = (await state()).pos;
check(p2 > p1 + 0.5, `playback advances (${p1.toFixed(1)} → ${p2.toFixed(1)} beats)`);
check((await page.locator('[data-testid="seek"] .mark').count()) >= 3, 'the player bar is cut where each part begins');
await page.screenshot({ path: `${out}/02-playing.png` });

console.log('transport');
await page.keyboard.press('Space');
await page.waitForTimeout(200);
check(!(await state()).playing, 'Space pauses');
await page.keyboard.press('Space');
await page.waitForTimeout(200);
check((await state()).playing, 'Space resumes');
{
  // click just inside the fourth part of the bar
  const mark = await page.locator('[data-testid="seek"] .mark').nth(2).boundingBox();
  await page.mouse.click(mark.x + 8, mark.y + 4);
}
await page.waitForTimeout(400);
check((await state()).section === 3, 'clicking a part of the bar seeks to it');
await page.waitForTimeout(2200);
await page.screenshot({ path: `${out}/03-climax.png` });

console.log('mixer');
await page.getByRole('button', { name: 'Mixer', exact: true }).click();
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/04-mixer.png` });
check((await page.locator('.meter').count()) >= 6, 'mixer shows a strip per section of the orchestra');
await page.getByRole('button', { name: 'Reasoning', exact: true }).click();

console.log('immerse');
await page.getByRole('button', { name: 'Immerse', exact: true }).click();
await page.waitForTimeout(1400);
check((await state()).cinema, 'immersed');
await page.screenshot({ path: `${out}/05-cinema.png` });
// the Cinema button was just clicked and holds focus: Space must still mean play / pause
await page.keyboard.press('Space');
await page.waitForTimeout(200);
s = await state();
check(s.cinema && !s.playing, 'Space pauses even though a clicked button has focus');
await page.keyboard.press('Space');
await page.waitForTimeout(200);
check((await state()).playing, 'and resumes');
await page.keyboard.press('Escape');
await page.waitForTimeout(900);
check(!(await state()).cinema, 'Esc leaves it');

console.log('downloads');
await download('dl-mp3', 'titan-mp3');
await download('dl-wav', 'titan-wav');

for (const w of worlds) {
  console.log('mode →', w);
  const before = (await state()).title;
  t = Date.now();
  await page.click(`[data-world="${w}"]`);
  await ready(before);
  s = await state();
  check(s.style === w, `re-scored as ${w}: "${s.title}" · ${s.key} · ${s.bpm} BPM in ${Date.now() - t} ms`);
  await page.waitForTimeout(5000);
  check((await state()).playing, 'playing');
  await page.screenshot({ path: `${out}/world-${w}.png` });
  await download('dl-mp3', `${w}-mp3`);
}

const dropWorld = arg('drop', 'titan');
let extra = 0;
if (dropWorld !== 'none') {
  console.log('build & drop →', dropWorld);
  const before = (await state()).title;
  if ((await state()).style !== dropWorld) {
    await page.click(`[data-world="${dropWorld}"]`);
    await ready(before);
    extra++;
  }
  const plainSecs = await page.evaluate(() => window.__epyc.store.getState().score.sections.length);
  // with a piece already loaded, the toggle alone must rewrite it
  await page.click('[data-drop]');
  check(await page.evaluate(() => window.__epyc.store.getState().drop), 'Build & Drop switches on');
  await page.waitForFunction(() => {
    const s = window.__epyc.store.getState();
    return s.phase === 'ready' && s.score && s.score.insights.some((i) => i.title === 'Build-up & drop');
  }, null, { timeout: 60000 });
  extra++;
  check((await state()).playing, 'the rewritten piece plays');
  const d = await page.evaluate(() => {
    const sc = window.__epyc.store.getState().score;
    return { secs: sc.sections.map((x) => `${x.name}[${x.kind}]`), insight: sc.insights.some((i) => i.title === 'Build-up & drop'), subs: sc.events.filter((e) => e.i === 'subDrop').length };
  });
  console.log('  ', d.secs.join(' > '));
  check(d.secs.length >= plainSecs, `same notes, same seed, now ${d.secs.length} parts (was ${plainSecs})`);
  check(d.insight && d.subs > 0, `the piece has a build-up and drop (${d.subs} sub drops)`);
  const prefs = await page.evaluate(() => JSON.parse(localStorage.getItem('epyc-sg.prefs.v1') || '{}').drop);
  check(prefs === true, 'the choice is remembered');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${out}/07-drop.png` });
  await download('dl-mp3', `${dropWorld}-drop-mp3`);
}

console.log('library');
await page.getByRole('button', { name: /^Library/ }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/06-library.png` });
s = await state();
check(s.library === 1 + worlds.length + extra, `library holds every piece forged (${s.library})`);

{
  const si = await standIns();
  console.log('  samples fetched by status:', JSON.stringify(sampleHits));
  check(si.n === 0, `every string, brass and flute note played its recording (${si.n} synth stand-ins${si.last ? ', last ' + si.last : ''})`);
  check(!Object.keys(sampleHits).some((k) => +k >= 400), 'no sample request failed');
}
if (errors.length) console.log('console:', errors.slice(0, 20));
check(errors.length === 0, 'console is clean');
await browser.close();
console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join('; ')}` : '\nall good');
process.exit(fails.length ? 1 : 0);
