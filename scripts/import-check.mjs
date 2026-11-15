// Import round trip through the real UI: forge a piece, export it as MP3, import that MP3, and
// check the melody it hears is really part of the piece's melody.
//   EPYC_URL=http://localhost:3211 node scripts/import-check.mjs <outDir> [styles=titan,neon] [into=darkcello]
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const base = process.env.EPYC_URL || 'http://localhost:3211';
const [out, ...rest] = process.argv.slice(2);
const arg = (k, d) => (rest.find((a) => a.startsWith(k + '=')) || '').split('=')[1] ?? d;
const styles = arg('styles', 'titan,neon,carousel').split(',').filter(Boolean);
// files=a.wav,b.mp3: import these as they are and print what was heard (no source to compare with)
const files = arg('files', '').split(',').filter(Boolean);
const into = arg('into', 'darkcello');
mkdirSync(out, { recursive: true });
const fails = [];
const check = (ok, what) => {
  console.log(ok ? '  ok  ' : '  FAIL', what);
  if (!ok) fails.push(what);
};
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, acceptDownloads: true });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(base + '/');
await page.waitForSelector('.studio');
await page.waitForTimeout(800);
const st = () => page.evaluate(() => window.__epyc.store.getState());

for (const file of files) {
  const before = (await st()).score?.title ?? '';
  await page.evaluate(() => window.__epyc.store.setState({ toast: null }));
  await page.setInputFiles('[data-testid="import-file"]', file);
  await page.waitForFunction((t) => {
    const s = window.__epyc.store.getState();
    return !s.importing && s.phase === 'ready' && ((s.score && s.score.title !== t && s.score.origin) || s.toast);
  }, before, { timeout: 120000 });
  await page.waitForTimeout(400);
  const g = await page.evaluate(() => {
    const s = window.__epyc.store.getState();
    return { motif: s.motif, phrases: s.heard?.phrases.map((p) => p.notes.join(' ') + (p.loose ? ' (loose)' : '')), spans: s.heard?.phrases.map((p) => [p.from, p.to]), toast: s.toast, origin: s.score?.origin, beats: s.score?.events.length, insight: s.score?.insights.find((i) => i.title.startsWith('Melody'))?.body };
  });
  console.log(`file ${file.split(/[\/]/).pop()}`);
  console.log(`  motif ${g.motif.join(' ')} · ${g.beats} events · phrases: ${(g.phrases || []).join(' | ')}`);
  console.log(`  spans ${(g.spans || []).map(([a, b]) => a.toFixed(1) + '-' + b.toFixed(1)).join(' ')}`);
  console.log(`  toast: ${g.toast}`);
  console.log(`  mind:  ${g.insight}`);
  check(!!g.origin && g.beats > 0, 'a piece was forged from it');
}

