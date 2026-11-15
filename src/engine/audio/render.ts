import type { Bus, Score, StylePreset } from '../types';
import { AudioGraph, prepareSamples } from './graph';

export interface RenderResult {
  left: Float32Array<ArrayBuffer>;
  right: Float32Array<ArrayBuffer>;
  sampleRate: number;
  /** peak of the mix as it left the mastering chain, before normalisation */
  rawPeak: number;
  /** RMS of the delivered file */
  rms: number;
  seconds: number;
}

export interface RenderOpts {
  levels?: Partial<Record<Bus, number>>;
  sampleRate?: number;
  /** 0..1; first half is "tuning" (samples), second half is the performance itself */
  onProgress?: (p: number, stage: 'samples' | 'performance') => void;
  /** leave the level exactly as the mastering chain delivered it */
  noNormalize?: boolean;
  /** bypass hall and mastering (calibration only) */
  dry?: boolean;
  /** diagnostics: wall-clock milliseconds it took to perform the `span` seconds ending at `t` */
  onChunk?: (t: number, wallMs: number, span: number) => void;
}

/** silence before the first note, so nothing starts on sample zero */
export const LEAD_IN = 0.06;
const CEILING = 0.891; // −1 dBFS

/**
 * Performs the whole score into memory, faster than real time, through the same graph the
 * speakers use. Notes are handed to the context a few seconds at a time so a three-minute
 * orchestral piece never has tens of thousands of nodes alive at once.
 */
export async function renderScore(score: Score, style: StylePreset, opts: RenderOpts = {}): Promise<RenderResult> {
  const sr = opts.sampleRate ?? 44100;
  const seconds = score.durationSec + LEAD_IN;
  const off = new OfflineAudioContext(2, Math.ceil(seconds * sr), sr);
  await prepareSamples(score.events, (p) => opts.onProgress?.(p, 'samples'));
  const graph = new AudioGraph(off, off.destination, style, score.bpm, { levels: opts.levels, raw: opts.dry });
  const spb = 60 / score.bpm;
  const evs = score.events;
  let idx = 0;
  const scheduleUntil = (T: number) => {
    while (idx < evs.length) {
      const when = evs[idx].t * spb + LEAD_IN;
      if (when >= T) break;
      graph.playEvent(evs[idx], when, spb);
      idx++;
    }
  };
  const CHUNK = 3;
  let mark = performance.now();
  if (typeof off.suspend === 'function') {
    scheduleUntil(CHUNK + 1);
    mark = performance.now();
    for (let T = CHUNK; T < seconds; T += CHUNK) {
      off
        .suspend(T)
        .then(() => {
          const now = performance.now();
          opts.onChunk?.(T, now - mark, CHUNK);
          scheduleUntil(T + CHUNK + 1);
          mark = performance.now();
          opts.onProgress?.(T / seconds, 'performance');
          return off.resume();
        })
        .catch(() => {
          /* a suspend point past the end of the render — nothing left to do */
        });
    }
  } else scheduleUntil(Infinity);

  const buf = await off.startRendering();
  graph.dispose();
  const left = buf.getChannelData(0);
  const right = buf.getChannelData(1);
  let peak = 0;
  for (let i = 0; i < left.length; i++) {
    const a = Math.abs(left[i]);
    const b = Math.abs(right[i]);
    if (a > peak) peak = a;
    if (b > peak) peak = b;
  }
  const gain = opts.noNormalize || peak < 1e-6 ? 1 : CEILING / peak;
  const fade = Math.min(left.length, Math.floor(sr * 0.35));
  let sq = 0;
  for (let i = 0; i < left.length; i++) {
    const tail = left.length - i;
    const g = tail < fade ? (gain * tail) / fade : gain;
    left[i] *= g;
    right[i] *= g;
    sq += left[i] * left[i] + right[i] * right[i];
  }
  opts.onProgress?.(1, 'performance');
  return { left, right, sampleRate: sr, rawPeak: peak, rms: Math.sqrt(sq / (2 * left.length)), seconds };
}
