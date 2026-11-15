'use client';

import { useEffect, useState } from 'react';
import { compose } from '@/engine/composer';
import { STYLES } from '@/engine/styles';
import { INSTRUMENTS, type Bus, type Inst, type PieceLength } from '@/engine/types';
import { encodeMp3, saveBlob } from '@/engine/audio/encode';
import { AudioGraph, BUS_TRIM, RECORDINGS, TUNE, prepareSamples } from '@/engine/audio/graph';
import { BUSES } from '@/engine/types';
import { GAIN, TARGET } from '@/engine/audio/levels';
import { renderScore } from '@/engine/audio/render';

const db = (x: number) => (x > 0 ? 20 * Math.log10(x) : -200);

/** in-place radix-2 FFT */
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
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(ang * k);
        const wi = Math.sin(ang * k);
        const ar = re[i + k + len / 2] * wr - im[i + k + len / 2] * wi;
        const ai = re[i + k + len / 2] * wi + im[i + k + len / 2] * wr;
        re[i + k + len / 2] = re[i + k] - ar;
        im[i + k + len / 2] = im[i + k] - ai;
        re[i + k] += ar;
        im[i + k] += ai;
      }
    }
  }
}

const BANDS: [string, number, number][] = [['sub<60', 20, 60], ['low60-150', 60, 150], ['mud150-400', 150, 400], ['mid400-2k', 400, 2000], ['pres2-6k', 2000, 6000], ['air6k+', 6000, 20000]];

/** share of the energy in each band, in dB below the total — where the mix sits */
function bands(l: Float32Array, r: Float32Array, sr: number, a = 0, b = l.length) {
  const N = 4096;
  const acc = new Float64Array(BANDS.length);
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  for (let s = a; s + N <= b; s += N) {
    for (let i = 0; i < N; i++) {
      re[i] = ((l[s + i] + r[s + i]) / 2) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
      im[i] = 0;
    }
    fft(re, im);
    for (let k = 1; k < N / 2; k++) {
      const hz = (k * sr) / N;
      const p = re[k] * re[k] + im[k] * im[k];
      const bi = BANDS.findIndex(([, lo, hi]) => hz >= lo && hz < hi);
      if (bi >= 0) acc[bi] += p;
    }
  }
  const tot = acc.reduce((x, y) => x + y, 0) || 1;
  return Object.fromEntries(BANDS.map(([name], i) => [name, +(10 * Math.log10(acc[i] / tot || 1e-12)).toFixed(1)]));
}

/** loudest window RMS + peak of a stereo buffer */
function loud(l: Float32Array, r: Float32Array, sr: number, winSec = 0.1) {
  const w = Math.floor(sr * winSec);
  let peak = 0;
  let best = 0;
  let acc = 0;
  for (let i = 0; i < l.length; i++) {
    const p = (l[i] * l[i] + r[i] * r[i]) / 2;
    acc += p;
    if (i >= w) acc -= (l[i - w] * l[i - w] + r[i - w] * r[i - w]) / 2;
    if (i >= w - 1 && acc > best) best = acc;
    const a = Math.max(Math.abs(l[i]), Math.abs(r[i]));
    if (a > peak) peak = a;
  }
  return { rms: Math.sqrt(Math.max(best, 0) / w), peak };
}

async function measure(inst: Inst, midi: number, v = 0.8, dur?: number, synth = false) {
  RECORDINGS.on = !synth;
  const sr = 44100;
  const long = ['riser', 'subDrop', 'vinyl', 'swell', 'braam'].includes(inst);
  const off = new OfflineAudioContext(2, Math.ceil(sr * Math.max(long ? 5 : 4, (dur ?? 0) + 1.5)), sr);
  await prepareSamples([{ i: inst, m: midi }]);
  const g = new AudioGraph(off, off.destination, STYLES.titan, 120, { raw: true });
  g.playEvent({ t: 0, d: dur ?? (long ? 2.5 : 1.2), i: inst, m: midi, v, b: 'melody', s: 0 }, 0.05, 1);
  const buf = await off.startRendering();
  RECORDINGS.on = true;
  const l = buf.getChannelData(0);
  const r = buf.getChannelData(1);
  let bad = 0;
  for (let i = 0; i < l.length; i++) if (!Number.isFinite(l[i]) || !Number.isFinite(r[i])) bad++;
  const tail = loud(l.subarray(l.length - 2205), r.subarray(r.length - 2205), sr, 0.04);
  const body = loud(l.subarray(Math.floor(sr * 0.35), Math.floor(sr * 1.25)), r.subarray(Math.floor(sr * 0.35), Math.floor(sr * 1.25)), sr, 0.5);
  return { ...loud(l, r, sr), bad, tail: tail.peak, body: body.rms };
}

async function calibrate() {
  const rows: Record<string, { rms: number; peak: number; gain: number; next: number; bad: number; tail: number }> = {};
  for (const inst of INSTRUMENTS) {
    const [target, midi] = TARGET[inst];
    const m = await measure(inst, midi);
    const rmsDb = db(m.rms);
    rows[inst] = {
      rms: +rmsDb.toFixed(1),
      peak: +db(m.peak).toFixed(1),
      gain: GAIN[inst],
      next: +(GAIN[inst] * Math.pow(10, (target - rmsDb) / 20)).toPrecision(3),
      bad: m.bad,
      tail: +db(m.tail).toFixed(0),
    };
  }
  return rows;
}

