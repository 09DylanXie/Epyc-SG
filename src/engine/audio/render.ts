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
  /** Amplify: the recording, mixed in untouched, and how loud the layer sits against it */
  song?: { buf: AudioBuffer; gain: number; layer: number; from?: number };
  /** diagnostics: wall-clock milliseconds it took to perform the `span` seconds ending at `t` */
  onChunk?: (t: number, wallMs: number, span: number) => void;
}

/** seconds after a part's last beat for the hall and the last notes to ring out */
export const PART_TAIL = 2.5;

/**
 * One part of a piece as a piece of its own: the notes that start inside [from, to) beats, moved
 * to the top, with a short tail so the last chord rings into the hall instead of being cut.
 */
export function sliceScore(sc: Score, from: number, to: number): Score {
  const spb = 60 / sc.bpm;
  const beats = Math.max(0, to - from);
  const events = sc.events.filter((e) => e.t >= from - 0.03 && e.t < to - 0.01).map((e) => ({ ...e, t: Math.max(0, e.t - from) }));
  const durationSec = beats * spb + PART_TAIL;
  return {
    ...sc,
    events,
    durationSec,
    totalBeats: beats,
    song: sc.song ? { ...sc.song, seconds: Math.max(0, Math.min(sc.song.seconds - from * spb, durationSec)) } : sc.song,
  };
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
  // the recording goes straight to the output: no hall, no tone shaping, no compression
  let dest: AudioNode = off.destination;
  if (opts.song && score.song) {
    const layer = off.createGain();
    layer.gain.value = opts.song.layer;
    layer.connect(off.destination);
    dest = layer;
    const g = off.createGain();
    g.gain.value = opts.song.gain;
    g.connect(off.destination);
    const src = off.createBufferSource();
    src.buffer = opts.song.buf;
    src.connect(g);
    const from = opts.song.from ?? 0;
    src.start(LEAD_IN, from, Math.max(0, Math.min(opts.song.buf.duration - from, score.song.seconds)));
  }
  const graph = new AudioGraph(off, dest, style, score.bpm, { levels: opts.levels, raw: opts.dry });
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
