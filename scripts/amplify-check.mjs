// Amplify through the real UI: forge a piece, export it as WAV, import that WAV in Amplify, and check
//  - the beat and key it follows match the piece it came from (a known answer),
//  - with every layer bus muted the export is the recording itself, sample for sample, up to one gain
//    (the null test: nothing in the song is changed),
//  - how loud the layer sits under the song.
//   EPYC_URL=http://localhost:3211 node scripts/amplify-check.mjs <outDir> [styles=titan,neon]
import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync } from 'node:fs';

const base = process.env.EPYC_URL || 'http://localhost:3211';
const [out, ...rest] = process.argv.slice(2);
const arg = (k, d) => (rest.find((a) => a.startsWith(k + '=')) || '').split('=')[1] ?? d;
const styles = arg('styles', 'titan,neon').split(',').filter(Boolean);
mkdirSync(out, { recursive: true });
const fails = [];
const check = (ok, what) => {
  console.log(ok ? '  ok  ' : '  FAIL', what);
  if (!ok) fails.push(what);
};
const SR = 44100;
const LEAD = Math.round(0.06 * SR);

/** 16-bit stereo WAV as written by encodeWav → mono-pair float arrays */
function readWav(file) {
  const b = readFileSync(file);
  const n = (b.length - 44) / 4;
  const l = new Float32Array(n);
  const r = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    l[i] = b.readInt16LE(44 + i * 4) / 32768;
    r[i] = b.readInt16LE(46 + i * 4) / 32768;
  }
  return { l, r, n };
}
const rmsOf = (a, from = 0, to = a.length) => {
  let s = 0;
  for (let i = from; i < to; i++) s += a[i] * a[i];
  return Math.sqrt(s / Math.max(1, to - from));
};
const db = (x) => 20 * Math.log10(Math.max(1e-12, x));

const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, acceptDownloads: true });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(base + '/');
await page.waitForSelector('.studio');
await page.waitForTimeout(800);
const st = () => page.evaluate(() => window.__epyc.store.getState());

async function exportWav(file) {
  await page.click('[data-testid="download"]');
  await page.waitForSelector('[data-testid="dl-wav"]');
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 240000 }), page.click('[data-testid="dl-wav"]')]);
  await dl.saveAs(file);
  await page.waitForSelector('[data-testid="dl-done"]', { timeout: 15000 });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  return page.evaluate(() => window.__epyc.exportTiming.peak);
}
/** loudest RMS the output analyser shows over a few reads */
async function level(ms = 400) {
  let m = 0;
  for (let k = 0; k < 4; k++) {
    await page.waitForTimeout(ms / 4);
    m = Math.max(m, await page.evaluate(() => {
      const a = window.__epyc.player.analyser;
      const d = new Float32Array(a.fftSize);
      a.getFloatTimeDomainData(d);
      return Math.sqrt(d.reduce((x, y) => x + y * y, 0) / d.length);
    }));
  }
  return m;
}
async function importSong(file, timeout = 180000) {
  const before = (await st()).score?.title;
  const t0 = Date.now();
  await page.setInputFiles('[data-testid="import-file"]', file);
  await page.waitForFunction((t) => {
    const s = window.__epyc.store.getState();
    return !s.importing && s.phase === 'ready' && ((s.score && s.score.title !== t && s.score.song) || s.toast);
  }, before, { timeout });
  return Date.now() - t0;
}
async function setMutes(on) {
  await page.evaluate((on) => {
    const s = window.__epyc.store.getState();
    for (const b of Object.keys(s.mutes)) if (s.mutes[b] !== on) s.toggleMute(b);
  }, on);
}

// no song yet: Amplify asks for one
await page.click('[data-world="amplify"]');
await page.waitForTimeout(300);
await page.click('[data-testid="forge"]');
await page.waitForTimeout(400);
{
  const s = await st();
  check(/Import/.test(s.toast || '') && !s.score?.song, `Amplify with no song asks for one (“${s.toast}”)`);
}