async function render(styleId: string, o: { length?: PieceLength; seed?: number; notes?: number[]; intensity?: number; levels?: Partial<Record<Bus, number>>; mp3?: boolean; raw?: boolean; dry?: boolean; tune?: Partial<typeof TUNE>; synth?: boolean; spectrum?: boolean; drop?: boolean } = {}) {
  const style = STYLES[styleId];
  RECORDINGS.on = !o.synth;
  const score = compose({ notes: o.notes ?? [62, 65, 69, 67, 64], styleId, seed: o.seed ?? 7, length: o.length ?? 'standard', intensity: o.intensity ?? 0.8, drop: o.drop });
  if (o.tune) Object.assign(TUNE, o.tune);
  const t0 = performance.now();
  const res = await renderScore(score, style, { levels: o.levels, noNormalize: o.raw || o.dry, dry: o.dry });
  const ms = performance.now() - t0;
  const spb = 60 / score.bpm;
  const sections = score.sections.map((s) => {
    const a = Math.floor(s.startBeat * spb * res.sampleRate);
    const b = Math.min(res.left.length, Math.floor((s.startBeat + s.beats) * spb * res.sampleRate));
    let sq = 0;
    let pk = 0;
    for (let i = a; i < b; i++) {
      sq += res.left[i] * res.left[i] + res.right[i] * res.right[i];
      pk = Math.max(pk, Math.abs(res.left[i]), Math.abs(res.right[i]));
    }
    return `${s.name}[e${s.energy}] ${db(Math.sqrt(sq / (2 * Math.max(1, b - a)))).toFixed(1)}dB pk ${db(pk).toFixed(1)}`;
  });
  let bad = 0;
  for (let i = 0; i < res.left.length; i++) if (!Number.isFinite(res.left[i])) bad++;
  const out: Record<string, unknown> = {
    title: score.title, seconds: +res.seconds.toFixed(1), renderMs: Math.round(ms), events: score.events.length,
    rawPeakDb: +db(res.rawPeak).toFixed(2), rmsDb: +db(res.rms).toFixed(2), bad, sections,
  };
  if (o.spectrum) {
    out.bands = bands(res.left, res.right, res.sampleRate);
    const top = score.sections.reduce((p, q) => (q.energy > p.energy ? q : p));
    out.climax = top.name;
    out.climaxBands = bands(res.left, res.right, res.sampleRate, Math.floor(top.startBeat * spb * res.sampleRate), Math.floor((top.startBeat + top.beats) * spb * res.sampleRate));
  }
  RECORDINGS.on = true;
  if (o.mp3) {
    const t1 = performance.now();
    const blob = await encodeMp3(res.left, res.right, res.sampleRate, 256);
    out.mp3Ms = Math.round(performance.now() - t1);
    out.mp3Bytes = blob.size;
    saveBlob(blob, `${styleId}${o.synth ? '-synth' : ''}.mp3`);
  }
  return out;
}

/** dry RMS of each bus on its own, per section — the mix balance at a glance */
async function buses(styleId: string, o: { length?: PieceLength; seed?: number; notes?: number[]; intensity?: number; synth?: boolean } = {}) {
  const table: Record<string, string[]> = {};
  for (const bus of BUSES) {
    const levels = Object.fromEntries(BUSES.map((b) => [b, b === bus ? 1 : 0]));
    const r = await render(styleId, { ...o, levels, dry: true });
    table[bus] = (r.sections as string[]).map((s) => s.replace(/[e[d.]+]/, ''));
  }
  return table;
}

/** Engine test bench — not part of the product UI. */
export default function LabClient() {
  const [log, setLog] = useState('idle');
  useEffect(() => {
    (window as unknown as { __lab: unknown }).__lab = { calibrate, render, measure, buses, TUNE, BUS_TRIM };
  }, []);
  return (
    <main style={{ padding: 32, fontFamily: 'monospace', color: '#ddd', background: '#111', minHeight: '100vh' }}>
      <h1>Epyc SG lab</h1>
      <button
        id="mp3-probe"
        onClick={async () => {
          setLog('rendering…');
          const sr = 44100;
          const off = new OfflineAudioContext(2, sr * 2, sr);
          const osc = off.createOscillator();
          osc.frequency.value = 220;
          const g = off.createGain();
          g.gain.value = 0.4;
          osc.connect(g).connect(off.destination);
          osc.start();
          const buf = await off.startRendering();
          const blob = await encodeMp3(buf.getChannelData(0), buf.getChannelData(1), sr, 192);
          const head = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
          setLog(`mp3 ok bytes=${blob.size} head=${Array.from(head).map((b) => b.toString(16)).join(' ')}`);
          saveBlob(blob, 'probe.mp3');
        }}
      >
        mp3 probe
      </button>{' '}
      <button id="calibrate" onClick={async () => setLog(JSON.stringify(await calibrate(), null, 1))}>
        calibrate
      </button>{' '}
      <button id="render" onClick={async () => setLog(JSON.stringify(await render('titan', { mp3: true }), null, 1))}>
        render titan
      </button>
      <pre id="log">{log}</pre>
    </main>
  );
}
