/**
 * Listens to a recording and pulls out its melody: the line a person would hum back.
 *
 * 1. Salience: every 20 ms, each candidate pitch is scored by how much energy sits on its
 *    harmonics (fundamental, 2×, 3×, … with decaying weight), so a voice or lead with a rich
 *    harmonic series stands out from the chords and drums underneath.
 * 2. Tracking: a Viterbi search picks the most likely path through those scores, paying for big
 *    leaps and for switching between sound and silence, so the line stays with one instrument.
 * 3. Notes: the path is cut into notes, and repeated attacks on the same pitch are split on onsets.
 * 4. Phrases: windows of 4–12 notes are ranked by how clear and singable they are and by how
 *    often their shape comes back in the song — the hook usually repeats.
 *
 * Pure and synchronous: runs in a worker in the app and directly under tsx in the tests.
 */

export interface HeardNote {
  midi: number;
  t: number;
  d: number;
  conf: number;
  /** peak-to-mean salience over the note: absolute, unlike conf */
  clear: number;
  /** how far the smoothed pitch moved across the note, in semitones (a slide, not a note) */
  slide?: number;
  /** this note began on a detected re-attack of the same pitch */
  attack?: boolean;
}
export interface Phrase {
  notes: number[];
  from: number;
  to: number;
  score: number;
  /** 0..~1.5: how clearly the notes stood out from everything else */
  conf: number;
  /** how many more times this shape comes back in the song */
  repeats?: number;
  /** found only with relaxed rules: the melody was hard to make out */
  loose?: boolean;
}
export interface Heard {
  phrases: Phrase[];
  /** every note found, for diagnostics */
  line: HeardNote[];
  /** how far the recording sits from A440, in semitones */
  tune?: number;
  seconds: number;
}

const LO = 48; // C3
const HI = 88; // E6
const NS = HI - LO + 1;
const FRAME = 2048;
const HOP = 320;
/** longest stretch analysed, in seconds */
export const MAX_SECONDS = 360;

function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = (-2 * Math.PI) / len;
    const wr = Math.cos(a);
    const wi = Math.sin(a);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k];
        const ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr;
        im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr;
        im[i + k + len / 2] = ui - vi;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

/** mean peak-to-mean salience below which a phrase is more likely noise than a tune (noise measures ~2–2.5, music 3.5+) */
export const MIN_CLEAR = 2.7;
/** a phrase's notes must stand out clearly on average: noise can throw up the odd note just over
 * MIN_CLEAR (brown noise sits at 2.7–3.0), real tones sit well above it */
