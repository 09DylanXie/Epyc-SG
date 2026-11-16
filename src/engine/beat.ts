/**
 * The shape of a recording, for playing along with it: where its beats fall (following the
 * drummer, drift and all), where its bars start, what key it is in and how sure that is, and how
 * loud each bar is. Mono PCM in; runs in the listening worker.
 */
import { fft } from './listen';

export interface SongMap {
  /** every tracked beat, in seconds */
  beats: number[];
  /** index into beats of the first downbeat (bars of four from there) */
  first: number;
  /** median tempo */
  bpm: number;
  tonicPc: number;
  minor: boolean;
  /** how well the best key fits (correlation) and how clearly it beat the next one */
  keyFit: number;
  keyMargin: number;
  /** the key is clear (display it, and hold its keynote) */
  keySure: boolean;
  /**
   * the keynote is safe to hold under the song even if the key itself is ambiguous: it is among the
   * strongest notes and neither note a semitone away is prominent (a triad alone fits several keys,
   * but its root can always be held)
   */
  droneSafe: boolean;
  /** onset strength on the tracked beats over the average: ~1 means the beats land on nothing special */
  pulse: number;
  /** loudness of each bar from `first`, in dB */
  barDb: number[];
  /** RMS of the whole recording */
  rms: number;
  seconds: number;
}

const FRAME = 1024;
// major and minor key profiles (Krumhansl–Kessler)
const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
// harmonic minor: the same, with the raised seventh (the leading tone) in place of the flat one, so a
// minor song that leans on its V chord is not mistaken for that chord's own major key
const HARMONIC = MINOR.map((w, k) => (k === 10 ? 2.4 : k === 11 ? 4.4 : w));

