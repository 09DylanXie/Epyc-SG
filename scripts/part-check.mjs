// Right-click on a part of the timeline, through the real UI: the menu opens on the part under the
// cursor; "Melody to JAM" puts that part's lead line (notes + rhythm) on the pads and a new piece
// is forged from it; "Download this part" exports only that part (its length, nothing from the rest).
//   node scripts/part-check.mjs <outDir>          (EPYC_URL=http://localhost:3211 for production)
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const base = process.env.EPYC_URL || 'http://localhost:3210';
const [out] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, acceptDownloads: true });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
const fails = [];
const check = (ok, what) => {
  console.log(ok ? '  ok  ' : '  FAIL', what);
  if (!ok) fails.push(what);
};
const newScore = async (act) => {
  await page.evaluate(() => (window.__prevScore = window.__epyc.store.getState().score));
  await act();
  await page.waitForFunction(() => {
    const s = window.__epyc.store.getState();
    return s.phase === 'ready' && s.score && s.score !== window.__prevScore;
  }, null, { timeout: 90000 });
};
/** right-click the middle of part i on the seek bar */
const rightClickPart = async (i) => {
  const at = await page.evaluate((i) => {
    const { store, player } = window.__epyc;
    const sc = store.getState().score;
    const span = store.getState().partSpan(i);
    const total = player.endBeat || sc.totalBeats;
    const r = document.querySelector('[data-testid="seek"]').getBoundingClientRect();
    return { x: r.left + (((span.from + span.to) / 2) / total) * r.width, y: r.top + r.height / 2 };
  }, i);
  await page.mouse.click(at.x, at.y, { button: 'right' });
  await page.waitForSelector('[data-testid="part-menu"]', { timeout: 5000 });
};

await page.goto(base + '/', { waitUntil: 'load' });
await page.waitForSelector('.studio', { timeout: 60000 });
await page.waitForTimeout(800);
await page.click('[data-world="titan"]');
await page.waitForFunction(() => window.__epyc.store.getState().phase !== 'forging', null, { timeout: 60000 });
await newScore(() => page.click('[data-testid="forge"]'));
const src = await page.evaluate(() => {
  const sc = window.__epyc.store.getState().score;
  return { title: sc.title, bpm: sc.bpm, sections: sc.sections.map((s) => ({ name: s.name, kind: s.kind, startBeat: s.startBeat })), melody: sc.melody, posBefore: window.__epyc.player.position };
});
const themeIdx = Math.max(1, src.sections.findIndex((s) => s.kind === 'theme'));
console.log(`piece "${src.title}" · ${src.sections.map((s) => s.name).join(' | ')}`);

// 1. the menu opens on the right part, and the right-click doesn't seek
const pos0 = await page.evaluate(() => (window.__epyc.player.pause(), window.__epyc.player.position));
await rightClickPart(themeIdx);
const menuText = await page.textContent('[data-testid="part-menu"]');
const pos1 = await page.evaluate(() => window.__epyc.player.position);
await page.screenshot({ path: `${out}/menu.png` });
check(menuText.includes(src.sections[themeIdx].name), `the menu names the part under the cursor (${src.sections[themeIdx].name})`);
check(Math.abs(pos1 - pos0) < 0.01, 'right-clicking does not move the playhead');
await page.keyboard.press('Escape');
check((await page.$('[data-testid="part-menu"]')) === null, 'Escape closes the menu');