export const PHRASE_CLEAR = 3.3;
const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export function listen(pcm: Float32Array, sr: number, onProgress?: (p: number) => void): Heard {
  const len = Math.min(pcm.length, Math.floor(MAX_SECONDS * sr));
  const frames = Math.max(0, Math.floor((len - FRAME) / HOP));
  const seconds = len / sr;
  if (frames < 20) return { phrases: [], line: [], seconds };

  const win = new Float64Array(FRAME);
  for (let i = 0; i < FRAME; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FRAME - 1));
  const bins = FRAME / 2;
  const binHz = sr / FRAME;
  const H = 10;
  // per candidate (in thirds of a semitone, so a slightly sharp or flat singer still lands), the bins of each harmonic
  const SUB = 3;
  const cand: Int32Array[] = [];
  for (let s = 0; s < NS * SUB; s++) {
    const f0 = hz(LO + (s - 1) / SUB);
    const b = new Int32Array(H);
    for (let h = 0; h < H; h++) b[h] = Math.round(((h + 1) * f0) / binHz);
    cand.push(b);
  }
  const hw = Array.from({ length: H }, (_, h) => Math.pow(0.82, h));

  // salience on a fine grid (thirds of a semitone) so the tracker can follow vibrato and slides
  const NF = NS * SUB;
  const midiOf = (q: number) => LO + (q - 1) / SUB;
  const sal = new Float32Array(frames * NF);
  const energy = new Float32Array(frames);
  const flux = new Float32Array(frames);
  const re = new Float64Array(FRAME);
  const im = new Float64Array(FRAME);
  let prevMag = new Float32Array(bins);
  const lo = Math.floor(120 / binHz);
  const hiBin = Math.min(bins - 2, Math.ceil(5000 / binHz));
  const prior = new Float32Array(NF);
  for (let q = 0; q < NF; q++) prior[q] = 0.55 + 0.45 * Math.exp(-((midiOf(q) - 69) ** 2) / (2 * 14 * 14));
  for (let f = 0; f < frames; f++) {
    const o = f * HOP;
    for (let i = 0; i < FRAME; i++) {
      re[i] = pcm[o + i] * win[i];
      im[i] = 0;
    }
    fft(re, im);
    const mag = new Float32Array(bins);
    let e = 0;
    let fl = 0;
    for (let k = 1; k < bins; k++) {
      // compressed magnitude: loud bass notes must not drown a quieter lead
      const m = Math.sqrt(Math.sqrt(re[k] * re[k] + im[k] * im[k]));
      mag[k] = m;
      if (k >= lo && k <= hiBin) {
        e += m * m;
        const d = m - prevMag[k];
        if (d > 0) fl += d;
      }
    }
    energy[f] = Math.sqrt(e / (hiBin - lo + 1));
    flux[f] = fl;
    prevMag = mag;
    // whiten: subtract a running local mean so broadband noise (drums, reverb) scores little
    const white = new Float32Array(bins);
    const R = 12;
    let acc = 0;
    for (let k = 0; k < Math.min(bins, R); k++) acc += mag[k];
    for (let k = 0; k < bins; k++) {
      const a = k + R < bins ? mag[k + R] : 0;
      const b = k - R - 1 >= 0 ? mag[k - R - 1] : 0;
      acc += a - b;
      const n = Math.min(bins - 1, k + R) - Math.max(0, k - R) + 1;
      white[k] = Math.max(0, mag[k] - (acc / n) * 1.05);
    }
    const row = f * NF;
    for (let q = 0; q < NF; q++) {
      const b = cand[q];
      let v = 0;
      for (let h = 0; h < H; h++) {
        const k = b[h];
        if (k < 2 || k >= bins - 1) break;
        v += hw[h] * Math.max(white[k - 1], white[k], white[k + 1]);
      }
      // a melody lives in the middle of the range: lean gently away from the bass and the stratosphere
      sal[row + q] = v * prior[q];
    }
    // octave check: a candidate whose octave-up partner explains it just as well is really that octave
    for (let q = 0; q + 12 * SUB < NF; q++) {
      if (sal[row + q + 12 * SUB] > 0.72 * sal[row + q]) sal[row + q] *= 0.7;
    }
    if (onProgress && f % 200 === 0) onProgress((0.7 * f) / frames);
  }

  // voicing: a frame counts as melody only when its best pitch clearly stands out
  const peak = new Float32Array(frames);
  const clarity = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let p = 0;
    let sum = 0;
    for (let q = 0; q < NF; q++) {
      const v = sal[f * NF + q];
      if (v > p) p = v;
      sum += v;
    }
    peak[f] = p;
    // how far the best pitch stands above the typical candidate: a real note towers, noise does not
    clarity[f] = p / (sum / NF + 1e-9);
  }
  const sortedPeak = Array.from(peak).sort((a, b) => a - b);
  const ref = sortedPeak[Math.floor(sortedPeak.length * 0.8)] || 1;
  const sortedE = Array.from(energy).sort((a, b) => a - b);
  const eRef = sortedE[Math.floor(sortedE.length * 0.8)] || 1;

  // Viterbi over the fine grid + 1 silent state. Small steps (vibrato, slides) are nearly free;
  // a real leap costs more the further it goes; starting and stopping costs most.
  const U = NF;
  const S = NF + 1;
  const W = 12 * SUB;
  const step = new Float32Array(W + 1);
  for (let d = 0; d <= W; d++) step[d] = d <= 2 ? -0.04 * d : -0.6 - (0.16 * d) / SUB;
  const quiet = new Uint8Array(frames);
  for (let f = 0; f < frames; f++) quiet[f] = energy[f] < 0.12 * eRef || peak[f] < 0.18 * ref ? 1 : 0;
  const emit = (f: number, s: number) => {
    if (s === U) return quiet[f] ? 0 : -1.4;
    return Math.log(1e-3 + sal[f * NF + s] / ref) + (quiet[f] ? -2 : 0);
  };
  let score = new Float64Array(S);
  for (let s = 0; s < S; s++) score[s] = emit(0, s);
  const back = new Int16Array(frames * S);
  for (let f = 1; f < frames; f++) {
    const next = new Float64Array(S);
    for (let b = 0; b < NF; b++) {
      // from silence, or from a nearby pitch
      let best = score[U] - 2.2;
      let arg = U;
      const a0 = Math.max(0, b - W);
      const a1 = Math.min(NF - 1, b + W);
      for (let a = a0; a <= a1; a++) {
        const v = score[a] + step[a > b ? a - b : b - a];
        if (v > best) {
          best = v;
          arg = a;
        }
      }
      next[b] = best + emit(f, b);
      back[f * S + b] = arg;
    }
    {
      let best = score[U];
      let arg = U;
      for (let a = 0; a < NF; a++) {
        const v = score[a] - 2.2;
        if (v > best) {
          best = v;
          arg = a;
        }
      }
      next[U] = best + emit(f, U);
      back[f * S + U] = arg;
    }
    score = next;
    if (onProgress && f % 400 === 0) onProgress(0.7 + (0.25 * f) / frames);
  }
  const path = new Int16Array(frames);
  {
    let s = 0;
    for (let k = 1; k < S; k++) if (score[k] > score[s]) s = k;
    for (let f = frames - 1; f >= 0; f--) {
      path[f] = s;
      s = back[f * S + s];
    }
  }

  // the continuous pitch line (refined between grid points) and its salience
  const cont = new Float32Array(frames).fill(NaN);
  const pathSal = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    const q = path[f];
    if (q === U) continue;
    const r = f * NF;
    const b = sal[r + q];
    pathSal[f] = b;
    let off = 0;
    if (q > 0 && q < NF - 1) {
      const a = sal[r + q - 1];
      const c = sal[r + q + 1];
      const den = a - 2 * b + c;
      if (den < 0) off = Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / den));
    }
    cont[f] = midiOf(q + off);
  }
  // an average over one vibrato cycle finds the centre of a wobbling note (a median would not:
  // vibrato lingers at its extremes, so the median flips to whichever extreme has more samples)
  const HALF = Math.max(2, Math.round(0.09 / (HOP / sr)));
  const med = new Float32Array(frames).fill(NaN);
  {
    const buf: number[] = [];
    for (let f = 0; f < frames; f++) {
      if (Number.isNaN(cont[f])) continue;
      buf.length = 0;
      for (let k = f; k >= Math.max(0, f - HALF) && !Number.isNaN(cont[k]); k--) buf.push(cont[k]);
      for (let k = f + 1; k <= Math.min(frames - 1, f + HALF) && !Number.isNaN(cont[k]); k++) buf.push(cont[k]);
      let sum = 0;
      for (const v of buf) sum += v;
      med[f] = sum / buf.length;
    }
  }
  // the recording's own tuning (a band can sit a little sharp or flat of A440), read from the
  // smoothed line: raw vibrato spends its time at the extremes and would fool it
  let tune = 0;
  {
    let x = 0;
    let y = 0;
    for (let f = 0; f < frames; f++) {
      if (Number.isNaN(med[f])) continue;
      const ang = 2 * Math.PI * (med[f] - Math.round(med[f]));
      x += pathSal[f] * Math.cos(ang);
      y += pathSal[f] * Math.sin(ang);
    }
    if (x || y) tune = Math.atan2(y, x) / (2 * Math.PI);
  }
  const notesAt = new Int16Array(frames).fill(-1);
  {
    let held = -1;
    for (let f = 0; f < frames; f++) {
      if (Number.isNaN(med[f])) {
        held = -1;
        continue;
      }
      const v = med[f] - tune;
      // hysteresis: stay on the note until the line has clearly moved to another
      if (held < 0 || Math.abs(v - held) > 0.62) held = Math.round(v);
      notesAt[f] = held;
    }
  }

  // ── notes ──
  const dt = HOP / sr;
  const minFrames = Math.max(3, Math.round(0.09 / dt));
  const fluxSorted = Array.from(flux).sort((a, b) => a - b);
  const fluxRef = fluxSorted[Math.floor(fluxSorted.length * 0.9)] || 1;
  const line: HeardNote[] = [];
  let f = 0;
  while (f < frames) {
    const m = notesAt[f];
    let g = f + 1;
    while (g < frames && notesAt[g] === m) g++;
    if (m >= 0 && g - f >= minFrames) {
      // a held pitch with a fresh attack inside it is two notes
      let start = f;
      for (let k = f + Math.max(3, minFrames); k < g - minFrames; k++) {
        // the attack must be in the line's own harmonics (a dip, then a rise), not a drum hit under it
        const here = pathSal[k];
        const before = Math.min(pathSal[k - 1], pathSal[k - 2], pathSal[k - 3]);
        const after = Math.max(pathSal[k + 1], pathSal[k + 2]);
        if (flux[k] > 1.4 * fluxRef && flux[k] >= flux[k - 1] && flux[k] >= flux[k + 1] && before < 0.55 * Math.max(here, after) && before < 0.6 * peakOf(start, k)) {
          line.push(noteOf(start, k, m, start !== f));
          start = k;
          k += minFrames;
        }
      }
      line.push(noteOf(start, g, m, start !== f));
    }
    f = g;
  }
  function peakOf(a: number, b: number) {
    let p = 0;
    for (let k = a; k < b; k++) p = Math.max(p, pathSal[k]);
    return p;
  }
  function noteOf(a: number, b: number, m: number, attack = false): HeardNote {
    let c = 0;
    let cl = 0;
    for (let k = a; k < b; k++) {
      c += Math.min(1.5, pathSal[k] / ref);
      cl += clarity[k];
    }
    const slide = Number.isNaN(med[b - 1]) || Number.isNaN(med[a]) ? 0 : med[b - 1] - med[a];
    // the note is where the voice settled: the average of its middle half, away from slides in and out
    {
      const q = Math.floor((b - a) / 4);
      let sum = 0;
      let cnt = 0;
      for (let k = a + q; k < b - q; k++) {
        if (Number.isNaN(cont[k])) continue;
        sum += cont[k];
        cnt++;
      }
      if (cnt) m = Math.round(sum / cnt - tune);
    }
    return { midi: m, t: a * dt, d: (b - a) * dt, conf: c / (b - a), clear: cl / (b - a), slide, attack };
  }

  onProgress?.(0.97);
  const clean = tidy(line);
  return { phrases: pickPhrases(clean), line: clean, seconds, tune };
}

