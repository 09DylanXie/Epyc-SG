/**
 * Sample-level synthesis. Everything percussive, plucked or struck is computed here as raw
 * Float32Arrays — no recordings, no sample packs. Pure functions, usable in Node for tests.
 */
import { makeRng, type Rng } from '../rng';

const TAU = Math.PI * 2;
export type F32 = Float32Array<ArrayBuffer>;
export type Chans = F32[];

const mk = (sr: number, sec: number) => new Float32Array(Math.max(1, Math.ceil(sr * sec)));

function white(n: number, rng: Rng): F32 {
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = rng.next() * 2 - 1;
  return x;
}

type BqType = 'lp' | 'hp' | 'bp';
/** RBJ biquad, returns a new array */
function bq(x: F32, type: BqType, fc: number, q: number, sr: number): F32 {
  const w = (TAU * Math.min(fc, sr * 0.45)) / sr;
  const cs = Math.cos(w);
  const al = Math.sin(w) / (2 * q);
  let b0: number, b1: number, b2: number;
  if (type === 'lp') {
    b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = (1 - cs) / 2;
  } else if (type === 'hp') {
    b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = (1 + cs) / 2;
  } else {
    b0 = al; b1 = 0; b2 = -al;
  }
  const a0 = 1 + al;
  const a1 = -2 * cs;
  const a2 = 1 - al;
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  const B0 = b0 / a0, B1 = b1 / a0, B2 = b2 / a0, A1 = a1 / a0, A2 = a2 / a0;
  for (let i = 0; i < x.length; i++) {
    const xi = x[i];
    const yi = B0 * xi + B1 * x1 + B2 * x2 - A1 * y1 - A2 * y2;
    x2 = x1; x1 = xi; y2 = y1; y1 = yi;
    y[i] = yi;
  }
  return y;
}

/** adds a sine whose frequency glides f0→f1 and whose amplitude decays exponentially */
function tone(out: F32, sr: number, f0: number, f1: number, glide: number, amp: number, decay: number, phase = 0, attack = 0) {
  // multiplicative envelopes: no transcendental calls in the loop except the sine itself
  let ph = phase;
  const kd = Math.exp(-1 / (sr * decay));
  const kg = f0 === f1 ? 1 : Math.exp(-1 / (sr * glide));
  const ka = attack > 0 ? Math.exp(-1 / (sr * attack)) : 0;
  const w = TAU / sr;
  const stop = decay * 3 * sr;
  let env = amp;
  let gl = f0 - f1;
  let at = 1;
  for (let i = 0; i < out.length; i++) {
    ph += w * (f1 + gl);
    const a = attack > 0 ? env * (1 - at) : env;
    if (a < 1e-5 && i > stop) break;
    out[i] += Math.sin(ph) * a;
    env *= kd;
    gl *= kg;
    at *= ka;
  }
}

/** adds src × exponential decay */
function addEnv(out: F32, src: F32, sr: number, amp: number, decay: number, attack = 0, at = 0) {
  const o = Math.floor(at * sr);
  for (let i = 0; i + o < out.length && i < src.length; i++) {
    const t = i / sr;
    let a = amp * Math.exp(-t / decay);
    if (attack > 0) a *= 1 - Math.exp(-t / attack);
    out[i + o] += src[i] * a;
  }
}

function drive(x: F32, k: number) {
  for (let i = 0; i < x.length; i++) x[i] = Math.tanh(x[i] * k);
}

function norm(chs: Chans, peak = 0.92): Chans {
  let m = 0;
  for (const c of chs) for (let i = 0; i < c.length; i++) m = Math.max(m, Math.abs(c[i]));
  if (m > 0) for (const c of chs) for (let i = 0; i < c.length; i++) c[i] *= peak / m;
  return chs;
}

function fadeOut(chs: Chans, sr: number, sec: number) {
  for (const c of chs) {
    const n = Math.min(c.length, Math.floor(sr * sec));
    for (let i = 0; i < n; i++) c[c.length - 1 - i] *= i / n;
  }
  return chs;
}