// a song with an unmistakable key (C major: kick on every beat, bass and a triad on C, a quiet
// first half and a loud second half): the layer should hold its keynote and lift where it gets loud
{
  const bpm = 120, secs = 48, n = secs * SR;
  const buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  const f = (m) => 440 * 2 ** ((m - 69) / 12);
  for (let i = 0; i < n; i++) {
    const t = i / SR, loud = t > secs / 2 ? 1 : 0.25;
    const bt = t % (60 / bpm);
    // a kick held at 50 Hz (below where notes are counted) with a short click, so it has no pitch
    let x = Math.sin(2 * Math.PI * 50 * bt) * Math.exp(-bt * 14) * 0.6 + (bt < 0.004 ? Math.sin(i * 12.9898) * 0.3 : 0);
    // bass on C3: notes below 70 Hz aren't counted, so a C2 bass would leave C, E and G equal
    x += 0.18 * Math.sin(2 * Math.PI * f(48) * t);
    for (const m of [60, 64, 67]) x += 0.07 * Math.sin(2 * Math.PI * f(m) * t);
    x *= loud;
    const v = Math.round(Math.max(-1, Math.min(1, x * 0.9)) * 32767);
    buf.writeInt16LE(v, 44 + i * 4); buf.writeInt16LE(v, 46 + i * 4);
  }
  const file = `${out}/c-major-synth.wav`;
  (await import('node:fs')).writeFileSync(file, buf);
  console.log('synthetic C major song');
  await page.setInputFiles('[data-testid="import-file"]', file);
  await page.waitForFunction(() => {
    const s = window.__epyc.store.getState();
    return !s.importing && s.phase === 'ready' && s.score?.song;
  }, null, { timeout: 120000 });
  const g = await page.evaluate(() => {
    const sc = window.__epyc.store.getState().score;
    return { bpm: sc.bpm, key: sc.keyName, insts: [...new Set(sc.events.map((e) => e.i))], lowPads: [...new Set(sc.events.filter((e) => e.i === 'strings').map((e) => ((Math.round(e.m) % 12) + 12) % 12))], lifts: sc.insights.find((i) => i.title === 'Where it lifts')?.body };
  });
  console.log(`  ${g.bpm} BPM · ${g.key} · ${g.insts.join(' ')} · ${g.lifts}`);
  check(Math.abs(g.bpm - 120) < 3 || Math.abs(g.bpm - 60) < 2, `tempo 120 (got ${g.bpm})`);
  check(g.insts.includes('strings') && g.lowPads.every((p) => p === 0), `a drone, and only on C (${g.insts.includes('strings') ? 'drone on ' + g.key : 'no drone'})`);
  check(g.insts.includes('impact') && /0:2[2-6]/.test(g.lifts || ''), 'an impact where the song gets loud (0:24)');
}