/**
 * Singers slide and wobble; a transcription should not. Slides fold into the note they land on,
 * fragments of one held pitch are rejoined, and quick chromatic passing steps between two notes go.
 */
export function tidy(src: HeardNote[]): HeardNote[] {
  let line = src.map((n) => ({ ...n }));
  for (let pass = 0; pass < 3; pass++) {
    // 1. a short note that is mostly travelling joins its destination
    const out: HeardNote[] = [];
    for (let i = 0; i < line.length; i++) {
      const n = line[i];
      const next = line[i + 1];
      const slide = n.slide ?? 0;
      if (n.d < 0.25 && Math.abs(slide) >= 0.5 && next && next.t - (n.t + n.d) < 0.06 && Math.sign(next.midi - n.midi) === Math.sign(slide)) {
        next.d += next.t - n.t;
        next.t = n.t;
        continue;
      }
      // 2. a quick step strictly between its neighbours is the voice passing through
      const prev = out[out.length - 1];
      if (prev && next && n.d < 0.13 && !n.attack && (prev.midi - n.midi) * (n.midi - next.midi) > 0 && n.t - (prev.t + prev.d) < 0.05 && next.t - (n.t + n.d) < 0.05) {
        next.d += next.t - n.t;
        next.t = n.t;
        continue;
      }
      out.push(n);
    }
    // 3. the same pitch twice with almost no gap, and no fresh attack, is one note
    const merged: HeardNote[] = [];
    for (const n of out) {
      const p = merged[merged.length - 1];
      if (p && p.midi === n.midi && !n.attack && n.t - (p.t + p.d) < 0.08) {
        const end = n.t + n.d;
        p.conf = (p.conf * p.d + n.conf * n.d) / (p.d + n.d);
        p.clear = (p.clear * p.d + n.clear * n.d) / (p.d + n.d);
        p.d = end - p.t;
        p.slide = 0;
        continue;
      }
      merged.push(n);
    }
    line = merged;
  }
  return line;
}