function corr(a: number[], b: number[]) {
  const n = a.length;
  const ma = a.reduce((x, y) => x + y, 0) / n;
  const mb = b.reduce((x, y) => x + y, 0) / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

/** @param tune how far the recording sits from A440, in semitones (from the melody listener) */
export function mapSong(pcm: Float32Array, sr: number, tune = 0): SongMap | null {
  const hop = Math.round(sr / 100); // 10 ms
  const frames = Math.floor((pcm.length - FRAME) / hop);
  const seconds = pcm.length / sr;
  if (frames < 400) return null; // under ~4 s there is nothing to play along with
  const fps = sr / hop;
  const win = new Float64Array(FRAME);
  for (let i = 0; i < FRAME; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FRAME - 1));
  const bins = FRAME / 2;
  const binHz = sr / FRAME;
  const lowTop = Math.ceil(150 / binHz);
  const flux = new Float32Array(frames);
  const low = new Float32Array(frames);
  const energy = new Float32Array(frames);
  const re = new Float64Array(FRAME);
  const im = new Float64Array(FRAME);
  let prev = new Float32Array(bins);
  let cur = new Float32Array(bins);
  let sq = 0;
  for (let f = 0; f < frames; f++) {
    const o = f * hop;
    let e = 0;
    for (let i = 0; i < FRAME; i++) {
      const x = pcm[o + i];
      re[i] = x * win[i];
      im[i] = 0;
      if (i < hop) e += x * x;
    }
    sq += e;
    energy[f] = e / hop;
    fft(re, im);
    let fl = 0;
    let lw = 0;
    for (let b = 1; b < bins; b++) {
      const mag = Math.sqrt(re[b] * re[b] + im[b] * im[b]);
      const c = Math.log1p(100 * mag);
      cur[b] = c;
      const d = c - prev[b];
      if (d > 0) {
        fl += d;
        if (b <= lowTop) lw += d;
      }
    }
    flux[f] = fl;
    low[f] = lw;
    [prev, cur] = [cur, prev];
  }
  const rms = Math.sqrt(sq / Math.max(1, frames * hop));
  if (rms < 1e-4) return null;
  const chroma = keyChroma(pcm, sr, tune);

  // onset strength: flux above its local average, the whole spectrum and the low end each at equal
  // weight — so when a song is followed in half time, the beats it keeps are the kicks, not the snare
  const strength = (src: Float32Array) => {
    const out = new Float32Array(frames);
    const W = Math.round(fps * 0.4);
    let acc = 0;
    for (let f = 0; f < frames; f++) {
      acc += src[f];
      if (f >= W) acc -= src[f - W];
      out[f] = Math.max(0, src[f] - acc / Math.min(f + 1, W));
    }
    let sd = 0;
    for (let f = 0; f < frames; f++) sd += out[f] * out[f];
    sd = Math.sqrt(sd / frames) || 1;
    for (let f = 0; f < frames; f++) out[f] /= sd;
    return out;
  };
  const onset = strength(flux);
  const lowOn = strength(low);
  {
    for (let f = 0; f < frames; f++) onset[f] = (onset[f] + lowOn[f]) / 2;
  }

  // tempo: autocorrelation of the onsets, leaning towards ~120 BPM, between 60 and 190
  const minLag = Math.floor((fps * 60) / 190);
  const maxLag = Math.ceil((fps * 60) / 60);
  const top = maxLag * 4 + 2;
  const ac = new Float64Array(top + 1);
  for (let lag = Math.max(1, minLag - 1); lag <= Math.min(top, frames - 1); lag++) {
    let s = 0;
    for (let f = lag; f < frames; f++) s += onset[f] * onset[f - lag];
    ac[lag] = s / (frames - lag);
  }
  let best = minLag;
  let bestW = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    const bpm = (fps * 60) / lag;
    // a real beat keeps coming back: two, three and four beats on must line up too (three eighth
    // notes, say, line up once and then miss)
    let comb = 0;
    for (let k = 1; k <= 4; k++) {
      const L = lag * k;
      let m = 0;
      for (let d = -k; d <= k; d++) m = Math.max(m, ac[L + d] ?? 0);
      comb += m;
    }
    // leaning towards ~100 BPM: a very fast song may be read in half time, which suits big hits
    const w = comb * Math.exp(-0.5 * (Math.log2(bpm / 100) / 1) ** 2);
    if (w > bestW) {
      bestW = w;
      best = lag;
    }
  }
  // sub-frame period
  const y0 = ac[best - 1];
  const y1 = ac[best];
  const y2 = ac[best + 1];
  const den = y0 - 2 * y1 + y2;
  const period = best + (den < 0 ? (0.5 * (y0 - y2)) / den : 0);

  // beats: dynamic programming — land on onsets, keep close to the period, allow it to drift
  const score = new Float64Array(frames);
  const back = new Int32Array(frames).fill(-1);
  const ALPHA = 120;
  for (let f = 0; f < frames; f++) {
    let bestPrev = -1;
    let bestS = 0;
    const lo = Math.max(0, Math.floor(f - 2 * period));
    const hi = Math.floor(f - period / 2);
    for (let p = lo; p <= hi; p++) {
      const s = score[p] - ALPHA * Math.log((f - p) / period) ** 2;
      if (bestPrev < 0 || s > bestS) {
        bestS = s;
        bestPrev = p;
      }
    }
    score[f] = onset[f] + (bestPrev >= 0 ? Math.max(0, bestS) : 0);
    back[f] = bestPrev >= 0 && bestS > 0 ? bestPrev : -1;
  }
  let end = frames - 1;
  for (let f = Math.max(0, Math.floor(frames - period)); f < frames; f++) if (score[f] > score[end]) end = f;
  const beatF: number[] = [];
  for (let f = end; f >= 0; f = back[f]) beatF.push(f);
  beatF.reverse();
  // followed in half time, the tracker can sit on the backbeat; if the points halfway between the
  // beats carry clearly more kick, those are the beats
  if (beatF.length > 8) {
    const peakNear = (f: number) => {
      let m = 0;
      for (let k = Math.max(0, f - 3); k <= Math.min(frames - 1, f + 3); k++) m = Math.max(m, lowOn[k]);
      return m;
    };
    let on = 0;
    let mid = 0;
    for (let i = 0; i + 1 < beatF.length; i++) {
      on += peakNear(beatF[i]);
      mid += peakNear(Math.round((beatF[i] + beatF[i + 1]) / 2));
    }
    if (mid > on * 1.25) {
      const shifted = beatF.slice(0, -1).map((f, i) => Math.round((f + beatF[i + 1]) / 2));
      beatF.length = 0;
      beatF.push(...shifted);
    }
  }
  // how clearly the song keeps this beat: onset strength on the tracked beats against everywhere
  let onBeat = 0;
  for (const f of beatF) {
    let m = 0;
    for (let k = Math.max(0, f - 2); k <= Math.min(frames - 1, f + 2); k++) m = Math.max(m, onset[k]);
    onBeat += m;
  }
  let allOn = 0;
  for (let f = 0; f < frames; f++) allOn += onset[f];
  const pulse = onBeat / Math.max(1, beatF.length) / Math.max(1e-9, allOn / frames);
  // the frame's centre is where its onset is heard
  const beats = beatF.map((f) => (f * hop + FRAME / 2) / sr);
  if (beats.length < 8) return null;

  // downbeats: of the four ways to group the beats into bars, the one with the most low-end on
  // the first beat (kicks and bass notes land there)
  let first = 0;
  {
    let bestP = -Infinity;
    for (let ph = 0; ph < 4; ph++) {
      let s = 0;
      let n = 0;
      for (let i = ph; i < beatF.length; i += 4) {
        const f = beatF[i];
        let m = 0;
        for (let k = Math.max(0, f - 2); k <= Math.min(frames - 1, f + 2); k++) m = Math.max(m, low[k] + 0.3 * onset[k]);
        s += m;
        n++;
      }
      if (n && s / n > bestP) {
        bestP = s / n;
        first = ph;
      }
    }
  }

  // key
  const ch = chroma;
  let fits: { pc: number; minor: boolean; r: number }[] = [];
  for (let pc = 0; pc < 12; pc++) {
    const rot = (p: number[]) => ch.map((_, k) => p[(k - pc + 12) % 12]);
    fits.push({ pc, minor: false, r: corr(ch, rot(MAJOR)) });
    fits.push({ pc, minor: true, r: corr(ch, rot(MINOR)) });
    fits.push({ pc, minor: true, r: corr(ch, rot(HARMONIC)) });
  }
  fits = fits.sort((a, b) => b.r - a.r);
  const key = fits[0];
  // the relative major/minor shares every note, so it doesn't count against being sure
  // (nor does the same key read with the other minor profile)
  const rival = fits.find((f) => !(f.minor !== key.minor && f.pc === (key.minor ? (key.pc + 3) % 12 : (key.pc + 9) % 12)) && !(f.pc === key.pc && f.minor === key.minor))!;
  const keyMargin = key.r - rival.r;
  // a held keynote clashes hardest with a strong note a semitone above it (a minor ninth): if the
  // song leans on that note, the reading is doubtful and nothing is held
  const cMax = Math.max(...ch);
  const clash = (pc: number) => ch[pc] < 0.6 * cMax || ch[(pc + 1) % 12] > 0.6 * ch[pc];
  const keySure = key.r > 0.62 && keyMargin > 0.04 && !clash(key.pc);
  // no clear key: hold a note only if it is the song's strongest by a margin, is the keynote of one
  // of the keys that fit, and has nothing a semitone either side of it (a lone triad fits several
  // keys, and only its root is safe to hold under all of them)
  let drone = keySure ? key : null;
  if (!keySure) {
    const order = ch.map((c, pc) => ({ c, pc })).sort((a, b) => b.c - a.c);
    const top = order[0];
    const near = Math.max(ch[(top.pc + 1) % 12], ch[(top.pc + 11) % 12]);
    const fit = fits.slice(0, 4).find((f) => f.pc === top.pc && f.r > 0.62);
    if (fit && top.c > 0 && order[1].c <= 0.8 * top.c && near <= 0.35 * top.c && !clash(top.pc)) drone = fit;
  }
  const droneSafe = !!drone;
  const tonic = drone ?? key;

  // loudness per bar
  const barDb: number[] = [];
  for (let i = first; i + 4 < beatF.length; i += 4) {
    let s = 0;
    let n = 0;
    for (let f = beatF[i]; f < beatF[i + 4]; f++) {
      s += energy[f];
      n++;
    }
    barDb.push(10 * Math.log10(s / Math.max(1, n) + 1e-10));
  }
  const ibi = beats.slice(1).map((b, i) => b - beats[i]).sort((a, b) => a - b);
  const bpm = 60 / ibi[ibi.length >> 1];
  return { beats, first, bpm, tonicPc: tonic.pc, minor: tonic.minor, keyFit: key.r, keyMargin, keySure, droneSafe, pulse, barDb, rms, seconds };
}