// ───────────────────────────── percussion ─────────────────────────────

function taiko(sr: number, rng: Rng, f: number, len: number, decay: number, stickF: number): Chans {
  const o = mk(sr, len);
  tone(o, sr, f * 1.75, f, 0.045, 1, decay);
  tone(o, sr, f * 2.5, f * 1.52, 0.03, 0.34, decay * 0.48, 1);
  tone(o, sr, f * 3.6, f * 2.31, 0.02, 0.14, decay * 0.25, 2);
  const n = white(o.length, rng);
  addEnv(o, bq(n, 'lp', f * 4.5, 0.7, sr), sr, 0.7, decay * 0.3);
  addEnv(o, bq(n, 'bp', 700, 0.7, sr), sr, 0.35, 0.03);
  addEnv(o, bq(n, 'bp', stickF, 0.8, sr), sr, 0.5, 0.011);
  drive(o, 1.5);
  return fadeOut(norm([o]), sr, 0.02);
}

function boom(sr: number, rng: Rng): Chans {
  const o = mk(sr, 3.2);
  tone(o, sr, 78, 37, 0.07, 1, 0.75, 0, 0.004);
  tone(o, sr, 120, 74, 0.05, 0.3, 0.3, 1, 0.004);
  const n = white(o.length, rng);
  addEnv(o, bq(n, 'lp', 130, 0.7, sr), sr, 1.2, 0.5, 0.006);
  addEnv(o, bq(n, 'bp', 260, 0.7, sr), sr, 0.5, 0.05, 0.003);
  drive(o, 1.3);
  return fadeOut(norm([o]), sr, 0.05);
}

function impact(sr: number, rng: Rng): Chans {
  const len = 4.2;
  const chs: Chans = [];
  const low = mk(sr, len);
  tone(low, sr, 150, 33, 0.09, 1, 1.15);
  tone(low, sr, 60, 48, 0.2, 0.4, 1.6, 1);
  const metals = [173, 311, 437, 587, 811, 1103, 1490];
  for (let c = 0; c < 2; c++) {
    const o = mk(sr, len);
    const n = white(o.length, rng);
    // noise through a closing lowpass
    let lp = 0;
    for (let i = 0; i < o.length; i++) {
      const t = i / sr;
      const fc = 180 + 9500 * Math.exp(-t / 0.33);
      const a = 1 - Math.exp((-TAU * fc) / sr);
      lp += a * (n[i] - lp);
      o[i] = lp * 0.9 * Math.exp(-t / 0.85) + low[i];
    }
    metals.forEach((f, i) => tone(o, sr, f * (1 + (c ? 0.004 : -0.003)), f, 0.5, 0.11 / (1 + i * 0.25), 1.1 / (1 + i * 0.35), i + c));
    for (let i = 0; i < sr * 0.004; i++) o[i] += n[i] * (1 - i / (sr * 0.004)) * 0.8;
    drive(o, 1.7);
    chs.push(o);
  }
  return fadeOut(norm(chs), sr, 0.08);
}

function snareOrch(sr: number, rng: Rng): Chans {
  const o = mk(sr, 0.55);
  tone(o, sr, 215, 182, 0.02, 0.55, 0.055);
  tone(o, sr, 340, 331, 0.02, 0.25, 0.035, 1);
  const n = white(o.length, rng);
  addEnv(o, bq(bq(n, 'bp', 3800, 0.45, sr), 'hp', 900, 0.7, sr), sr, 1.5, 0.11);
  addEnv(o, bq(n, 'hp', 2500, 0.7, sr), sr, 0.6, 0.008);
  drive(o, 1.3);
  return fadeOut(norm([o]), sr, 0.01);
}

function stick(sr: number, rng: Rng): Chans {
  const o = mk(sr, 0.14);
  tone(o, sr, 1750, 1750, 1, 0.7, 0.012);
  tone(o, sr, 2950, 2950, 1, 0.5, 0.008, 1);
  tone(o, sr, 890, 890, 1, 0.3, 0.016, 2);
  const n = white(o.length, rng);
  addEnv(o, n, sr, 0.5, 0.0012);
  return norm([o], 0.8);
}