/** the best few phrases, from different parts of the song */
export function pickPhrases(line: HeardNote[], want = 6): Phrase[] {
  const clearNotes = line.filter((n) => n.clear >= PHRASE_CLEAR);
  if (clearNotes.length < 2) return [];
  // strict first; a melody full of rests (or a short jingle) gets a looser reading, flagged as such
  const tiers: Tier[] = [
    { gap: 0.45, long: 2.5, minN: 4, distinct: 3, range: 3, loose: false },
    { gap: 1.6, long: 6, minN: 3, distinct: 2, range: 2, loose: true },
  ];
  for (const t of tiers) {
    const got = pickTier(line, want, t);
    if (got.length) return got;
  }
  // last resort: the clearest run of up to eight notes, whatever its shape
  let best = 0;
  let bestScore = -Infinity;
  for (let i = 0; i < line.length; i++) {
    const run = line.slice(i, i + 8);
    const s = run.reduce((a, n) => a + Math.min(n.clear, 8), 0);
    if (s > bestScore) {
      bestScore = s;
      best = i;
    }
  }
  const run = line.slice(best, best + 8).filter((n) => n.clear >= PHRASE_CLEAR);
  if (run.length < 2) return [];
  const c = run.reduce((a, n) => a + n.conf, 0) / run.length;
  return [{ notes: run.map((n) => n.midi), from: run[0].t, to: run[run.length - 1].t + run[run.length - 1].d, score: 0, conf: c, loose: true }];
}