for (const style of styles) {
  console.log('source →', style);
  await page.click(`[data-world="${style}"]`);
  await page.waitForTimeout(300);
  const prev = (await st()).score?.title;
  await page.click('[data-testid="forge"]');
  await page.waitForFunction((t) => {
    const s = window.__epyc.store.getState();
    return s.phase === 'ready' && s.score && s.score.title !== t;
  }, prev, { timeout: 60000 });
  const src = await page.evaluate(() => {
    const s = window.__epyc.store.getState().score;
    return { title: s.title, key: s.keyName, tonic: s.tonicPc, melody: s.melody.map((n) => n.m), timed: s.melody.map((n) => [+(n.t * 60 / s.bpm).toFixed(2), n.m]), secs: s.durationSec };
  });
  await page.click('[data-testid="download"]');
  await page.waitForSelector('[data-testid="dl-mp3"]');
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 240000 }), page.click('[data-testid="dl-mp3"]')]);
  const file = `${out}/${style}.mp3`;
  await dl.saveAs(file);
  await page.waitForSelector('[data-testid="dl-done"]', { timeout: 15000 });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // now import it into another mode
  await page.click(`[data-world="${into}"]`);
  await page.waitForFunction(() => window.__epyc.store.getState().phase === 'ready', null, { timeout: 60000 });
  const before = (await st()).score?.title;
  const t0 = Date.now();
  await page.setInputFiles('[data-testid="import-file"]', file);
  await page.waitForFunction((t) => {
    const s = window.__epyc.store.getState();
    return (s.phase === 'ready' && s.score && s.score.title !== t && s.score.origin) || s.toast;
  }, before, { timeout: 120000 });
  const got = await page.evaluate(() => {
    const s = window.__epyc.store.getState();
    return { toast: s.toast, motif: s.motif, origin: s.score?.origin, style: s.styleId, phrases: s.heard?.phrases.map((p) => p.notes), spans: s.heard?.phrases.map((p) => [p.from, p.to]), insight: s.score?.insights.find((i) => i.title.startsWith('Melody'))?.body };
  });
  const took = Date.now() - t0;
  writeFileSync(`${out}/${style}.json`, JSON.stringify({ src, got }));
  if (!got.origin) {
    check(false, `${style}: no melody heard (${got.toast})`);
    continue;
  }
  // octave-free comparison: is the heard phrase a contiguous stretch of the source melody?
  const pcs = (a) => a.map((m) => ((m % 12) + 12) % 12);
  const heardPcs = pcs(got.motif).join(',');
  const srcPcs = pcs(src.melody).join(',');
  const exact = srcPcs.includes(heardPcs);
  // time-aligned: of the written melody notes inside the phrase's span, how many were heard, in order?
  // (the audio also carries fills and counter-lines in the melody's gaps, so extra heard notes are expected)
  const recall = (notes, [a, b]) => {
    // a quick repeat of the same note is often heard as one long note (a known limit, reported apart)
    const want = pcs(src.timed.filter(([t]) => t >= a - 0.2 && t < b - 0.1).map(([, m]) => m)).filter((p, i, arr) => i === 0 || p !== arr[i - 1]);
    const h = pcs(notes);
    let j = 0;
    let hit = 0;
    for (const w of want) {
      const k = h.indexOf(w, j);
      if (k >= 0) {
        hit++;
        j = k + 1;
      }
    }
    return want.length ? hit / want.length : 0;
  };
  const rs = got.phrases.map((p, i) => recall(p, got.spans[i]));
  const alts = got.phrases.slice(1);
  const altGood = rs.slice(1).filter((r) => r >= 0.8).length;
  const uniq = new Set(got.phrases.map((p) => pcs(p).join(','))).size;
  console.log(`  source "${src.title}" ${src.key} · heard ${got.motif.join(' ')} at ${got.origin.from.toFixed(1)}–${got.origin.to.toFixed(1)}s in ${took} ms`);
  console.log(`  other phrases: ${alts.map((p, i) => p.join(' ') + ` (${Math.round(rs[i + 1] * 100)}%)`).join(' | ') || '(none)'}`);
  check(got.style === into, `the new piece is in ${into}`);
  check(rs[0] >= 0.8, `${style}: the chosen phrase holds ${Math.round(rs[0] * 100)}% of the written melody in its span${exact ? ' (and is an exact stretch of it)' : ''}`);
  console.log(`  info  ${altGood}/${alts.length} other phrases hold ≥80% of the written melody in their span`);
  check(uniq === got.phrases.length, `${style}: no phrase repeats another`);
  check(!!got.insight, 'the Composer’s Mind says where the melody came from');
  await page.screenshot({ path: `${out}/import-${style}.png` });
}

// another phrase
if ((await st()).heard?.phrases.length > 1) {
  const before = (await st()).motif.join();
  await page.click('[data-testid="next-phrase"]');
  await page.waitForFunction((b) => {
    const s = window.__epyc.store.getState();
    return s.phase === 'ready' && s.motif.join() !== b;
  }, before, { timeout: 60000 });
  check(true, `Another phrase → ${(await st()).motif.join(' ')}`);
}
// drag and drop: a real DataTransfer carrying the last export
if (styles.length) {
  const last = `${out}/${styles[styles.length - 1]}.mp3`;
  const b64 = (await import('node:fs')).readFileSync(last).toString('base64');
  const before = (await st()).score?.title;
  await page.evaluate((data) => {
    window.__dropTest = new DataTransfer();
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    window.__dropTest.items.add(new File([bytes], 'dropped tune.mp3', { type: 'audio/mpeg' }));
    window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: window.__dropTest, bubbles: true }));
  }, b64);
  await page.waitForTimeout(200);
  check(await page.isVisible('.drop-veil'), 'dragging a file over the studio shows the drop veil');
  await page.evaluate(() => window.dispatchEvent(new DragEvent('drop', { dataTransfer: window.__dropTest, bubbles: true, cancelable: true })));
  await page.waitForFunction((t) => {
    const s = window.__epyc.store.getState();
    return (s.phase === 'ready' && s.score && s.score.title !== t && s.score.origin) || s.toast;
  }, before, { timeout: 120000 });
  const o = (await st()).score?.origin;
  check(o?.name === 'dropped tune' && !(await page.isVisible('.drop-veil')), `dropping it imports it (from "${o?.name}")`);
  await page.waitForTimeout(300);
}
// a file that is not audio
await page.setInputFiles('[data-testid="import-file"]', { name: 'notes.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from('definitely not audio') });
await page.waitForFunction(() => window.__epyc.store.getState().toast, null, { timeout: 30000 });
const toast = (await st()).toast;
check(/could not be decoded/.test(toast || ''), `a broken file explains itself: "${toast}"`);
check(errors.filter((e) => !/decod/i.test(e)).length === 0, `console clean ${errors.length ? JSON.stringify(errors.slice(0, 3)) : ''}`);
await browser.close();
console.log(fails.length ? `\n${fails.length} FAILED` : '\nall good');
process.exit(fails.length ? 1 : 0);