function anvil(sr: number, rng: Rng): Chans {
  const o = mk(sr, 1.5);
  const base = 587;
  [1, 1.47, 2.09, 2.56, 3.39, 4.08, 5.12, 6.33].forEach((r, i) => {
    const f = base * r;
    const d = 0.55 / (1 + i * 0.45);
    tone(o, sr, f, f, 1, 1 / (1 + i * 0.4), d, i);
    tone(o, sr, f * 1.007, f * 1.007, 1, 0.5 / (1 + i * 0.4), d * 0.8, i * 2);
  });
  const n = white(o.length, rng);
  addEnv(o, bq(n, 'hp', 3000, 0.7, sr), sr, 1.6, 0.004);
  drive(o, 1.4);
  return fadeOut(norm([o], 0.85), sr, 0.02);
}

function gong(sr: number, rng: Rng): Chans {
  const len = 6;
  const L = mk(sr, len);
  const R = mk(sr, len);
  tone(L, sr, 64, 62, 0.3, 0.9, 3.2, 0, 0.01);
  tone(R, sr, 64, 62, 0.3, 0.9, 3.2, 0.4, 0.01);
  for (let k = 0; k < 26; k++) {
    const f = 80 * Math.pow(52, rng.next());
    const amp = 0.5 / (1 + Math.pow(f / 420, 1.1));
    const att = 0.01 + 0.8 * Math.pow(f / 4200, 0.7);
    const dec = 4.2 / (1 + f / 950);
    const pan = rng.next();
    const tmp = mk(sr, Math.min(len, dec * 5 + att * 3));
    tone(tmp, sr, f, f, 1, amp, dec, rng.next() * TAU, att);
    for (let i = 0; i < tmp.length; i++) {
      L[i] += tmp[i] * (1 - pan);
      R[i] += tmp[i] * pan;
    }
  }
  for (const c of [L, R]) {
    const n = bq(white(c.length, rng), 'bp', 3200, 0.3, sr);
    addEnv(c, n, sr, 0.12, 1.7, 0.35);
  }
  return fadeOut(norm([L, R], 0.85), sr, 0.3);
}

function crash(sr: number, rng: Rng): Chans {
  const chs: Chans = [];
  for (let c = 0; c < 2; c++) {
    const o = mk(sr, 2.8);
    const n = white(o.length, rng);
    addEnv(o, bq(n, 'hp', 4200, 0.6, sr), sr, 1, 0.6);
    addEnv(o, bq(n, 'bp', 8500, 1, sr), sr, 0.7, 0.95);
    addEnv(o, bq(n, 'bp', 1400, 0.6, sr), sr, 0.4, 0.09);
    for (let k = 0; k < 9; k++) {
      const f = 2800 + rng.next() * 5200;
      tone(o, sr, f, f, 1, 0.05, 0.5 + rng.next() * 0.6, rng.next() * 6);
    }
    chs.push(o);
  }
  return fadeOut(norm(chs, 0.8), sr, 0.1);
}

/** a cymbal swell that peaks at the very end of the buffer */
function swell(sr: number, rng: Rng): Chans {
  const len = 4;
  const chs: Chans = [];
  for (let c = 0; c < 2; c++) {
    const n = bq(bq(white(Math.ceil(sr * len), rng), 'bp', 6200, 0.4, sr), 'hp', 1800, 0.7, sr);
    for (let i = 0; i < n.length; i++) {
      const t = i / sr;
      n[i] *= Math.exp((t - len) / 0.85);
    }
    chs.push(n);
  }
  return fadeOut(norm(chs, 0.8), sr, 0.03);
}