interface Tier {
  /** a rest longer than this (s) ends a phrase */
  gap: number;
  /** a note longer than this many typical notes ends a phrase */
  long: number;
  minN: number;
  distinct: number;
  range: number;
  loose: boolean;
}

function pickTier(line: HeardNote[], want: number, T: Tier): Phrase[] {
  if (line.length < T.minN) return [];
  const durs = line.map((n) => n.d).sort((a, b) => a - b);
  const md = durs[Math.floor(durs.length / 2)];
  // phrases break at rests and at long held notes
  const breaks = new Set<number>();
  for (let i = 1; i < line.length; i++) {
    const gap = line[i].t - (line[i - 1].t + line[i - 1].d);
    if (gap > T.gap || line[i - 1].d > Math.max(0.7, T.long * md)) breaks.add(i);
  }
  // the song's own pitch classes, weighted by time: a note the song hardly ever uses is more likely
  // a harmony voice or a mis-hearing than the tune
  const pcw = new Array<number>(12).fill(0);
  let total = 0;
  for (const n of line) {
    pcw[((n.midi % 12) + 12) % 12] += n.d * n.conf;
    total += n.d * n.conf;
  }
  const pc = (m: number) => ((m % 12) + 12) % 12;
  const rare = (m: number) => pcw[pc(m)] < 0.035 * total;
  const sig = (i: number, n: number) => {
    const out: number[] = [];
    for (let k = i + 1; k < Math.min(i + n, line.length); k++) out.push(line[k].midi - line[k - 1].midi);
    return out.join(',');
  };
  // how often each 5-note shape appears in the song
  const SHAPE = 5;
  const shapes = new Map<string, number[]>();
  for (let i = 0; i + SHAPE <= line.length; i++) {
    const k = sig(i, SHAPE);
    if (!shapes.has(k)) shapes.set(k, []);
    shapes.get(k)!.push(line[i].t);
  }

  const cands: Phrase[] = [];
  for (let i = 0; i < line.length; i++) {
    for (let n = T.minN; n <= 12 && i + n <= line.length; n++) {
      let broken = false;
      for (let k = i + 1; k < i + n; k++) if (breaks.has(k)) broken = true;
      if (broken) break;
      const notes = line.slice(i, i + n);
      const from = notes[0].t;
      const to = notes[n - 1].t + notes[n - 1].d;
      if (to - from > (T.loose ? 14 : 9)) break;
      const midis = notes.map((x) => x.midi);
      const distinct = new Set(midis.map((m) => m % 12)).size;
      const range = Math.max(...midis) - Math.min(...midis);
      let leaps = 0;
      let still = 0;
      for (let k = 1; k < n; k++) {
        const d = Math.abs(midis[k] - midis[k - 1]);
        if (d > 9) leaps++;
        if (d === 0) still++;
      }
      const odd = midis.filter(rare).length;
      if (distinct < T.distinct || range < T.range || range > 16 || odd >= 2) continue;
      const clear = notes.reduce((a, x) => a + x.clear, 0) / n;
      if (clear < PHRASE_CLEAR) continue;
      const conf = notes.reduce((a, x) => a + x.conf, 0) / n;
      const times = shapes.get(sig(i, SHAPE));
      const repeats = n >= SHAPE && times ? times.filter((t) => Math.abs(t - from) > 1.5).length : 0;
      // a complete thought: a phrase that ends right before a rest or a long note is better than one cut mid-flow
      const ends = i + n >= line.length || breaks.has(i + n) || notes[n - 1].d > 1.8 * md;
      const starts = i === 0 || breaks.has(i) || line[i - 1].d > 1.8 * md;
      const sizeFit = 1 - Math.abs(n - 7) / 8;
      const score = conf * 1.2 + Math.log1p(repeats) * 0.55 + (ends ? 0.35 : 0) + (starts ? 0.35 : 0) + sizeFit * 0.4 + Math.min(distinct, 5) * 0.06 - leaps * 0.35 - (still / n) * 0.6 - odd * 0.5;
      cands.push({ notes: midis, from, to, score, conf, repeats, loose: T.loose || undefined });
    }
  }
  cands.sort((a, b) => b.score - a.score);
  const out: Phrase[] = [];
  const pcsOf = (p: Phrase) => ',' + p.notes.map((m) => ((m % 12) + 12) % 12).join(',') + ',';
  for (const c of cands) {
    // alternatives must be real candidates, not the dregs
    if (out.length && c.score < out[0].score - 0.9) break;
    if (out.some((o) => c.from < o.to + 0.5 && c.to > o.from - 0.5)) continue;
    // the same tune again, or a slice of one already chosen, is not a new idea
    const cp = pcsOf(c);
    if (out.some((o) => pcsOf(o).includes(cp) || cp.includes(pcsOf(o)))) continue;
    out.push(c);
    if (out.length >= want) break;
  }
  return out;
}

/** bring a phrase into a comfortable range for the pads and the composer, as a whole */
export function fitRange(notes: number[]): number[] {
  if (!notes.length) return notes;
  const mid = (Math.min(...notes) + Math.max(...notes)) / 2;
  const shift = Math.round((67 - mid) / 12) * 12;
  return notes.map((m) => m + shift);
}
