/**
 * One animation loop for the whole studio. Every frame it advances the player's visual state,
 * folds the live spectrum into 64 log-spaced bands, then calls whoever is listening.
 */
import { player } from '@/engine/audio/player';

export const BANDS = 64;

export const fx = {
  /** smoothed spectrum, 0..1, low → high */
  bands: new Float32Array(BANDS),
  bass: 0,
  mid: 0,
  high: 0,
  /** overall loudness 0..1 */
  level: 0,
  /** seconds since the page loaded */
  time: 0,
};

type Cb = (t: number, dt: number) => void;
const cbs = new Set<Cb>();
let raf = 0;
let last = 0;
let bins: Uint8Array<ArrayBuffer> | null = null;

function analyse(dt: number) {
  const an = player.analyser;
  const fall = Math.exp(-dt * 7);
  if (!an) {
    for (let i = 0; i < BANDS; i++) fx.bands[i] *= fall;
    fx.bass *= fall;
    fx.mid *= fall;
    fx.high *= fall;
    fx.level *= fall;
    return;
  }
  if (!bins || bins.length !== an.frequencyBinCount) bins = new Uint8Array(an.frequencyBinCount);
  an.getByteFrequencyData(bins);
  const hz = an.context.sampleRate / an.fftSize;
  const lo = 32;
  const ratio = 15000 / lo;
  let bass = 0;
  let mid = 0;
  let high = 0;
  let all = 0;
  for (let k = 0; k < BANDS; k++) {
    const f0 = (lo * Math.pow(ratio, k / BANDS)) / hz;
    const f1 = (lo * Math.pow(ratio, (k + 1) / BANDS)) / hz;
    let v: number;
    if (f1 - f0 < 1) {
      const i = Math.min(bins.length - 2, Math.floor((f0 + f1) / 2));
      const fr = (f0 + f1) / 2 - i;
      v = bins[i] * (1 - fr) + bins[i + 1] * fr;
    } else {
      v = 0;
      const a = Math.floor(f0);
      const b = Math.min(bins.length - 1, Math.ceil(f1));
      for (let i = a; i < b; i++) v = Math.max(v, bins[i]);
    }
    // music falls away toward the top; lift it so the whole corona moves
    v = Math.pow(Math.min(1, (v / 255) * (0.85 + (k / BANDS) * 0.9)), 1.35);
    const prev = fx.bands[k];
    fx.bands[k] = v > prev ? prev + (v - prev) * 0.65 : Math.max(v, prev * fall);
    all += fx.bands[k];
    if (k < 16) bass += fx.bands[k];
    else if (k < 44) mid += fx.bands[k];
    else high += fx.bands[k];
  }
  fx.bass = bass / 16;
  fx.mid = mid / 28;
  fx.high = high / 20;
  fx.level = all / BANDS;
}

// Displays refresh anywhere from 60 to 360 times a second, and the sky is a full-screen shader.
// Drawing it 240 times a second buys nothing the eye can use, so the studio draws on every Nth
// refresh: the divisor that lands closest to 60 a second (144 Hz → 72, 240 Hz → 60, 60 Hz → 60).
export const pace = { every: 1, hz: 60 };
let prev = 0;
const gaps = new Float32Array(80);
let seen = 0;
let skip = 0;

function run(now: number) {
  raf = requestAnimationFrame(run);
  if (prev) {
    gaps[seen++] = now - prev;
    if (seen === gaps.length) {
      // the median gap is the display's refresh interval, unless most frames are being dropped,
      // in which case it reads long and the studio (rightly) stops skipping
      gaps.sort();
      pace.hz = 1000 / Math.max(1, gaps[gaps.length >> 1]);
      pace.every = Math.max(1, Math.floor(pace.hz / 60 + 0.25));
      seen = 0;
    }
  }
  prev = now;
  if (++skip < pace.every) return;
  skip = 0;
  const t = now / 1000;
  const dt = Math.min(0.1, last ? t - last : 0.016);
  last = t;
  fx.time = t;
  player.frame();
  analyse(dt);
  cbs.forEach((cb) => cb(t, dt));
}

/** subscribe to the frame loop; returns the unsubscribe */
export function onFrame(cb: Cb): () => void {
  cbs.add(cb);
  if (!raf) raf = requestAnimationFrame(run);
  return () => {
    cbs.delete(cb);
    if (!cbs.size) {
      cancelAnimationFrame(raf);
      raf = 0;
      last = 0;
      prev = 0;
      seen = 0;
    }
  };
}