function kick(sr: number, rng: Rng, fStart: number, fEnd: number, glide: number, decay: number, len: number, click: number, lp?: number): Chans {
  let o = mk(sr, len);
  tone(o, sr, fStart, fEnd, glide, 1, decay);
  const n = white(o.length, rng);
  addEnv(o, bq(n, 'lp', 5000, 0.7, sr), sr, click, 0.003);
  drive(o, 1.5);
  if (lp) o = bq(o, 'lp', lp, 0.7, sr);
  return fadeOut(norm([o]), sr, 0.02);
}

function snare(sr: number, rng: Rng): Chans {
  const o = mk(sr, 0.5);
  tone(o, sr, 230, 186, 0.02, 0.6, 0.06);
  const n = bq(white(o.length, rng), 'bp', 2600, 0.45, sr);
  // gated: holds, then falls off a cliff
  for (let i = 0; i < o.length; i++) {
    const t = i / sr;
    const g = t < 0.15 ? Math.exp(-t / 0.2) : Math.exp(-0.75) * Math.exp(-(t - 0.15) / 0.02);
    o[i] += n[i] * g * 1.4;
  }
  addEnv(o, bq(white(o.length, rng), 'hp', 3000, 0.7, sr), sr, 0.6, 0.007);
  drive(o, 1.4);
  return fadeOut(norm([o]), sr, 0.01);
}

function snareLofi(sr: number, rng: Rng): Chans {
  const o = mk(sr, 0.36);
  tone(o, sr, 235, 205, 0.02, 0.5, 0.05);
  const n = bq(bq(white(o.length, rng), 'lp', 3600, 0.6, sr), 'hp', 450, 0.7, sr);
  addEnv(o, n, sr, 1.5, 0.075);
  drive(o, 1.8);
  return fadeOut(norm([bq(o, 'lp', 5200, 0.6, sr)], 0.85), sr, 0.01);
}

function clap(sr: number, rng: Rng): Chans {
  const o = mk(sr, 0.42);
  const n = bq(white(o.length, rng), 'bp', 1550, 1.1, sr);
  for (let i = 0; i < o.length; i++) {
    const t = i / sr;
    let g = 0;
    for (const t0 of [0, 0.011, 0.023]) if (t >= t0) g += Math.exp(-(t - t0) / 0.006);
    if (t >= 0.03) g += 0.8 * Math.exp(-(t - 0.03) / 0.085);
    o[i] = n[i] * g;
  }
  return fadeOut(norm([o], 0.85), sr, 0.01);
}

function rim(sr: number, rng: Rng): Chans {
  const o = mk(sr, 0.12);
  tone(o, sr, 1720, 1720, 1, 0.6, 0.012);
  tone(o, sr, 465, 465, 1, 0.5, 0.02, 1);
  addEnv(o, white(o.length, rng), sr, 0.5, 0.0015);
  return norm([o], 0.8);
}

function hat(sr: number, rng: Rng, decay: number, len: number): Chans {
  const o = mk(sr, len);
  const n = white(o.length, rng);
  addEnv(o, bq(n, 'hp', 7200, 0.7, sr), sr, 1, decay);
  addEnv(o, bq(n, 'bp', 10500, 1.4, sr), sr, 0.6, decay * 1.2);
  for (let k = 0; k < 6; k++) {
    const f = 3800 + k * 1130 + rng.next() * 300;
    tone(o, sr, f, f, 1, 0.07, decay * 0.9, k);
  }
  return fadeOut(norm([o], 0.75), sr, 0.006);
}

function shaker(sr: number, rng: Rng): Chans {
  const o = mk(sr, 0.16);
  addEnv(o, bq(white(o.length, rng), 'bp', 6500, 0.8, sr), sr, 1, 0.035, 0.012);
  return fadeOut(norm([o], 0.7), sr, 0.01);
}

function tick(sr: number): Chans {
  const o = mk(sr, 0.1);
  tone(o, sr, 2300, 2300, 1, 0.6, 0.006);
  tone(o, sr, 4700, 4700, 1, 0.4, 0.004, 1);
  tone(o, sr, 1150, 1150, 1, 0.35, 0.012, 2);
  return norm([o], 0.8);
}