// 2. Melody to JAM
await rightClickPart(themeIdx);
await page.click('[data-testid="part-jam"]');
const jam = await page.evaluate(() => {
  const s = window.__epyc.store.getState();
  return { motif: s.motif, origin: s.origin, capture: s.capture, toast: s.toast };
});
// what the part's lead line actually was
const span = await page.evaluate((i) => window.__epyc.store.getState().partSpan(i), themeIdx);
const line = src.melody.filter((n) => n.t >= span.from - 1e-6 && n.t < span.to - 1e-6).sort((a, b) => a.t - b.t);
const spb = 60 / src.bpm;
console.log(`  JAM: ${jam.motif.join(' ')} · "${jam.toast}"`);
check(jam.motif.length >= 2 && jam.capture, `the pads hold ${jam.motif.length} notes from the part`);
const pcs = (a) => a.map((m) => ((m % 12) + 12) % 12).join(',');
check(pcs(jam.motif) === pcs(line.slice(0, jam.motif.length).map((n) => n.m)), 'they are the part’s own lead-line notes, in order');
const rhOk = jam.origin?.own && jam.origin.rhythm?.length === jam.motif.length && jam.origin.rhythm.every(([t], j) => Math.abs(t - (line[j].t - line[0].t) * spb) < 0.002);
check(!!rhOk, 'with their rhythm (onsets in seconds, to the millisecond)');

// …and a new piece from them, in another mode
await page.click('[data-world="fallen"]');
await page.waitForFunction(() => window.__epyc.store.getState().phase !== 'forging', null, { timeout: 60000 });
await newScore(() => page.click('[data-testid="forge"]'));
const made = await page.evaluate(() => {
  const sc = window.__epyc.store.getState().score;
  return { input: sc.input, style: window.__epyc.store.getState().styleId, mel: sc.insights.find((i) => i.title.startsWith('Melody'))?.body, rh: sc.insights.find((i) => i.title.startsWith('Rhythm'))?.body };
});
console.log(`  new piece in ${made.style}: ${made.mel?.slice(0, 100)}… | ${made.rh?.slice(0, 80)}…`);
check(made.input.join() === jam.motif.join(), 'the new piece is built on those notes');
check(/your piece/.test(made.mel || '') && /own timing/.test(made.rh || ''), 'and the Composer’s Mind says they came from your piece, timing kept');

// 3. Download this part
const parts = await page.evaluate(() => window.__epyc.store.getState().score.sections.length);
const pi = Math.min(parts - 1, 2);
await rightClickPart(pi);
const pspan = await page.evaluate((i) => {
  const s = window.__epyc.store.getState();
  return { ...s.partSpan(i), bpm: s.score.bpm, name: s.score.sections[i].name, whole: s.score.durationSec };
}, pi);
await page.click('[data-testid="part-export"]');
await page.waitForSelector('[data-testid="dl-part"]');
const label = await page.textContent('[data-testid="dl-part"]');
check(label.includes(pspan.name), `the export dialog says it is just ${pspan.name}`);
const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 240000 }), page.click('[data-testid="dl-wav"]')]);
const file = `${out}/part-${dl.suggestedFilename()}`;
await dl.saveAs(file);
await page.waitForSelector('[data-testid="dl-done"]', { timeout: 15000 });
const want = ((pspan.to - pspan.from) * 60) / pspan.bpm + 2.5 + 0.06;
let rep;
try {
  rep = JSON.parse(execFileSync('node', ['scripts/check-audio.mjs', file, String(want)], { encoding: 'utf8' }).trim());
} catch (e) {
  rep = JSON.parse((e.stdout || '{}').trim() || '{}');
}
console.log(`  part file: ${rep.file} · ${rep.seconds}s (part ${want.toFixed(2)}s, whole piece ${pspan.whole.toFixed(1)}s) · peak ${rep.peakDb} dB · problems ${JSON.stringify(rep.problems)}`);
check(dl.suggestedFilename().includes(`(${pspan.name})`), 'the file is named after the part');
check(Math.abs(rep.seconds - want) < 0.1, 'the file is that part’s length (plus the ring-out), not the whole piece');
check(rep.longestSilenceSec < 1 && rep.peakDb > -3, 'and it has sound all the way through');
// the whole-piece export is unaffected: opening Export normally has no part
await page.keyboard.press('Escape');
await page.click('[data-testid="download"]');
check((await page.$('[data-testid="dl-part"]')) === null, 'the normal Export button still exports the whole piece');
await page.keyboard.press('Escape');

check(errors.length === 0, `no console errors${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
await browser.close();
console.log(fails.length ? `\n${fails.length} FAILED` : '\nall good');
process.exit(fails.length ? 1 : 0);