for (const style of styles) {
  console.log('source →', style);
  await page.evaluate(() => window.__epyc.store.setState({ toast: null }));
  await page.click(`[data-world="${style}"]`);
  await page.waitForTimeout(300);
  await page.evaluate(() => (window.__prevScore = window.__epyc.store.getState().score));
  await page.click('[data-testid="forge"]');
  await page.waitForFunction(() => {
    const s = window.__epyc.store.getState();
    return s.phase === 'ready' && s.score && s.score !== window.__prevScore;
  }, null, { timeout: 60000 }).catch(async (e) => {
    console.log('  stuck forging:', JSON.stringify(await page.evaluate(() => { const s = window.__epyc.store.getState(); return { phase: s.phase, toast: s.toast, style: s.styleId }; })), errors);
    throw e;
  });
  const src = await page.evaluate(() => {
    const s = window.__epyc.store.getState().score;
    // how long each pitch class sounds in the source's pitched parts
    const pcTime = new Array(12).fill(0);
    for (const e of s.events) if (e.b !== 'drums' && e.b !== 'fx') pcTime[((Math.round(e.m) % 12) + 12) % 12] += e.d * (e.v ?? 1);
    return { title: s.title, bpm: s.bpm, beats: s.meter.beats, key: s.keyName, tonic: s.tonicPc, mode: s.mode, secs: s.durationSec, pcTime };
  });
  const srcFile = `${out}/${style}-source.wav`;
  await exportWav(srcFile);

  // into Amplify (switching with a piece loaded and no song yet keeps the old piece and asks for one)
  await page.click('[data-world="amplify"]');
  await page.waitForTimeout(400);
  const before = (await st()).score?.title;
  const t0 = Date.now();
  await page.setInputFiles('[data-testid="import-file"]', srcFile);
  await page.waitForFunction((t) => {
    const s = window.__epyc.store.getState();
    return !s.importing && s.phase === 'ready' && ((s.score && s.score.title !== t && s.score.song) || s.toast);
  }, before, { timeout: 180000 });
  await page.waitForTimeout(500);
  const amp = await page.evaluate(() => {
    const s = window.__epyc.store.getState();
    const sc = s.score;
    return {
      toast: s.toast,
      song: sc.song,
      bpm: sc.bpm,
      key: sc.keyName,
      tonic: sc.tonicPc,
      mode: sc.mode,
      sections: sc.sections.map((x) => `${x.name}@${(x.startBeat * 60 / sc.bpm).toFixed(1)}s`),
      events: sc.events.length,
      insts: [...new Set(sc.events.map((e) => e.i))],
      chat: s.chat.map((c) => c.text),
      lengthsDisabled: [...document.querySelectorAll('.seg-ctl button')].filter((b) => /Short|Standard|Long/.test(b.textContent)).every((b) => b.disabled),
      nextPhrase: !!document.querySelector('[data-testid="next-phrase"]'),
      mind: document.body.innerText.includes('Motif DNA'),
      hasSong: window.__epyc.player.hasSong,
    };
  });
  console.log(`  heard in ${((Date.now() - t0) / 1000).toFixed(1)} s: ${amp.bpm} BPM (source ${src.bpm}) · ${amp.key} (source ${src.key}) · ${amp.events} layer events · ${amp.insts.join(' ')}`);
  console.log(`  sections: ${amp.sections.join(' · ')}`);
  check(!!amp.song && amp.hasSong, 'the score carries the song and the player holds the recording');
  const ratio = amp.bpm / src.bpm;
  if (!amp.insts.includes('taikoLo')) console.log('  (no steady beat heard: no drums, so the tempo is not used)');
  else check([0.5, 1, 2].some((r) => Math.abs(ratio / r - 1) < 0.04), `beat follows the source tempo (${amp.bpm} vs ${src.bpm}${Math.abs(ratio - 0.5) < 0.02 ? ', half time' : ''})`);
  if (amp.insts.includes('strings')) {
    // a held note clashes with whatever sounds a semitone above it or a tritone away
    const tot = src.pcTime.reduce((a, x) => a + x, 0);
    const bad = (src.pcTime[(amp.tonic + 1) % 12] + src.pcTime[(amp.tonic + 6) % 12]) / tot;
    const own = src.pcTime[amp.tonic] / tot;
    console.log(`  drone on ${amp.key.replace('holding ', '')} (source ${src.key}): ${(own * 100).toFixed(0)}% of the source's notes are that note, ${(bad * 100).toFixed(1)}% clash with it`);
    check(own > 0.08 && (amp.tonic === src.tonic || bad < 0.1), `the drone is the song's keynote, or a common note that rarely clashes${amp.tonic === src.tonic ? ' (keynote)' : ''}`);
  } else console.log('  (no drone: drums only)');
  check(Math.abs(amp.song.seconds - src.secs) < 2.5, `follows the whole song (${amp.song.seconds.toFixed(1)} s of ${src.secs.toFixed(1)} s)`);
  check(amp.lengthsDisabled && !amp.nextPhrase && !amp.mind, 'lengths disabled, no Another phrase, no Motif DNA panel');

  // chat: phrase commands are explained, not acted on
  await page.fill('[data-testid="talk-input"]', 'use 0:10 to 0:20');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  const said = (await st()).chat.at(-1)?.text || '';
  check(/exactly as it is/.test(said) && (await st()).score?.song, `phrase requests explained in Amplify (“${said.slice(0, 70)}…”)`);

  // live: with the layer muted, what's heard is the song alone; it must follow the transport
  await setMutes(true);
  await page.evaluate(() => window.__epyc.player.play(0));
  const lv = {};
  lv.playing = await level(1200);
  const tb = (await st()).score.totalBeats;
  await page.evaluate((b) => window.__epyc.store.getState().seek(b), tb / 2);
  lv.seek = await level(800);
  await page.evaluate(() => window.__epyc.player.pause());
  lv.paused = await level(600);
  await page.evaluate(() => window.__epyc.player.play());
  lv.resumed = await level(800);
  const endInfo = await page.evaluate(() => {
    const p = window.__epyc.player;
    const sc = window.__epyc.store.getState().score;
    // two seconds before the song ends
    p.seek((sc.song.seconds - 2) / (60 / sc.bpm));
    return { dur: sc.durationSec };
  });
  lv.nearEnd = await level(600);
  await page.waitForTimeout(4500);
  lv.after = await level(400);
  const stillPlaying = await page.evaluate(() => window.__epyc.player.playing);
  const fmt = (x) => (x > 0 ? db(x).toFixed(0) : '-inf');
  console.log(`  live, layer muted: playing ${fmt(lv.playing)} dB · after seek ${fmt(lv.seek)} · paused ${fmt(lv.paused)} · resumed ${fmt(lv.resumed)} · near the end ${fmt(lv.nearEnd)} · after the end ${fmt(lv.after)} (${stillPlaying ? 'still playing' : 'stopped'})`);
  check(lv.playing > 1e-3 && lv.seek > 1e-3 && lv.resumed > 1e-3, 'live: the song sounds when playing, after a seek and after resuming');
  check(lv.paused < 1e-4 && lv.after < 1e-4 && !stillPlaying, 'live: silent when paused and once the song has ended');
  void endInfo;
  await setMutes(false);
  // the layer's own limiter: how hard it works on the loudest part (the song never goes through it)
  {
    const sc = (await st()).score;
    const loud = sc.sections.find((x) => x.kind === 'climax') ?? sc.sections[0];
    await page.evaluate((b) => window.__epyc.player.play(b), loud.startBeat);
    let red = 0;
    for (let k = 0; k < 12; k++) {
      await page.waitForTimeout(250);
      red = Math.min(red, await page.evaluate(() => window.__epyc.player.limiter?.reduction ?? 0));
    }
    await page.evaluate(() => window.__epyc.player.pause());
    console.log(`  layer limiter, loudest part: up to ${(-red).toFixed(1)} dB of reduction (layer only)`);
  }

  // null test: every layer bus muted → the export is the recording up to one gain
  await setMutes(true);
  const nullFile = `${out}/${style}-amplify-muted.wav`;
  const peakMuted = await exportWav(nullFile);
  await setMutes(false);
  const S = readWav(srcFile);
  const M = readWav(nullFile);
  let best = { res: Infinity };
  for (let off = LEAD - 3; off <= LEAD + 3; off++) {
    let sm = 0, ss = 0;
    const n = Math.min(S.n, M.n - off);
    for (let i = 0; i < n; i++) {
      sm += S.l[i] * M.l[i + off] + S.r[i] * M.r[i + off];
      ss += S.l[i] * S.l[i] + S.r[i] * S.r[i];
    }
    const g = sm / ss;
    let e = 0;
    for (let i = 0; i < n; i++) e += (M.l[i + off] - g * S.l[i]) ** 2 + (M.r[i + off] - g * S.r[i]) ** 2;
    const res = Math.sqrt(e / (2 * n));
    if (res < best.res) best = { res, g, off };
  }
  const songRms = rmsOf(S.l);
  const resDb = db(best.res / (best.g * songRms));
  console.log(`  null test: gain ${best.g.toFixed(4)} at ${best.off} samples · residual ${resDb.toFixed(1)} dB under the song`);
  check(best.off === LEAD && resDb < -60, 'muted export = the recording, untouched (residual under −60 dB)');
  // nothing left after the song either
  check(rmsOf(M.l, Math.min(M.n, S.n + LEAD + SR * 0.05)) < 1e-3, 'muted export is silent after the song');
  void peakMuted;

  // the layer's level: full export, minus the song at its known gain
  const fullFile = `${out}/${style}-amplify.wav`;
  const peak = await exportWav(fullFile);
  const F = readWav(fullFile);
  const norm = 0.891 / peak;
  const songGain = 0.6 * norm; // SONG_GAIN in player.ts
  const L = new Float32Array(S.n);
  const songPart = new Float32Array(S.n);
  for (let i = 0; i < S.n && i + LEAD < F.n; i++) {
    songPart[i] = songGain * S.l[i];
    L[i] = F.l[i + LEAD] - songPart[i];
  }
  const all = db(rmsOf(L) / rmsOf(songPart));
  // the loudest quarter of the song, in 2-second windows
  const W = SR * 2;
  const wins = [];
  for (let o = 0; o + W <= S.n; o += W) wins.push({ o, s: rmsOf(songPart, o, o + W), l: rmsOf(L, o, o + W) });
  wins.sort((a, b) => b.s - a.s);
  const top = wins.slice(0, Math.max(1, Math.floor(wins.length / 4)));
  const loud = db(top.reduce((a, w) => a + w.l, 0) / top.reduce((a, w) => a + w.s, 0));
  console.log(`  layer vs song: ${all.toFixed(1)} dB overall, ${loud.toFixed(1)} dB in the loudest quarter · export peak before normalising ${peak.toFixed(2)}`);
  if (amp.insts.includes('taikoLo') || amp.insts.includes('strings')) check(loud > -14 && loud < -2, 'layer sits under the song in its loud parts (−14 to −2 dB)');
  else console.log('  (no drums and no drone: only impacts, so the level is not judged)');

  // back out to a normal mode by chat: a piece from the song's melody
  await page.evaluate(() => window.__epyc.store.setState({ toast: null }));
  const t1 = (await st()).score?.title;
  await page.fill('[data-testid="talk-input"]', `make it ${style}`);
  await page.keyboard.press('Enter');
  await page.waitForFunction((t) => {
    const s = window.__epyc.store.getState();
    return s.phase === 'ready' && s.score && s.score.title !== t;
  }, t1, { timeout: 60000 });
  const back = await page.evaluate(() => {
    const s = window.__epyc.store.getState();
    return { song: !!s.score.song, origin: s.score.origin?.name, melody: s.score.melody.length };
  });
  check(!back.song && back.melody > 0, `“make it ${style}” builds a normal piece again (melody from ${back.origin})`);
}