function vinyl(sr: number, rng: Rng): Chans {
  const len = 4;
  const chs: Chans = [];
  for (let c = 0; c < 2; c++) {
    const n = Math.ceil(sr * len);
    const imp = new Float32Array(n);
    for (let i = 0; i < n; i++) if (rng.next() < 16 / sr) imp[i] = (rng.next() * 2 - 1) * (0.2 + rng.next() * 0.8) * (rng.next() < 0.12 ? 2.4 : 1);
    const o = bq(imp, 'lp', 3400, 0.6, sr);
    const hiss = bq(white(n, rng), 'bp', 5200, 0.3, sr);
    const rumble = bq(white(n, rng), 'lp', 70, 0.7, sr);
    for (let i = 0; i < n; i++) o[i] = o[i] * 2.2 + hiss[i] * 0.02 + rumble[i] * 0.25;
    chs.push(o);
  }
  return norm(chs, 0.5);
}

function timpani(sr: number, rng: Rng): Chans {
  // rendered at A2 (110 Hz), repitched on playback
  const f = 110;
  const o = mk(sr, 3.2);
  const ratios = [1, 1.5, 1.98, 2.44, 2.91, 3.4];
  const amps = [1, 0.5, 0.32, 0.2, 0.12, 0.08];
  const decs = [1.3, 0.9, 0.65, 0.45, 0.35, 0.28];
  ratios.forEach((r, i) => tone(o, sr, f * r * 1.035, f * r, 0.035, amps[i], decs[i], i));
  const n = white(o.length, rng);
  addEnv(o, bq(n, 'lp', 520, 0.7, sr), sr, 1.1, 0.016);
  addEnv(o, bq(n, 'bp', 1500, 0.7, sr), sr, 0.25, 0.006);
  drive(o, 1.2);
  return fadeOut(norm([o]), sr, 0.05);
}

function shortNoise(sr: number, rng: Rng, type: BqType, fc: number, q: number, decay: number, len: number): Chans {
  const o = mk(sr, len);
  addEnv(o, bq(white(o.length, rng), type, fc, q, sr), sr, 1, decay);
  return norm([o], 0.8);
}

export const PERC: Record<string, (sr: number, rng: Rng) => Chans> = {
  taikoLo: (sr, r) => taiko(sr, r, 62, 1.5, 0.4, 1900),
  taikoMid: (sr, r) => taiko(sr, r, 104, 1.0, 0.25, 2300),
  taikoHi: (sr, r) => taiko(sr, r, 205, 0.6, 0.13, 3100),
  boom,
  impact,
  snareOrch,
  stick,
  anvil,
  gong,
  crash,
  swell,
  kick: (sr, r) => kick(sr, r, 190, 46, 0.028, 0.16, 0.55, 0.4),
  kickDeep: (sr, r) => kick(sr, r, 130, 40, 0.04, 0.32, 0.95, 0.3),
  kickSoft: (sr, r) => kick(sr, r, 115, 50, 0.035, 0.14, 0.5, 0.15, 2200),
  snare,
  snareLofi,
  clap,
  rim,
  hat: (sr, r) => hat(sr, r, 0.022, 0.13),
  hatOpen: (sr, r) => hat(sr, r, 0.14, 0.55),
  shaker,
  tick: (sr) => tick(sr),
  vinyl,
  timpani,
  bite: (sr, r) => shortNoise(sr, r, 'bp', 2400, 0.6, 0.012, 0.06),
  thump: (sr, r) => shortNoise(sr, r, 'lp', 900, 0.7, 0.008, 0.06),
  breath: (sr, r) => shortNoise(sr, r, 'bp', 1800, 0.5, 0.03, 0.14),
  noise: (sr, r) => [white(sr * 2, r)],
};

export function renderPerc(name: string, sr: number): Chans {
  const fn = PERC[name];
  if (!fn) throw new Error(`no percussion voice: ${name}`);
  return fn(sr, makeRng(`perc:${name}`));
}

// ───────────────────────────── plucked strings (Karplus–Strong) ─────────────────────────────

