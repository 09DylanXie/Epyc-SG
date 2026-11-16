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
  await page.evaluate(() => (window.__prevScore = window.__epyc.store.getState().score));
  await page.click('[data-testid="forge"]');
  await page.waitForFunction(() => {
    const s = window.__epyc.store.getState();
    return s.phase === 'ready' && s.score && s.score !== window.__prevScore;
  }, null, { timeout: 60000 });
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
  await page.evaluate(() => (window.__prevScore = window.__epyc.store.getState().score));
  const t0 = Date.now();
  await page.setInputFiles('[data-testid="import-file"]', file);
  await page.waitForFunction(() => {
    const s = window.__epyc.store.getState();
    return (s.phase === 'ready' && s.score && s.score !== window.__prevScore && s.score.origin) || s.toast;
  }, null, { timeout: 120000 });
  const got = await page.evaluate(() => {
    const s = window.__epyc.store.getState();
    return { toast: s.toast, motif: s.motif, origin: s.score?.origin, style: s.styleId, phrases: s.heard?.phrases.map((p) => p.notes), spans: s.heard?.phrases.map((p) => [p.from, p.to]), insight: s.score?.insights.find((i) => i.title.startsWith('Melody'))?.body, rhythmInsight: s.score?.insights.find((i) => i.title.startsWith('Rhythm'))?.body };
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
  // the heard timing: each note's onset against the nearest onset the source piece wrote, after one
  // constant offset (the export's lead-in and the listener's latency)
  {
    const rh = got.origin.rhythm || [];
    const heardOn = rh.map(([t]) => got.origin.from + t);
    // matched by pitch class (within 0.4 s): an ornament or a flicker between two voices has no written
    // onset of its own, and shouldn't be scored against a neighbouring note's
    const pcOf = (m) => ((Math.round(m) % 12) + 12) % 12;
    const all = heardOn.map((h, i) => { let best = Infinity; for (const [t, m] of src.timed) if (pcOf(m) === pcOf(got.motif[i]) && Math.abs(t - h) < Math.abs(best)) best = t - h; return best; });
    const diffs = all.filter((d) => Math.abs(d) < 0.4);
    const matched = diffs.length / Math.max(1, all.length);
    const off = [...diffs].sort((a, b) => a - b)[diffs.length >> 1] ?? 0;
    const errs = diffs.map((d) => Math.abs(d - off)).sort((a, b) => a - b);
    const med = errs[errs.length >> 1] ?? Infinity;
    console.log(`  timing: heard onsets vs the written melody, median error ${(med * 1000).toFixed(0)} ms over ${diffs.length}/${all.length} pitch-matched notes (worst ${((errs.at(-1) ?? 0) * 1000).toFixed(0)} ms) · ${got.rhythmInsight?.slice(0, 90)}…`);
    check(rh.length === got.motif.length && /own timing/.test(got.rhythmInsight || ''), `${style}: the piece keeps the recording's timing for all ${rh.length} notes`);
    check(matched >= 0.6 && med < 0.06, `${style}: the heard timing matches where the notes were written (median ${(med * 1000).toFixed(0)} ms, ${Math.round(matched * 100)}% of notes found)`);
  }
  check(rs[0] >= 0.8, `${style}: the chosen phrase holds ${Math.round(rs[0] * 100)}% of the written melody in its span${exact ? ' (and is an exact stretch of it)' : ''}`);
  console.log(`  info  ${altGood}/${alts.length} other phrases hold ≥80% of the written melody in their span`);
  check(uniq === got.phrases.length, `${style}: no phrase repeats another`);
  check(!!got.insight, 'the Composer’s Mind says where the melody came from');
  await page.screenshot({ path: `${out}/import-${style}.png` });
}

// talking to the composer: typed into the chat box in the Reasoning tab
if ((await st()).heard) {
  const say = async (text, changed = true) => {
    const before = await st();
    const n = before.chat.length;
    await page.fill('[data-testid="talk-input"]', text);
    await page.press('[data-testid="talk-input"]', 'Enter');
    await page.waitForFunction(
      ([n, title, changed]) => {
        const s = window.__epyc.store.getState();
        if (s.chat.length < n + 2 || s.phase !== 'ready') return false;
        // only a reply that rebuilt the piece has a new title to wait for
        const rebuilt = /Rebuilding|^Trying phrase|^Using phrase|^Back to|^Same melody/.test(s.chat[s.chat.length - 1].text);
        return !changed || !rebuilt || (s.score && s.score.title !== title);
      },
      [n, before.score?.title, changed],
      { timeout: 120000 },
    );
    await page.waitForTimeout(300);
    const s = await st();
    const reply = s.chat[s.chat.length - 1].text;
    console.log(`  you: ${text}\n  me:  ${reply}`);
    return { s, reply };
  };
  const first = await st();
  check(first.chat.length === 1 && /found \d+ phrase/.test(first.chat[0].text) && (await page.isVisible('[data-testid="talk-input"]')), 'the composer opens the conversation after an import');
  const secs = first.heard.seconds;
  const a = Math.floor(secs * 0.3);
  const b = Math.min(Math.floor(secs) - 1, a + 10);
  const mm = (x) => `${Math.floor(x / 60)}:${String(x % 60).padStart(2, '0')}`;
  let r = await say(`use ${mm(a)} to ${mm(b)}`);
  let o = r.s.score.origin;
  const ins = r.s.score.insights.find((i) => i.title.startsWith('Melody'))?.body ?? '';
  check(o.asked && o.from >= a - 0.35 && o.to <= b + 1, `the melody comes from the asked stretch (${o.from.toFixed(1)}–${o.to.toFixed(1)}s, asked ${a}–${b})`);
  check(/^Took \d+ notes/.test(r.reply) && /You asked/.test(ins), 'the reply and the Composer’s Mind both say it was your pick');
  check(r.s.motif.length >= 2 && r.s.motif.join() !== first.motif.join(), 'the motif changed');
  const prevTo = o.to;
  r = await say('later');
  o = r.s.score.origin;
  check(/^Going later/.test(r.reply) ? o.from >= prevTo - 0.05 : /couldn’t hear|very end/.test(r.reply), `"later" moves on (${o.from.toFixed(1)}s, after ${prevTo.toFixed(1)}s)`);
  {
    const before = r.s.score.origin;
    r = await say('earlier');
    o = r.s.score.origin;
    check(/^Going earlier/.test(r.reply) ? o.to <= before.from + 0.05 : /couldn’t hear|very start/.test(r.reply), `"earlier" goes back (${o.from.toFixed(1)}s, before ${before.from.toFixed(1)}s)`);
  }
  for (const [word, grow] of [['longer', 1], ['shorter', -1]]) {
    const n0 = r.s.motif.length;
    r = await say(word);
    const n1 = r.s.motif.length;
    check(/^A (longer|shorter) phrase/.test(r.reply) ? Math.sign(n1 - n0) === grow : /couldn’t find|only \d+ notes|most notes/.test(r.reply) && n1 === n0, `"${word}" ${n0} → ${n1} notes, and the reply says what happened`);
  }
  {
    const m0 = r.s.motif.join();
    r = await say('another one');
    check(/^Trying phrase/.test(r.reply) ? r.s.motif.join() !== m0 && !r.s.score.origin.asked : /only found one/.test(r.reply), '"another one" moves to a different heard phrase');
  }
  if (r.s.heard.phrases.length >= 2) {
    r = await say('option 2');
    check(r.s.heard.idx === 1 && Math.abs(r.s.score.origin.from - r.s.heard.phrases[1].from) < 0.01, '"option 2" uses the second phrase');
    r = await say('go back');
    check(r.s.heard.idx === 0 && Math.abs(r.s.score.origin.from - r.s.heard.phrases[0].from) < 0.01, '"go back" returns to the first pick');
  }
  {
    const m0 = r.s.motif.join();
    const t0 = r.s.score.title;
    r = await say('new arrangement');
    check(r.s.motif.join() === m0 && r.s.score.title !== t0, '"new arrangement" keeps the melody and rebuilds the piece');
  }
  r = await say('list', false);
  check(/^Phrases I found/.test(r.reply), '"list" lists the phrases');
  r = await say('make it phantom');
  check(r.s.styleId === 'phantom' && r.s.score.styleId === 'phantom', '"make it phantom" rebuilds it in Phantom');
  r = await say('sing it like a pirate', false);
  check(/^I can take the melody/.test(r.reply), 'anything it does not understand gets the list of what it can do');
  r = await say(`use ${mm(Math.floor(secs) + 30)}`, false);
  check(/is only \d+:\d\d long|only listened to the first/.test(r.reply), 'a time past the end is refused politely');
  await page.screenshot({ path: `${out}/talk.png` });
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