// the likeliest path: import in a normal mode, then pick Amplify
{
  console.log('import in Titan, then Amplify');
  await page.click('[data-world="titan"]');
  await page.waitForFunction(() => window.__epyc.store.getState().phase === 'ready', null, { timeout: 60000 });
  const src = `${out}/${styles[0]}-source.wav`;
  const before = (await st()).score?.title;
  await page.setInputFiles('[data-testid="import-file"]', src);
  await page.waitForFunction((t) => {
    const s = window.__epyc.store.getState();
    return !s.importing && s.phase === 'ready' && s.score && s.score.title !== t;
  }, before, { timeout: 120000 });
  const a = await page.evaluate(() => ({ origin: !!window.__epyc.store.getState().score.origin, song: !!window.__epyc.store.getState().score.song }));
  check(a.origin && !a.song, 'in Titan the import builds a piece from its melody');
  const t1 = (await st()).score.title;
  await page.click('[data-world="amplify"]');
  await page.waitForFunction((t) => {
    const s = window.__epyc.store.getState();
    return s.phase === 'ready' && s.score && s.score.title !== t;
  }, t1, { timeout: 60000 });
  const b = await page.evaluate(() => {
    const sc = window.__epyc.store.getState().score;
    return { song: sc.song, playing: window.__epyc.player.playing };
  });
  check(!!b.song && b.playing, `clicking Amplify plays that song with the layer (${b.song?.name})`);
}