export type PluckKind = 'harp' | 'zither' | 'pizz';

/** returns the samples and the playbackRate that puts them exactly in tune */
export function renderPluck(kind: PluckKind, midi: number, sr: number): { chs: Chans; rate: number } {
  const f = 440 * Math.pow(2, (midi - 69) / 12);
  const rng = makeRng(`pluck:${kind}:${midi}`);
  const cfg = {
    harp: { len: 3.0, tau: 2.4, bright: 2600, pick: 0, body: 0 },
    zither: { len: 2.6, tau: 1.9, bright: 7500, pick: 7, body: 0 },
    pizz: { len: 0.9, tau: 0.28, bright: 1700, pick: 0, body: 240 },
  }[kind];
  // loop filter y = rho * ((1-a)·x[n-N] + a·x[n-N-1]); smaller a = less damping for high strings
  const S = Math.max(1, f / 300);
  const a = 0.5 / S;
  const N = Math.max(2, Math.round(sr / f - a));
  const rate = (f * (N + a)) / sr;
  const tau = cfg.tau * Math.pow(2, -(midi - 55) / 30);
  const rho = Math.exp(-(N + a) / (sr * tau));
  const n = Math.ceil(sr * Math.min(cfg.len, tau * 5 + 0.3));
  const y = new Float32Array(n);
  // excitation: one period of shaped noise
  let ex = white(N, rng);
  ex = bq(ex, 'lp', Math.min(sr * 0.4, cfg.bright + f * 2), 0.6, sr);
  if (cfg.pick) {
    const d = Math.max(1, Math.round(N / cfg.pick));
    const c = ex.slice();
    for (let i = 0; i < N; i++) ex[i] = c[i] - 0.8 * c[(i + N - d) % N];
  }
  let mean = 0;
  for (let i = 0; i < N; i++) mean += ex[i];
  mean /= N;
  for (let i = 0; i < N; i++) y[i] = ex[i] - mean;
  for (let i = N; i < n; i++) {
    const p1 = y[i - N];
    const p2 = i - N - 1 >= 0 ? y[i - N - 1] : 0;
    y[i] = rho * ((1 - a) * p1 + a * p2);
  }
  let out: F32 = y;
  if (cfg.body) out = bq(out, 'lp', cfg.body * 10, 0.6, sr);
  // soft pluck onset
  const at = Math.floor(sr * 0.002);
  for (let i = 0; i < at && i < out.length; i++) out[i] *= i / at;
  return { chs: fadeOut(norm([out], 0.85), sr, 0.03), rate };
}

// ───────────────────────────── struck metal (additive) ─────────────────────────────

export type BellKind = 'bell' | 'glock' | 'celesta';

export function renderBell(kind: BellKind, midi: number, sr: number): Chans {
  const f = 440 * Math.pow(2, (midi - 69) / 12);
  const rng = makeRng(`bell:${kind}:${midi}`);
  const reg = Math.pow(2, -(midi - 60) / 24);
  if (kind === 'bell') {
    // hum, prime, tierce (minor third), quint, nominal, and the upper partials of a cast bell
    const ratios = [0.5, 1, 1.2, 1.5, 2, 2.5, 2.67, 3, 4, 5.33, 6.67];
    const amps = [0.55, 0.9, 0.75, 0.3, 1, 0.28, 0.2, 0.36, 0.24, 0.12, 0.07];
    const o = mk(sr, Math.min(6, 5.2 * reg + 1));
    ratios.forEach((r, i) => {
      const pf = f * r;
      if (pf > sr * 0.45) return;
      const dec = Math.min(4.5, (3.6 * reg) / Math.pow(r, 0.85) + 0.25);
      tone(o, sr, pf, pf, 1, amps[i], dec, rng.next() * TAU);
      if (i < 6) tone(o, sr, pf * (1 + 0.0016 + rng.next() * 0.002), pf, 1e9, amps[i] * 0.5, dec * 0.9, rng.next() * TAU);
    });
    const n = white(Math.floor(sr * 0.05), rng);
    addEnv(o, bq(n, 'bp', Math.min(6000, f * 6), 0.8, sr), sr, 0.6, 0.006);
    return fadeOut(norm([o], 0.85), sr, 0.2);
  }
  const spec =
    kind === 'glock'
      ? { ratios: [1, 2.76, 5.4, 8.93], amps: [1, 0.34, 0.14, 0.05], decs: [0.9, 0.35, 0.15, 0.08], len: 2.2, att: 0 }
      : { ratios: [1, 2, 3, 4.2], amps: [1, 0.3, 0.1, 0.05], decs: [0.75, 0.4, 0.2, 0.1], len: 1.8, att: 0.003 };
  const o = mk(sr, spec.len * Math.min(1.5, reg + 0.4));
  spec.ratios.forEach((r, i) => {
    const pf = f * r;
    if (pf > sr * 0.45) return;
    tone(o, sr, pf, pf, 1, spec.amps[i], spec.decs[i] * Math.min(1.6, reg + 0.3), i, spec.att);
  });
  return fadeOut(norm([o], 0.85), sr, 0.05);
}