/**
 * The song's pitch-class profile, from long frames (4096 samples: ~4 Hz bins, fine enough to tell
 * bass notes a semitone apart) every 100 ms. Each frame is normalised so a loud hit can't decide
 * the key, then weighted by how loud the frame is.
 */
function keyChroma(pcm: Float32Array, sr: number, tune: number): number[] {
  const N = 4096;
  const hop = Math.round(sr / 10);
  const binHz = sr / N;
  const pcOf = new Int8Array(N / 2).fill(-1);
  for (let b = Math.ceil(70 / binHz); b < Math.min(N / 2, 2000 / binHz); b++) {
    const midi = 69 + 12 * Math.log2((b * binHz) / 440) - tune;
    // only bins near a note's centre: the rest are smeared between two
    if (Math.abs(midi - Math.round(midi)) < 0.35) pcOf[b] = ((Math.round(midi) % 12) + 12) % 12;
  }
  const win = new Float64Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  const out = new Array<number>(12).fill(0);
  const mag = new Float64Array(N / 2 + 1);
  const lowBin = Math.ceil(70 / binHz);
  for (let o = 0; o + N <= pcm.length; o += hop) {
    let e = 0;
    for (let i = 0; i < N; i++) {
      const x = pcm[o + i];
      e += x * x;
      re[i] = x * win[i];
      im[i] = 0;
    }
    if (e < 1e-6) continue;
    fft(re, im);
    for (let b = 0; b < N / 2; b++) mag[b] = Math.sqrt(re[b] * re[b] + im[b] * im[b]);
    // overtones: every note's third harmonic lands a fifth above it (E rings on B, A on E), which
    // pulls the profile towards the dominant key. Walking up from the bass, each bin takes back what
    // its 3rd and 5th harmonics put in higher bins (octaves are the same pitch class, so they stay)
    for (let b = lowBin; b < N / 2; b++) {
      const v = mag[b];
      if (v <= 0 || !(v >= mag[b - 1] && v >= mag[b + 1])) continue;
      for (const h of [3, 5, 6]) {
        const c = h * b;
        if (c + 2 >= N / 2) break;
        for (let j = Math.floor(c) - 1; j <= Math.ceil(c) + 1; j++) mag[j] = Math.max(0, mag[j] - v * 0.7);
      }
    }
    const fc = new Array<number>(12).fill(0);
    for (let b = 1; b < N / 2; b++) {
      const k = pcOf[b];
      if (k >= 0) fc[k] += mag[b];
    }
    const tot = fc.reduce((a, x) => a + x, 0);
    if (tot > 1e-9) for (let k = 0; k < 12; k++) out[k] += (fc[k] / tot) * Math.sqrt(e / N);
  }
  return out;
}