// a recording longer than the six minutes that are analysed: it still plays to its own end
{
  // over six minutes, under the 80 MB import limit (about 7.5 minutes of WAV)
  const pool = styles.map((x) => readWav(`${out}/${x}-source.wav`));
  const parts = [];
  let total = 0;
  for (let k = 0; total < SR * 380 && k < 50; k++) {
    const p = pool[k % pool.length];
    if (total + p.n > SR * 440) continue;
    parts.push(p);
    total += p.n;
  }
  const n = total;
  const buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  let o = 44;
  for (const p of parts) for (let i = 0; i < p.n; i++, o += 4) {
    buf.writeInt16LE(Math.round(p.l[i] * 32767), o);
    buf.writeInt16LE(Math.round(p.r[i] * 32767), o + 2);
  }
  const file = `${out}/long-song.wav`;
  (await import('node:fs')).writeFileSync(file, buf);
  console.log(`a ${(n / SR / 60).toFixed(1)}-minute song`);
  await page.evaluate(() => window.__epyc.store.setState({ toast: null }));
  const took = await importSong(file, 300000);
  const g = await page.evaluate(() => {
    const sc = window.__epyc.store.getState().score;
    const last = sc.events.reduce((m, e) => Math.max(m, (e.t + e.d) * 60 / sc.bpm), 0);
    return { toast: window.__epyc.store.getState().toast, song: sc.song, dur: sc.durationSec, last, length: sc.insights.find((i) => i.title === 'Length')?.body, mem: performance.memory?.usedJSHeapSize };
  });
  console.log(`  imported in ${(took / 1000).toFixed(1)} s · song ${g.song?.seconds.toFixed(1)} s · layer ends at ${g.last.toFixed(1)} s · ${g.length}`);
  check(!g.toast, `the long song imports (${g.toast ?? 'no error'})`);
  check(Math.abs((g.song?.seconds ?? 0) - n / SR) < 0.5, 'the whole recording plays, past the six analysed minutes');
  check(g.last < 362 && !!g.length, 'the layer stops where the analysis does, and the Composer’s Mind says so');
  // and the export carries all of it, untouched
  await setMutes(true);
  const nullFile = `${out}/long-muted.wav`;
  await exportWav(nullFile);
  await setMutes(false);
  const M = readWav(nullFile);
  let sm = 0, ss = 0, e = 0;
  const S = readWav(file);
  for (let i = 0; i < S.n; i++) { sm += S.l[i] * M.l[i + LEAD]; ss += S.l[i] * S.l[i]; }
  const gn = sm / ss;
  for (let i = 0; i < S.n; i++) e += (M.l[i + LEAD] - gn * S.l[i]) ** 2;
  const res = db(Math.sqrt(e / S.n) / (gn * rmsOf(S.l)));
  console.log(`  long null test: ${res.toFixed(1)} dB residual over all ${(S.n / SR).toFixed(0)} s`);
  check(res < -60, 'the long export is the whole recording, untouched');
}

// Amplify remembered across a reload, with no song: FORGE explains instead of failing
{
  await page.reload();
  await page.waitForSelector('.studio');
  await page.waitForTimeout(800);
  const sid = (await st()).styleId;
  await page.click('[data-testid="forge"]');
  await page.waitForTimeout(500);
  const s = await st();
  check(sid !== 'amplify' || (/Import/.test(s.toast || '') && !s.score), `after a reload in ${sid}, FORGE with no song asks for one`);
}

check(errors.length === 0, `no console errors${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
await browser.close();
console.log(fails.length ? `\n${fails.length} FAILURES` : '\nALL OK');
process.exit(fails.length ? 1 : 0);