// ───────────────────────────── the hall ─────────────────────────────

/** A synthetic concert hall: early reflections, then a diffuse tail that darkens as it decays. */
export function renderImpulse(sr: number, size: number, damp: number, seed = 'hall'): Chans {
  const rng = makeRng(`ir:${seed}`);
  const len = Math.ceil(sr * size * 1.1);
  const chs: Chans = [];
  for (let c = 0; c < 2; c++) {
    const o = new Float32Array(len);
    let lp = 0;
    let hpPrev = 0;
    let hpOut = 0;
    const hpA = Math.exp((-TAU * 140) / sr);
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const fc = 900 + 15000 * Math.exp((-t * (1.5 + damp * 7)) / size);
      const a = 1 - Math.exp((-TAU * fc) / sr);
      const x = (rng.next() * 2 - 1) * Math.exp((-6.9 * t) / size) * (1 - Math.exp(-t / 0.014));
      lp += a * (x - lp);
      hpOut = hpA * (hpOut + lp - hpPrev);
      hpPrev = lp;
      o[i] = hpOut;
    }
    // early reflections
    for (let k = 0; k < 10; k++) {
      const t = 0.006 + rng.next() * 0.085;
      const amp = (0.55 - 0.035 * k) * (rng.next() < 0.5 ? -1 : 1) * (((k + c) & 1) ? 0.55 : 1);
      const idx = Math.floor(t * sr);
      if (idx < len) o[idx] += amp * 0.6;
    }
    chs.push(o);
  }
  return fadeOut(chs, sr, 0.1);
}

// ───────────────────────────── spectra for PeriodicWaves ─────────────────────────────

type Formant = [freq: number, db: number, bw: number];
const VOWELS: Record<string, Record<string, Formant[]>> = {
  a: {
    soprano: [[800, 0, 80], [1150, -6, 90], [2900, -32, 120], [3900, -20, 130], [4950, -50, 140]],
    alto: [[800, 0, 80], [1150, -4, 90], [2800, -20, 120], [3500, -36, 130], [4950, -60, 140]],
    tenor: [[650, 0, 80], [1080, -6, 90], [2650, -7, 120], [2900, -8, 130], [3250, -22, 140]],
    bass: [[600, 0, 60], [1040, -7, 70], [2250, -9, 110], [2450, -9, 120], [2750, -20, 130]],
  },
  o: {
    soprano: [[450, 0, 70], [800, -11, 80], [2830, -22, 100], [3800, -22, 130], [4950, -50, 135]],
    alto: [[450, 0, 70], [800, -9, 80], [2830, -16, 100], [3500, -28, 130], [4950, -55, 135]],
    tenor: [[400, 0, 40], [800, -10, 80], [2600, -12, 100], [2800, -12, 120], [3000, -26, 120]],
    bass: [[400, 0, 40], [750, -11, 80], [2400, -21, 100], [2600, -20, 120], [2900, -40, 120]],
  },
  u: {
    soprano: [[325, 0, 50], [700, -16, 60], [2700, -35, 170], [3800, -40, 180], [4950, -60, 200]],
    alto: [[325, 0, 50], [700, -12, 60], [2530, -30, 170], [3500, -40, 180], [4950, -64, 200]],
    tenor: [[350, 0, 40], [600, -20, 60], [2700, -17, 100], [2900, -14, 120], [3300, -26, 120]],
    bass: [[350, 0, 40], [600, -20, 80], [2400, -32, 100], [2675, -28, 120], [2950, -36, 120]],
  },
};

export type Vowel = 'a' | 'o' | 'u';

/** harmonic amplitudes of a sung vowel at a given pitch (index 0 = fundamental) */
export function vowelSpectrum(f0: number, vowel: Vowel, bright = 0, maxHz = 9000): number[] {
  const midi = 69 + 12 * Math.log2(f0 / 440);
  const voice = midi < 52 ? 'bass' : midi < 60 ? 'tenor' : midi < 69 ? 'alto' : 'soprano';
  const fm = VOWELS[vowel][voice];
  const n = Math.max(2, Math.min(96, Math.floor(maxHz / f0)));
  const out: number[] = [];
  for (let h = 1; h <= n; h++) {
    const f = h * f0;
    let a = 0;
    fm.forEach(([F, db, bw], k) => {
      const g = Math.pow(10, (db + (k >= 2 ? bright : 0)) / 20);
      const x = (f - F) / (bw * 0.9);
      a += g / Math.sqrt(1 + x * x);
    });
    // a little glottal source under the formants keeps low voices from sounding hollow
    a += 0.06 / h;
    out.push(a);
  }
  return out;
}

export function pianoSpectrum(midi: number, soft: boolean): number[] {
  const f = 440 * Math.pow(2, (midi - 69) / 12);
  const reg = Math.min(1, Math.max(0, (midi - 30) / 66));
  const n = Math.max(2, Math.min(48, Math.floor((soft ? 5200 : 9500) / f)));
  const out: number[] = [];
  for (let h = 1; h <= n; h++) {
    let a = Math.pow(h, soft ? -1.5 : -1.12) * Math.exp(-(h - 1) * (0.02 + 0.07 * reg + (soft ? 0.05 : 0)));
    // the hammer strikes about one eighth of the way along the string
    a *= 0.25 + 0.75 * Math.abs(Math.sin((Math.PI * h) / 7.6));
    out.push(a);
  }
  return out;
}

export const ORGAN_SPECTRUM = [1, 0.75, 0.45, 0.55, 0.12, 0.3, 0.04, 0.38, 0.02, 0.1, 0, 0.16, 0, 0, 0, 0.2];
export const FLUTE_SPECTRUM = [1, 0.42, 0.18, 0.08, 0.05, 0.02];
export const BAMBOO_SPECTRUM = [1, 0.25, 0.32, 0.08, 0.12, 0.04, 0.05];

// ───────────────────────────── file encoders ─────────────────────────────

export function encodeWav(left: Float32Array, right: Float32Array, sr: number): ArrayBuffer {
  const n = left.length;
  const buf = new ArrayBuffer(44 + n * 4);
  const v = new DataView(buf);
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, 'RIFF');
  v.setUint32(4, 36 + n * 4, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 2, true);
  v.setUint32(24, sr, true);
  v.setUint32(28, sr * 4, true);
  v.setUint16(32, 4, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, n * 4, true);
  let o = 44;
  for (let i = 0; i < n; i++) {
    const l = Math.max(-1, Math.min(1, left[i]));
    const r = Math.max(-1, Math.min(1, right[i]));
    v.setInt16(o, l < 0 ? l * 0x8000 : l * 0x7fff, true);
    v.setInt16(o + 2, r < 0 ? r * 0x8000 : r * 0x7fff, true);
    o += 4;
  }
  return buf;
}
