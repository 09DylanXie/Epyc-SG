/**
 * The orchestra pit. One AudioGraph = one style's worth of instruments, a hall, a delay and a
 * mastering chain, built on any BaseAudioContext — the live one you hear and the offline one
 * that renders your download are the same code, so the file is what you heard.
 *
 * Strings, brass and flute are real recordings (VSCO 2: Community Edition, CC0 — see
 * public/samples/CREDITS.txt), pitched and looped here. Everything else is synthesized: sustained
 * voices from oscillators and PeriodicWaves, struck, plucked and hit things computed in dsp.ts.
 */
import { mtof } from '../theory';
import type { Bus, Inst, NoteEv, StylePreset } from '../types';
import {
  BAMBOO_SPECTRUM, FLUTE_SPECTRUM, ORGAN_SPECTRUM, PERC, pianoSpectrum, renderBell, renderImpulse, renderPerc,
  renderPluck, vowelSpectrum, type BellKind, type Chans, type PluckKind, type Vowel,
} from './dsp';
import { GAIN, SYNTH_GAIN } from './levels';
import SAMPLE_MAP from './sampleMap.json';
import type { SampleDone, SampleJob } from './samples.worker';

const BUF_SR = 44100;
const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x);

// ───────────────────────────── shared sample cache ─────────────────────────────
// AudioBuffers are not tied to a context, so the live graph and the export share these.

const bufCache = new Map<string, AudioBuffer>();
const rateCache = new Map<string, number>();
const irCache = new Map<string, AudioBuffer>();
const curveCache = new Map<number, Float32Array<ArrayBuffer>>();

function toBuffer(chs: Chans, sr: number): AudioBuffer {
  const b = new AudioBuffer({ length: chs[0].length, numberOfChannels: chs.length, sampleRate: sr });
  chs.forEach((c, i) => b.copyToChannel(c, i));
  return b;
}

export function percBuffer(name: string): AudioBuffer {
  const key = 'p:' + name;
  let b = bufCache.get(key);
  if (!b) {
    b = toBuffer(renderPerc(name, BUF_SR), BUF_SR);
    bufCache.set(key, b);
  }
  return b;
}

function pluckBuffer(kind: PluckKind, midi: number): { buf: AudioBuffer; rate: number } {
  const m = clamp(Math.round(midi), 24, 108);
  const key = `k:${kind}:${m}`;
  let b = bufCache.get(key);
  if (!b) {
    const { chs, rate } = renderPluck(kind, m, BUF_SR);
    b = toBuffer(chs, BUF_SR);
    bufCache.set(key, b);
    rateCache.set(key, rate);
  }
  return { buf: b, rate: rateCache.get(key)! };
}

function bellBuffer(kind: BellKind, midi: number): AudioBuffer {
  const m = clamp(Math.round(midi), 33, 108);
  const key = `b:${kind}:${m}`;
  let b = bufCache.get(key);
  if (!b) {
    b = toBuffer(renderBell(kind, m, BUF_SR), BUF_SR);
    bufCache.set(key, b);
  }
  return b;
}

function keepImpulse(key: string, b: AudioBuffer) {
  irCache.set(key, b);
  if (irCache.size > 8) irCache.delete(irCache.keys().next().value!);
}

function irBuffer(sr: number, size: number, damp: number): AudioBuffer {
  const key = `${sr}:${size}:${damp}`;
  let b = irCache.get(key);
  if (!b) {
    b = toBuffer(renderImpulse(sr, size, damp), sr);
    keepImpulse(key, b);
  }
  return b;
}

// ───────────────────────────── recorded notes ─────────────────────────────
// Keys look like s:<set>:<root>. Each file is one note, trimmed and levelled when the set was built
// (scripts/build-samples.mjs); the manifest says what pitch it really plays and how much gain it still needs.

type SampleRow = [root: number, cents: number, gain: number];
const SETS = (SAMPLE_MAP as unknown as { sets: Record<string, SampleRow[]> }).sets;
/** where the sound starts in each decoded file (MP3 decoders add a little silence in front) */
const onsetCache = new Map<string, number>();
const failed = new Set<string>();
let decoder: BaseAudioContext | null = null;

async function loadSample(key: string): Promise<void> {
  if (bufCache.has(key) || failed.has(key)) return;
  const [, set, root] = key.split(':');
  try {
    if (typeof window === 'undefined') throw new Error('no audio here');
    decoder ??= new OfflineAudioContext(2, 1, BUF_SR);
    const res = await fetch(`/samples/${set}/${root}.mp3`);
    if (!res.ok) throw new Error(String(res.status));
    const b = await decoder.decodeAudioData(await res.arrayBuffer());
    const d = b.getChannelData(0);
    let peak = 0;
    for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
    let on = 0;
    while (on < d.length && Math.abs(d[on]) < peak * 0.02) on++;
    onsetCache.set(key, Math.max(0, on / b.sampleRate - 0.004));
    bufCache.set(key, b);
  } catch {
    // offline or blocked: this note falls back to its synthesized voice
    failed.add(key);
  }
}

// ───────────────────────────── off-thread rendering ─────────────────────────────
// Samples are synthesized in a small pool of workers and handed back as raw channels. If workers
// are unavailable everything still works: the same code simply runs here, in slices.

interface Task {
  key: string;
  resolve: () => void;
}
let pool: Worker[] | null | undefined;
const idle: Worker[] = [];
const queue: Task[] = [];
const running = new Map<Worker, Task>();
const inflight = new Map<string, Promise<void>>();

const have = (key: string) => (key.charCodeAt(0) === 105 /* i */ ? irCache.has(key.slice(2)) : bufCache.has(key));

/** render one cache key right here (fallback, and for notes played before their sample is ready) */
function renderHere(key: string) {
  const part = key.split(':');
  if (part[0] === 'p') percBuffer(key.slice(2));
  else if (part[0] === 'k') pluckBuffer(part[1] as PluckKind, +part[2]);
  else if (part[0] === 'b') bellBuffer(part[1] as BellKind, +part[2]);
  else irBuffer(+part[1], +part[2], +part[3]);
}

function store(d: SampleDone) {
  if (have(d.key)) return;
  if (d.error || !d.chs.length) return renderHere(d.key);
  if (d.key.charCodeAt(0) === 105) return keepImpulse(d.key.slice(2), toBuffer(d.chs, +d.key.split(':')[1]));
  bufCache.set(d.key, toBuffer(d.chs, BUF_SR));
  if (d.rate !== undefined) rateCache.set(d.key, d.rate);
}

function workers(): Worker[] | null {
  if (pool !== undefined) return pool;
  pool = null;
  if (typeof Worker === 'undefined' || typeof window === 'undefined') return pool;
  try {
    const n = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 2));
    const made: Worker[] = [];
    for (let i = 0; i < n; i++) {
      const w = new Worker(new URL('./samples.worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<SampleDone>) => {
        const task = running.get(w);
        running.delete(w);
        try {
          store(e.data);
        } finally {
          task?.resolve();
          idle.push(w);
          pump();
        }
      };
      w.onerror = () => abandon();
      made.push(w);
    }
    pool = made;
    idle.push(...made);
  } catch {
    pool = null;
  }
  return pool;
}

/** the workers failed: finish everything outstanding on this thread and stop using them */
function abandon() {
  const left = [...running.values(), ...queue];
  pool?.forEach((w) => w.terminate());
  pool = null;
  idle.length = 0;
  queue.length = 0;
  running.clear();
  for (const t of left) {
    try {
      if (!have(t.key)) renderHere(t.key);
    } catch {
      /* the note will simply be rendered on demand */
    }
    t.resolve();
  }
}

function pump() {
  while (idle.length && queue.length) {
    const w = idle.pop()!;
    const task = queue.shift()!;
    if (have(task.key)) {
      idle.push(w);
      task.resolve();
      continue;
    }
    running.set(w, task);
    const job: SampleJob = { key: task.key, sr: BUF_SR };
    w.postMessage(job);
  }
}

/** make sure one cache key exists; resolves when it does. `urgent` jumps the queue. */
function want(key: string, urgent = false): Promise<void> {
  if (have(key)) return Promise.resolve();
  let p = inflight.get(key);
  if (key.charCodeAt(0) === 115 /* s */) {
    if (!p) {
      p = loadSample(key).then(() => {
        inflight.delete(key);
      });
      inflight.set(key, p);
    }
    return p;
  }
  if (p) {
    // already asked for at leisure, now needed at once
    const at = urgent ? queue.findIndex((t) => t.key === key) : -1;
    if (at > 0) queue.unshift(queue.splice(at, 1)[0]);
    return p;
  }
  if (!workers()) {
    renderHere(key);
    return Promise.resolve();
  }
  p = new Promise<void>((resolve) => {
    const task = { key, resolve };
    if (urgent) queue.unshift(task);
    else queue.push(task);
  }).then(() => {
    inflight.delete(key);
  });
  inflight.set(key, p);
  pump();
  return p;
}

/** build a world's concert hall ahead of time, for the speakers' usual rates and for export */
export function prepareHall(style: StylePreset, rates: number[] = [48000, 44100]): Promise<void> {
  if (!workers()) return Promise.resolve();
  return Promise.all(rates.map((sr) => want(`i:${sr}:${style.reverb.size}:${style.reverb.damp}`))).then(() => undefined);
}

function tanhCurve(k: number): Float32Array<ArrayBuffer> {
  let c = curveCache.get(k);
  if (!c) {
    c = new Float32Array(2049);
    for (let i = 0; i < c.length; i++) c[i] = Math.tanh(k * ((i / (c.length - 1)) * 2 - 1));
    curveCache.set(k, c);
  }
  return c;
}

/** master soft clipper: transparent below ~−6 dBFS, rounds everything above into a ceiling just under 1.0 */
const CLIP_RANGE = 4;
function softClipCurve(): Float32Array<ArrayBuffer> {
  let c = curveCache.get(-1);
  if (!c) {
    c = new Float32Array(16385);
    for (let i = 0; i < c.length; i++) {
      const x = ((i / (c.length - 1)) * 2 - 1) * CLIP_RANGE;
      c[i] = x / Math.pow(1 + Math.pow(Math.abs(x), 2.5), 0.4);
    }
    curveCache.set(-1, c);
  }
  return c;
}

// ───────────────────────────── voices ─────────────────────────────

/** one note, resolved to context time */
interface N {
  t: number;
  /** seconds */
  d: number;
  m: number;
  f: number;
  v: number;
  /** articulation: 1 swell, 2 sforzando, 3 tremolo, 4 soft */
  a: number;
  from?: number;
  /** deterministic 0..1, for humanising */
  seed: number;
  /** the voice's output */
  vca: GainNode;
}

/** builds the nodes for a note and returns the context time at which it has fully died away */
type VoiceFn = (g: AudioGraph, n: N) => number;

export interface Voice {
  vca: GainNode;
  pan: StereoPannerNode | null;
  dest: AudioNode;
  srcs: AudioScheduledSourceNode[];
  mods: [AudioNode, AudioNode | AudioParam][];
  rel: number | undefined;
  live: boolean;
  done: boolean;
}

type WaveSrc = OscillatorType | ((g: AudioGraph, n: N) => PeriodicWave);
type W = [wave: WaveSrc, cents: number, gain: number, octave?: number];

/** amplitude envelope with articulations; returns when the voice is silent */
function shape(p: AudioParam, n: N, pk: number, a: number, r: number, sus = 1, dec = 0.3): number {
  const t = n.t;
  let att = a;
  if (n.a === 4) att = a * 1.8;
  if (n.a === 2) att = Math.min(a, 0.03);
  const hold = Math.max(n.d, att + 0.01);
  p.setValueAtTime(0, t);
  if (n.a === 1 && n.d > 0.5) {
    p.linearRampToValueAtTime(pk * 0.3, t + Math.min(att, n.d * 0.25));
    p.linearRampToValueAtTime(pk * 1.12, t + hold * 0.92);
  } else if (n.a === 2) {
    p.linearRampToValueAtTime(pk * 1.3, t + att);
    p.setTargetAtTime(pk * 0.72 * sus, t + att, 0.09);
  } else {
    p.linearRampToValueAtTime(pk, t + att);
    if (sus < 1) p.setTargetAtTime(pk * sus, t + att, dec / 3);
  }
  p.setTargetAtTime(0, t + hold, r / 4);
  return t + hold + r * 2;
}

function addOscs(g: AudioGraph, n: N, waves: W[], head: AudioNode, glide?: number, scoop?: number): OscillatorNode[] {
  const drift = (n.seed - 0.5) * 5;
  const out: OscillatorNode[] = [];
  for (const [w, cents, gain, oct] of waves) {
    const mult = oct ? Math.pow(2, oct) : 1;
    const o = g.osc(typeof w === 'string' ? w : w(g, n), n.f * mult, n.t, cents + drift);
    if (n.from !== undefined && glide) {
      o.frequency.setValueAtTime(mtof(n.from) * mult, n.t);
      o.frequency.exponentialRampToValueAtTime(n.f * mult, n.t + glide);
    }
    if (scoop) {
      o.detune.setValueAtTime(cents + drift - scoop, n.t);
      o.detune.linearRampToValueAtTime(cents + drift, n.t + 0.07);
    }
    if (gain === 1) o.connect(head);
    else {
      const og = g.gn(gain);
      o.connect(og);
      og.connect(head);
    }
    out.push(o);
  }
  return out;
}

interface SusP {
  w: W[];
  /** lowpass cutoff as a multiple of the note's frequency (omit = unfiltered) */
  cut?: number;
  cutMin?: number;
  cutMax?: number;
  q?: number;
  /** brass: the filter opens with the breath, starting from f × fenv */
  fenv?: number;
  a: number;
  r: number;
  s?: number;
  dec?: number;
  vib?: [cents: number, delay: number, lfo: number];
  glide?: number;
  trem?: boolean;
  /** onset transient: [buffer, level] */
  on?: [string, number];
  /** sustained breath noise */
  air?: number;
  /** cents below pitch at the onset */
  scoop?: number;
}

/** bowed, blown, sung and held things */
const sus = (p: SusP): VoiceFn => (g, n) => {
  const pk = Math.pow(n.v, 1.5);
  const amp = g.gn(0);
  let head: AudioNode = amp;
  let lp: BiquadFilterNode | null = null;
  if (p.cut) {
    lp = g.bq('lowpass', 1000, p.q ?? 0.6);
    lp.connect(amp);
    head = lp;
  }
  const oscs = addOscs(g, n, p.w, head, p.glide, p.scoop);
  const end = shape(amp.gain, n, pk, p.a, p.r, p.s ?? 1, p.dec ?? 0.3);
  const hold = Math.max(n.d, 0.02);
  if (lp) {
    const c = clamp(n.f * p.cut! * (0.5 + 0.7 * n.v) * (n.a === 4 ? 0.62 : 1), p.cutMin ?? 200, p.cutMax ?? 8000);
    const fq = lp.frequency;
    if (n.a === 1 && n.d > 0.5) {
      fq.setValueAtTime(c * 0.5, n.t);
      fq.linearRampToValueAtTime(Math.min(c * 1.3, 12000), n.t + hold * 0.92);
    } else if (n.a === 2) {
      fq.setValueAtTime(Math.min(c * 1.9, 12000), n.t);
      fq.setTargetAtTime(c, n.t + 0.04, 0.12);
    } else if (p.fenv) {
      fq.setValueAtTime(Math.max(n.f * p.fenv, 150), n.t);
      fq.linearRampToValueAtTime(c, n.t + p.a * 1.6);
    } else fq.setValueAtTime(c, n.t);
    if (p.fenv) fq.setTargetAtTime(Math.max(n.f * p.fenv, 150), n.t + Math.max(hold, p.a * 1.6 + 0.01), p.r / 3);
  }
  if (p.vib && n.d > p.vib[1] + 0.12) {
    const [cents, delay, k] = p.vib;
    const vg = g.gn(0);
    vg.gain.setValueAtTime(0, n.t + delay);
    vg.gain.linearRampToValueAtTime(cents * (0.7 + 0.5 * n.v), n.t + delay + 0.3);
    g.mod(g.lfo[k], vg);
    for (const o of oscs) vg.connect(o.detune);
  }
  if (p.air) {
    const noise = g.buf(percBuffer('noise'), n.t, 1, n.seed * 1.5, true);
    const bp = g.bq('bandpass', clamp(n.f * 2.2, 400, 6000), 1.3);
    const ag = g.gn(p.air);
    noise.connect(bp);
    bp.connect(ag);
    ag.connect(amp);
  }
  if (p.on) {
    const s = g.buf(percBuffer(p.on[0]), n.t);
    const og = g.gn(p.on[1] * pk);
    s.connect(og);
    og.connect(n.vca);
  }
  if (p.trem || n.a === 3) {
    const tg = g.gn(0.64);
    g.mod(g.trem[Math.floor(n.seed * 3) % 3], tg.gain);
    amp.connect(tg);
    tg.connect(n.vca);
  } else amp.connect(n.vca);
  return end;
};

interface DecP {
  w: W[];
  /** filter sweep, as multiples of the note's frequency */
  cutHi?: number;
  cutLo?: number;
  ftau?: number;
  q?: number;
  cutMax?: number;
  atk?: number;
  /** amplitude decay time-constant */
  tau: number;
  /** level the note settles to while it is held (0 = always dies away) */
  sus?: number;
  /** slow second-stage decay, as a function of pitch */
  tau2?: (m: number) => number;
  /** extra ring after the written note ends (a half-pedal) */
  ped?: number;
  min?: number;
  r?: number;
  on?: [string, number];
}

/** struck and plucked things made from oscillators */
const dec = (p: DecP): VoiceFn => (g, n) => {
  const pk = Math.pow(n.v, 1.4);
  const amp = g.gn(0);
  const atk = p.atk ?? 0.003;
  let head: AudioNode = amp;
  if (p.cutHi) {
    const lp = g.bq('lowpass', 1000, p.q ?? 0.7);
    const hi = clamp(n.f * p.cutHi * (0.45 + 0.75 * n.v), 200, p.cutMax ?? 10000);
    const lo = clamp(n.f * (p.cutLo ?? 1.5), 120, hi);
    lp.frequency.setValueAtTime(hi, n.t);
    lp.frequency.setTargetAtTime(lo, n.t + atk, p.ftau ?? 0.08);
    lp.connect(amp);
    head = lp;
  }
  addOscs(g, n, p.w, head);
  const s = p.sus ?? 0;
  const written = Math.max(n.d + (p.ped ?? 0), p.min ?? 0.05);
  const hold = s > 0 ? written : Math.min(written, p.tau * 7 + atk);
  const r = p.r ?? 0.1;
  amp.gain.setValueAtTime(0, n.t);
  amp.gain.linearRampToValueAtTime(pk, n.t + atk);
  amp.gain.setTargetAtTime(pk * s, n.t + atk, p.tau);
  if (p.tau2 && hold > atk + p.tau * 2.5) amp.gain.setTargetAtTime(0, n.t + atk + p.tau * 2.5, p.tau2(n.m));
  amp.gain.setTargetAtTime(0, n.t + hold, r / 4);
  if (p.on) {
    const src = g.buf(percBuffer(p.on[0]), n.t);
    const og = g.gn(p.on[1] * pk);
    src.connect(og);
    og.connect(n.vca);
  }
  amp.connect(n.vca);
  return n.t + hold + r * 2;
};

/** a rendered hit. tune = the pitch (Hz) the buffer was rendered at, for pitched drums */
const hit = (name: string, o: { tune?: number; ens?: boolean; curve?: number } = {}): VoiceFn => (g, n) => {
  const b = percBuffer(name);
  const rate = (o.tune ? n.f / o.tune : 1) * (1 + (n.seed - 0.5) * 0.03);
  n.vca.gain.value = Math.pow(n.v, o.curve ?? 1.6);
  g.buf(b, n.t, rate).connect(n.vca);
  if (o.ens && n.v > 0.72) {
    // a second player, a hair late and a little lower — one drum becomes a line of them
    const og = g.gn(0.55);
    g.buf(b, n.t + 0.009 + n.seed * 0.009, rate * 0.944).connect(og);
    og.connect(n.vca);
  }
  return n.t + b.duration / rate + 0.06;
};

const plucked = (kind: PluckKind, bend = false): VoiceFn => (g, n) => {
  const { buf, rate } = pluckBuffer(kind, n.m);
  const src = g.buf(buf, n.t, rate);
  n.vca.gain.value = Math.pow(n.v, 1.3);
  if (n.from !== undefined) {
    src.playbackRate.setValueAtTime(rate * Math.pow(2, (n.from - n.m) / 12), n.t);
    src.playbackRate.exponentialRampToValueAtTime(rate, n.t + 0.11);
  } else if (bend && n.d > 0.4 && n.seed > 0.4) {
    // the left hand presses the string behind the bridge
    const vg = g.gn(0);
    vg.gain.setValueAtTime(0, n.t + 0.12);
    vg.gain.linearRampToValueAtTime(16, n.t + 0.4);
    g.mod(g.lfo[0], vg);
    vg.connect(src.detune);
  }
  src.connect(n.vca);
  return n.t + buf.duration / rate + 0.06;
};

const struck = (kind: BellKind): VoiceFn => (g, n) => {
  const buf = bellBuffer(kind, n.m);
  n.vca.gain.value = Math.pow(n.v, 1.3);
  g.buf(buf, n.t).connect(n.vca);
  return n.t + buf.duration + 0.06;
};

// ── recorded instruments ──

/** [lowest midi, highest midi, set, darker (lowpass ceiling Hz)] */
type Zone = readonly [lo: number, hi: number, set: string, dark?: number];
interface SampledP {
  inst: Inst;
  zones: readonly Zone[];
  /** what plays a tremolo-marked note */
  trem?: readonly Zone[];
  a: number;
  r: number;
  /** let the recording decay by itself (spiccato) */
  short?: boolean;
  glide?: number;
  /** the synthesized voice, for notes played before their recording has arrived */
  fb: VoiceFn;
}

interface Picked {
  key: string;
  root: number;
  cents: number;
  gain: number;
  dark?: number;
}

function pickSample(zones: readonly Zone[], m: number): Picked | null {
  const z = zones.find(([lo, hi]) => m >= lo && m <= hi) ?? zones[m < zones[0][0] ? 0 : zones.length - 1];
  const rows = SETS[z[2]];
  if (!rows?.length) return null;
  let best = rows[0];
  for (const r of rows) {
    const d = Math.abs(r[0] - m);
    const bd = Math.abs(best[0] - m);
    // on a tie, take the recording above: shifting down sounds more natural than up
    if (d < bd || (d === bd && r[0] > best[0])) best = r;
  }
  return { key: `s:${z[2]}:${best[0]}`, root: best[0], cents: best[1], gain: best[2], dark: z[3] };
}

const EQ_UP = new Float32Array(33).map((_, i) => Math.sin((Math.PI / 2) * (i / 32)));
const EQ_DOWN = new Float32Array(33).map((_, i) => Math.cos((Math.PI / 2) * (i / 32)));
/** where the held part of every recording begins (seconds into the file) */
const LOOP_FROM = 1;
/** crossfade between passes over the held part */
const XFADE = 0.45;
/** the fade baked into the end of every file */
const BAKED_FADE = 0.3;

/** the lab can switch the recordings off, to compare against the synthesized voices */
export const RECORDINGS = { on: true };
/** how many notes fell back to the synthesized voice because their recording had not arrived (diagnostics) */
export const STAND_INS = { n: 0, last: '' };

const sampled = (p: SampledP): VoiceFn => (g, n) => {
  // the stand-in is calibrated to its own level, not the recording's
  const standIn = () => {
    n.vca.gain.value = (SYNTH_GAIN[p.inst] ?? GAIN[p.inst]) / GAIN[p.inst];
    return p.fb(g, n);
  };
  if (!RECORDINGS.on) return standIn();
  const pick = pickSample(n.a === 3 && p.trem ? p.trem : p.zones, n.m);
  const buf = pick && bufCache.get(pick.key);
  if (!pick || !buf) {
    if (pick && !failed.has(pick.key)) void want(pick.key, true);
    STAND_INS.n++;
    STAND_INS.last = `${p.inst}@${n.m}`;
    return standIn();
  }
  const on = onsetCache.get(pick.key) ?? 0;
  const rate = Math.pow(2, (n.m - pick.root) / 12 - pick.cents / 1200);
  const pk = Math.pow(n.v, 1.5) * pick.gain;
  const amp = g.gn(0);
  // softer playing is darker, as it is with a real bow or breath
  const soft = n.a === 4 ? 0.6 : 1;
  const top = clamp((2200 + 13000 * n.v * n.v) * soft, 1400, pick.dark ?? 16000);
  const tone = g.bq('lowpass', top, 0.5);
  tone.connect(amp);

  let end: number;
  if (p.short) {
    const src = g.buf(buf, n.t, rate, on);
    src.connect(tone);
    const ring = (buf.duration - on) / rate;
    const hold = Math.min(Math.max(n.d, 0.1), ring);
    amp.gain.setValueAtTime(0, n.t);
    amp.gain.linearRampToValueAtTime(pk, n.t + 0.002);
    amp.gain.setTargetAtTime(0, n.t + hold, p.r / 4);
    end = Math.min(n.t + ring, n.t + hold + p.r * 2);
  } else {
    end = shape(amp.gain, n, pk, p.a, p.r);
    // pass over the held part of the note again and again, crossfading, for as long as it is held
    let t = n.t;
    let off = on;
    for (let pass = 0; pass < 16; pass++) {
      const src = g.buf(buf, t, rate, off);
      const sg = g.gn(pass ? 0 : 1);
      src.connect(sg);
      sg.connect(tone);
      if (pass) sg.gain.setValueCurveAtTime(EQ_UP, t, XFADE);
      else if (n.from !== undefined && p.glide) {
        src.playbackRate.setValueAtTime(rate * Math.pow(2, (n.from - n.m) / 12), t);
        src.playbackRate.exponentialRampToValueAtTime(rate, t + p.glide);
      }
      const runsOut = t + (buf.duration - off) / rate;
      if (runsOut >= end) break;
      const next = runsOut - BAKED_FADE / rate - XFADE;
      if (next <= t + XFADE) break;
      sg.gain.setValueCurveAtTime(EQ_DOWN, next, XFADE);
      t = next;
      off = on + LOOP_FROM;
    }
  }
  amp.connect(n.vca);
  return end;
};

/**
 * A section of singers rather than one waveform: every note is several voices, each a little off
 * pitch, starting a little late, wobbling at its own rate and standing in its own place on the
 * risers, with breath in the sound.
 */
const choir = (p: { vowels: readonly Vowel[]; n: number; spread: number; a: number; r: number; vib: number; air: number; bright?: number; width?: number }): VoiceFn => (g, n) => {
  const pk = (Math.pow(n.v, 1.5) * 1.6) / Math.sqrt(p.n);
  const amp = g.gn(0);
  const end = shape(amp.gain, n, pk, p.a, p.r);
  let rs = Math.floor(n.seed * 233280);
  const rnd = () => (rs = (rs * 9301 + 49297) % 233280) / 233280;
  const width = p.width ?? 0.75;
  for (let k = 0; k < p.n; k++) {
    const late = rnd() * 0.04;
    const wave = vowel(p.vowels[k % p.vowels.length], k % 3, p.bright ?? 0) as (g: AudioGraph, n: N) => PeriodicWave;
    const o = g.osc(wave(g, n), n.f, n.t + late, (rnd() - 0.5) * 2 * p.spread);
    // nobody holds a pitch dead still: a slow drift and their own vibrato
    const wob = g.gn(0);
    wob.gain.setValueAtTime(0, n.t);
    wob.gain.linearRampToValueAtTime(p.vib * (0.55 + 0.9 * rnd()), n.t + 0.35 + rnd() * 0.5);
    g.mod(g.lfo[k % g.lfo.length], wob);
    wob.connect(o.detune);
    const og = g.gn(0);
    og.gain.setValueAtTime(0, n.t + late);
    og.gain.linearRampToValueAtTime(1, n.t + late + 0.02);
    const pan = g.ctx.createStereoPanner();
    pan.pan.value = p.n > 1 ? ((k / (p.n - 1)) * 2 - 1) * width : 0;
    o.connect(og);
    og.connect(pan);
    pan.connect(amp);
  }
  if (p.air) {
    const noise = g.buf(percBuffer('noise'), n.t, 1, n.seed * 1.5, true);
    const bp = g.bq('bandpass', clamp(n.f * 3, 700, 3200), 0.9);
    const ag = g.gn(p.air);
    noise.connect(bp);
    bp.connect(ag);
    ag.connect(amp);
  }
  amp.connect(n.vca);
  return end;
};

const vowel = (v: Vowel, variant: number, bright = 0): WaveSrc => (g, n) => {
  const anchor = Math.round(n.m / 3) * 3;
  return g.pw(`v:${v}:${anchor}:${variant}:${bright}`, () => vowelSpectrum(mtof(anchor), v, bright), variant);
};
const pianoWave = (soft: boolean, variant: number): WaveSrc => (g, n) => {
  const anchor = Math.round(n.m / 4) * 4;
  return g.pw(`pn:${soft ? 1 : 0}:${anchor}:${variant}`, () => pianoSpectrum(anchor, soft), variant);
};
const fixedWave = (key: string, amps: number[]): WaveSrc => (g) => g.pw(key, () => amps, 0);

const keys = (soft: boolean): VoiceFn =>
  dec({
    w: [[pianoWave(soft, 0), -1.6, 1], [pianoWave(soft, 1), 1.9, 0.9]],
    cutHi: soft ? 5 : 12, cutLo: soft ? 1.8 : 3, ftau: soft ? 0.22 : 0.3, q: 0.5, cutMax: soft ? 3200 : 9000,
    atk: soft ? 0.006 : 0.003, tau: soft ? 0.16 : 0.12, sus: soft ? 0.5 : 0.42,
    tau2: (m) => 2.7 * Math.pow(2, -(m - 48) / 26),
    ped: 0.3, min: 0.4, r: soft ? 0.4 : 0.3,
    on: ['thump', soft ? 0.24 : 0.1],
  });

const b808: VoiceFn = (g, n) => {
  const pk = Math.pow(n.v, 1.3);
  const o = g.osc('sine', n.f, n.t);
  if (n.from !== undefined) {
    o.frequency.setValueAtTime(mtof(n.from), n.t);
    o.frequency.exponentialRampToValueAtTime(n.f, n.t + 0.09);
  } else {
    o.frequency.setValueAtTime(n.f * 2.6, n.t);
    o.frequency.setTargetAtTime(n.f, n.t, 0.017);
  }
  const sh = g.shaper(2.2);
  const amp = g.gn(0);
  o.connect(sh);
  sh.connect(amp);
  amp.connect(n.vca);
  amp.gain.setValueAtTime(0, n.t);
  amp.gain.linearRampToValueAtTime(pk, n.t + 0.003);
  amp.gain.setTargetAtTime(0, n.t + 0.003, 1.2);
  const hold = Math.max(n.d, 0.12);
  amp.gain.setTargetAtTime(0, n.t + hold, 0.03);
  return n.t + hold + 0.25;
};

const braam: VoiceFn = (g, n) => {
  const pk = Math.pow(n.v, 1.3);
  const pre = g.gn(0.55);
  const sh = g.shaper(3);
  const lp = g.bq('lowpass', 300, 2.2);
  const amp = g.gn(0);
  addOscs(g, n, [['sawtooth', -14, 1], ['sawtooth', 13, 1], ['sawtooth', 0, 0.9, -1], ['square', 6, 0.3, 1]], pre);
  pre.connect(sh);
  sh.connect(lp);
  lp.connect(amp);
  amp.connect(n.vca);
  const top = clamp(n.f * 22 * (0.55 + 0.6 * n.v), 500, 2800);
  lp.frequency.setValueAtTime(240, n.t);
  lp.frequency.exponentialRampToValueAtTime(top, n.t + 0.11);
  lp.frequency.setTargetAtTime(Math.max(260, n.f * 5), n.t + 0.11, Math.max(0.25, n.d * 0.45));
  const hold = Math.max(n.d, 0.3);
  amp.gain.setValueAtTime(0, n.t);
  amp.gain.linearRampToValueAtTime(pk, n.t + 0.03);
  amp.gain.setTargetAtTime(pk * 0.75, n.t + 0.03, 0.4);
  amp.gain.setTargetAtTime(0, n.t + hold, 0.13);
  return n.t + hold + 0.9;
};

/**
 * A wall of high-gain guitars: saws with a fifth stacked on top (so every note is a power chord),
 * driven hard, then through a speaker-cabinet curve. Short notes are palm-muted chugs.
 */
const guitar: VoiceFn = (g, n) => {
  const pk = Math.pow(n.v, 1.1);
  const chug = n.d < 0.3;
  const tone = g.bq('lowpass', 2000, 0.7);
  const pre = g.gn(2.4);
  const sh = g.shaper(7);
  const hp = g.bq('highpass', 90, 0.7);
  const mid = g.bq('peaking', 950, 0.8);
  mid.gain.value = 5;
  const cab = g.bq('lowpass', 3800, 0.9);
  const amp = g.gn(0);
  const low = n.m < 52;
  const oscs = addOscs(g, n, low ? [[SAW, -7, 1], [SAW, 6, 1], [SAW, 702, 0.7], [SQ, 0, 0.45, 1]] : [[SAW, -6, 1], [SAW, 7, 0.9], [SQ, 0, 0.3, -1]], tone);
  tone.connect(pre);
  pre.connect(sh);
  sh.connect(hp);
  hp.connect(mid);
  mid.connect(cab);
  cab.connect(amp);
  amp.connect(n.vca);
  const open = clamp(n.f * 14, 1400, 5200);
  const hold = Math.max(n.d, 0.07);
  amp.gain.setValueAtTime(0, n.t);
  amp.gain.linearRampToValueAtTime(pk, n.t + 0.004);
  if (chug) {
    tone.frequency.setValueAtTime(open, n.t);
    tone.frequency.setTargetAtTime(clamp(n.f * 3, 260, 900), n.t + 0.004, 0.035);
    amp.gain.setTargetAtTime(pk * 0.2, n.t + 0.004, 0.09);
  } else {
    tone.frequency.setValueAtTime(open, n.t);
    amp.gain.setTargetAtTime(pk * 0.72, n.t + 0.004, 0.9);
    if (!low && n.d > 0.45) {
      const vg = g.gn(0);
      vg.gain.setValueAtTime(0, n.t + 0.2);
      vg.gain.linearRampToValueAtTime(22, n.t + 0.5);
      g.mod(g.lfo[1], vg);
      for (const o of oscs) vg.connect(o.detune);
    }
  }
  amp.gain.setTargetAtTime(0, n.t + hold, 0.018);
  return n.t + hold + 0.16;
};

/** the phonk cowbell: two squares a tritone-ish apart through a tight band, clipped. It carries the tune. */
const cowbell: VoiceFn = (g, n) => {
  const pk = Math.pow(n.v, 1.2);
  const pre = g.gn(1.3);
  const bp = g.bq('bandpass', clamp(n.f * 2.4, 700, 4200), 1.1);
  const sh = g.shaper(3);
  const amp = g.gn(0);
  addOscs(g, n, [[SQ, 0, 1], [SQ, 683, 0.8]], pre);
  pre.connect(bp);
  bp.connect(sh);
  sh.connect(amp);
  amp.connect(n.vca);
  const hold = clamp(n.d, 0.1, 0.42);
  amp.gain.setValueAtTime(0, n.t);
  amp.gain.linearRampToValueAtTime(pk, n.t + 0.0015);
  amp.gain.setTargetAtTime(pk * 0.3, n.t + 0.0015, 0.03);
  amp.gain.setTargetAtTime(0, n.t + hold, 0.045);
  return n.t + hold + 0.3;
};

const riser: VoiceFn = (g, n) => {
  const pk = Math.pow(n.v, 1.2);
  const d = Math.max(n.d, 0.3);
  const amp = g.gn(0);
  amp.gain.setValueAtTime(0.0008, n.t);
  amp.gain.exponentialRampToValueAtTime(pk, n.t + d);
  amp.gain.setTargetAtTime(0, n.t + d, 0.012);
  const noise = g.buf(percBuffer('noise'), n.t, 1, 0, true);
  const bp = g.bq('bandpass', 300, 1.1);
  bp.frequency.setValueAtTime(260, n.t);
  bp.frequency.exponentialRampToValueAtTime(7500, n.t + d);
  noise.connect(bp);
  bp.connect(amp);
  const lp = g.bq('lowpass', 300, 1);
  lp.frequency.setValueAtTime(300, n.t);
  lp.frequency.exponentialRampToValueAtTime(5200, n.t + d);
  const tg = g.gn(0.2);
  for (const cents of [-11, 10]) {
    const o = g.osc('sawtooth', n.f, n.t, cents);
    o.frequency.setValueAtTime(n.f, n.t);
    o.frequency.exponentialRampToValueAtTime(n.f * 2, n.t + d);
    o.connect(lp);
  }
  lp.connect(tg);
  tg.connect(amp);
  amp.connect(n.vca);
  return n.t + d + 0.15;
};

const subDrop: VoiceFn = (g, n) => {
  const pk = Math.pow(n.v, 1.2);
  const d = Math.max(n.d, 0.9);
  const o = g.osc('sine', 110, n.t);
  o.frequency.setValueAtTime(112, n.t);
  o.frequency.exponentialRampToValueAtTime(27, n.t + d);
  const amp = g.gn(0);
  amp.gain.setValueAtTime(0, n.t);
  amp.gain.linearRampToValueAtTime(pk, n.t + 0.008);
  amp.gain.setTargetAtTime(0, n.t + 0.06, d * 0.42);
  o.connect(amp);
  amp.connect(n.vca);
  return n.t + d * 2.4;
};

const swellV: VoiceFn = (g, n) => {
  const b = percBuffer('swell');
  const len = b.duration;
  n.vca.gain.value = Math.pow(n.v, 1.3);
  g.buf(b, n.t + Math.max(0, n.d - len), 1, Math.max(0, len - n.d)).connect(n.vca);
  return n.t + n.d + 0.1;
};

const vinylV: VoiceFn = (g, n) => {
  const src = g.buf(percBuffer('vinyl'), n.t, 1, 0, true);
  const e = g.gn(0);
  const d = Math.max(n.d, 2);
  e.gain.setValueAtTime(0, n.t);
  e.gain.linearRampToValueAtTime(n.v, n.t + 0.8);
  e.gain.setTargetAtTime(0, n.t + d - 0.8, 0.3);
  src.connect(e);
  e.connect(n.vca);
  return n.t + d + 0.8;
};

const ePiano: VoiceFn = (g, n) => {
  const pk = Math.pow(n.v, 1.4);
  const car = g.osc('sine', n.f, n.t);
  const mod = g.osc('sine', n.f, n.t);
  const mg = g.gn(0);
  mg.gain.setValueAtTime(n.f * (0.5 + 1.7 * n.v), n.t);
  mg.gain.setTargetAtTime(n.f * 0.22, n.t, 0.28);
  mod.connect(mg);
  mg.connect(car.frequency);
  const tine = g.osc('sine', n.f * 14, n.t);
  const tg = g.gn(0);
  tg.gain.setValueAtTime(n.f * 1.2 * n.v, n.t);
  tg.gain.setTargetAtTime(0, n.t, 0.05);
  tine.connect(tg);
  tg.connect(car.frequency);
  const amp = g.gn(0);
  const hold = Math.max(n.d + 0.12, 0.3);
  amp.gain.setValueAtTime(0, n.t);
  amp.gain.linearRampToValueAtTime(pk, n.t + 0.004);
  amp.gain.setTargetAtTime(0, n.t + 0.004, 1.5 * Math.pow(2, -(n.m - 60) / 30));
  amp.gain.setTargetAtTime(0, n.t + hold, 0.05);
  car.connect(amp);
  amp.connect(n.vca);
  return n.t + hold + 0.35;
};

// ───────────────────────────── the instrument table ─────────────────────────────

interface StripSpec {
  /** reverb send */
  rev: number;
  /** delay send (only in styles that have a delay) */
  del?: number;
  hp?: number;
  lp?: number;
  /** ensemble chorus amount */
  ch?: number;
}
interface Def {
  v: VoiceFn;
  s: StripSpec;
  /** live keys: release time when the key comes up. undefined = let it ring. */
  rel?: number;
}

const SAW = 'sawtooth';
const SQ = 'square';
const TRI = 'triangle';
const SIN = 'sine';
const organW = fixedWave('organ', ORGAN_SPECTRUM);
const drum = (rev: number): StripSpec => ({ rev });

/** which recordings cover which part of each instrument's range */
const Z = {
  strings: [[0, 54, 'celloSec'], [55, 66, 'violaSec'], [67, 127, 'violinSec']],
  trem: [[0, 56, 'celloTrem'], [57, 127, 'violinTrem']],
  spic: [[0, 56, 'celloSpic'], [57, 127, 'violinSpic']],
  // the horn recordings skip from 60 to 74: a darkened trumpet sits in the hole
  horns: [[0, 64, 'horn'], [65, 70, 'trumpet', 2600], [71, 127, 'horn']],
  lowBrass: [[0, 45, 'tuba'], [46, 127, 'trombone']],
} as const satisfies Record<string, readonly Zone[]>;
const SAMPLED_ZONES: Partial<Record<Inst, (readonly Zone[])[]>> = {
  strings: [Z.strings, Z.trem], tremolo: [Z.trem], spiccato: [Z.spic], cello: [[[0, 127, 'celloSec']], [[0, 127, 'celloTrem']]],
  violin: [[[0, 127, 'soloViolin']], [[0, 127, 'violinTrem']]], horns: [Z.horns], trumpets: [[[0, 127, 'trumpet']]],
  lowBrass: [Z.lowBrass], flute: [[[0, 127, 'flute']]],
};

const DEFS: Record<Inst, Def> = {
  // ── orchestra ──
  strings: {
    v: sampled({ inst: 'strings', zones: Z.strings, trem: Z.trem, a: 0.05, r: 0.42, fb: sus({ w: [[SAW, -9, 1], [SAW, 8, 1]], cut: 4.6, cutMax: 5600, a: 0.13, r: 0.42 }) }),
    s: { rev: 0.85, hp: 60 },
    rel: 0.4,
  },
  tremolo: {
    v: sampled({ inst: 'tremolo', zones: Z.trem, a: 0.03, r: 0.3, fb: sus({ w: [[SAW, -9, 1], [SAW, 8, 1]], cut: 6, cutMax: 7000, a: 0.06, r: 0.3, trem: true }) }),
    s: { rev: 0.8, hp: 80 },
    rel: 0.3,
  },
  spiccato: {
    v: sampled({ inst: 'spiccato', zones: Z.spic, a: 0.002, r: 0.08, short: true, fb: dec({ w: [[SAW, -7, 1], [SAW, 6, 1]], cutHi: 9, cutLo: 2.2, ftau: 0.045, cutMax: 9000, atk: 0.004, tau: 0.075, min: 0.3, r: 0.08, on: ['bite', 0.18] }) }),
    s: { rev: 0.6, hp: 60 },
  },
  pizz: { v: plucked('pizz'), s: { rev: 0.75 } },
  cello: {
    v: sampled({ inst: 'cello', zones: [[0, 127, 'celloSec']], trem: [[0, 127, 'celloTrem']], a: 0.04, r: 0.3, glide: 0.09, fb: sus({ w: [[SAW, 0, 1], [SAW, 5, 0.5]], cut: 4.2, cutMax: 4200, q: 0.9, a: 0.07, r: 0.22, vib: [20, 0.22, 0], glide: 0.09 }) }),
    s: { rev: 0.8, hp: 45 },
    rel: 0.3,
  },
  violin: {
    v: sampled({ inst: 'violin', zones: [[0, 127, 'soloViolin']], trem: [[0, 127, 'violinTrem']], a: 0.03, r: 0.25, glide: 0.07, fb: sus({ w: [[SAW, 0, 1], [SAW, -4, 0.45]], cut: 4.5, cutMax: 7500, q: 0.9, a: 0.06, r: 0.2, vib: [24, 0.2, 1], glide: 0.07 }) }),
    s: { rev: 0.9, del: 0.3, hp: 160 },
    rel: 0.25,
  },
  horns: {
    v: sampled({ inst: 'horns', zones: Z.horns, a: 0.03, r: 0.25, fb: sus({ w: [[SAW, -4, 1], [SAW, 5, 1]], cut: 3.2, cutMax: 2600, fenv: 1.1, q: 0.8, a: 0.07, r: 0.2 }) }),
    s: { rev: 1, hp: 50 },
    rel: 0.25,
  },
  trumpets: {
    v: sampled({ inst: 'trumpets', zones: [[0, 127, 'trumpet']], a: 0.015, r: 0.18, fb: sus({ w: [[SAW, -3, 1], [SAW, 4, 1]], cut: 6.5, cutMax: 6800, fenv: 1.4, q: 1.3, a: 0.035, r: 0.14 }) }),
    s: { rev: 0.85, hp: 110 },
    rel: 0.18,
  },
  lowBrass: {
    v: sampled({ inst: 'lowBrass', zones: Z.lowBrass, a: 0.03, r: 0.22, fb: sus({ w: [[SAW, -5, 1], [SAW, 4, 1], [SQ, 0, 0.25]], cut: 5, cutMax: 2400, fenv: 1.2, q: 1.1, a: 0.06, r: 0.22 }) }),
    s: { rev: 0.75, hp: 30 },
    rel: 0.22,
  },
  choirAh: { v: choir({ vowels: ['a', 'a', 'o'], n: 5, spread: 11, a: 0.16, r: 0.45, vib: 10, air: 0.05 }), s: { rev: 1.15, ch: 0.25, hp: 90 }, rel: 0.4 },
  choirOo: { v: choir({ vowels: ['o', 'u'], n: 5, spread: 9, a: 0.3, r: 0.6, vib: 7, air: 0.04 }), s: { rev: 1.15, ch: 0.25, hp: 90 }, rel: 0.5 },
  choirLo: { v: choir({ vowels: ['o', 'a'], n: 6, spread: 8, a: 0.22, r: 0.5, vib: 6, air: 0.035, bright: -4, width: 0.55 }), s: { rev: 1.05, ch: 0.2, hp: 50 }, rel: 0.45 },
  choirStac: {
    v: dec({ w: [[vowel('a', 0), -8, 1], [vowel('a', 1), 9, 1]], atk: 0.012, tau: 0.11, min: 0.34, r: 0.1, on: ['breath', 0.2] }),
    s: { rev: 1, ch: 0.6, hp: 80 },
  },
  soprano: { v: sus({ w: [[vowel('a', 0, 3), 0, 1]], a: 0.09, r: 0.3, vib: [34, 0.18, 1], glide: 0.08, on: ['breath', 0.1] }), s: { rev: 1.3, del: 0.25, hp: 200 }, rel: 0.3 },
  piano: { v: keys(false), s: { rev: 0.7, del: 0.15 }, rel: 0.35 },
  felt: { v: keys(true), s: { rev: 0.8, del: 0.15 }, rel: 0.45 },
  harp: { v: plucked('harp'), s: { rev: 0.9, del: 0.15 } },
  zither: { v: plucked('zither', true), s: { rev: 0.8, del: 0.2 } },
  bell: { v: struck('bell'), s: { rev: 1.1, del: 0.2 } },
  glock: { v: struck('glock'), s: { rev: 0.9, del: 0.3 } },
  celesta: { v: struck('celesta'), s: { rev: 1, del: 0.3 } },
  organ: { v: sus({ w: [[organW, 0, 1], [organW, 4, 0.7], [SIN, 0, 0.5, -1]], a: 0.035, r: 0.3, on: ['breath', 0.08] }), s: { rev: 1.2, lp: 6500 }, rel: 0.35 },
  flute: {
    v: sampled({ inst: 'flute', zones: [[0, 127, 'flute']], a: 0.03, r: 0.16, glide: 0.04, fb: sus({ w: [[fixedWave('flute', FLUTE_SPECTRUM), 0, 1]], a: 0.06, r: 0.14, vib: [13, 0.25, 0], air: 0.07, on: ['breath', 0.25], glide: 0.04 }) }),
    s: { rev: 1, del: 0.25, hp: 200 },
    rel: 0.18,
  },
  bamboo: {
    v: sus({ w: [[fixedWave('bamboo', BAMBOO_SPECTRUM), 0, 1]], a: 0.05, r: 0.16, vib: [26, 0.3, 0], air: 0.12, scoop: 45, on: ['breath', 0.35], glide: 0.08 }),
    s: { rev: 1.2, del: 0.3, hp: 180 },
    rel: 0.2,
  },
  timpani: { v: hit('timpani', { tune: 110, curve: 1.5 }), s: drum(0.7) },
  braam: { v: braam, s: { rev: 0.7 }, rel: 0.4 },
  // ── synths ──
  sub: { v: sus({ w: [[SIN, 0, 1], [TRI, 0, 0.18]], a: 0.015, r: 0.12 }), s: { rev: 0 }, rel: 0.12 },
  synBass: {
    v: dec({ w: [[SAW, 0, 1], [SQ, 0, 0.5, -1]], cutHi: 9, cutLo: 2, ftau: 0.1, q: 2.5, cutMax: 5000, atk: 0.004, tau: 0.25, sus: 0.6, r: 0.07 }),
    s: { rev: 0.06 },
    rel: 0.1,
  },
  reese: { v: sus({ w: [[SAW, -19, 1], [SAW, 18, 1], [SIN, 0, 0.8]], cut: 5, cutMin: 350, cutMax: 1400, q: 1.5, a: 0.012, r: 0.1 }), s: { rev: 0.05 }, rel: 0.12 },
  b808: { v: b808, s: { rev: 0.03 }, rel: 0.1 },
  sawPad: { v: sus({ w: [[SAW, -11, 1], [SAW, 12, 1]], cut: 3.5, cutMin: 500, cutMax: 2600, a: 0.35, r: 0.8 }), s: { rev: 0.9, ch: 0.7, hp: 90 }, rel: 0.6 },
  warmPad: { v: sus({ w: [[TRI, -6, 1], [SAW, 7, 0.35], [SIN, 0, 0.4, -1]], cut: 3, cutMin: 400, cutMax: 1800, a: 0.5, r: 1.1 }), s: { rev: 1, ch: 0.7 }, rel: 0.8 },
  superSaw: { v: sus({ w: [[SAW, -21, 0.8], [SAW, 0, 1], [SAW, 20, 0.8]], cut: 7, cutMax: 9000, a: 0.012, r: 0.2 }), s: { rev: 0.7, del: 0.25, ch: 0.6, hp: 120 }, rel: 0.25 },
  pluck: {
    v: dec({ w: [[SAW, 0, 1], [SQ, 7, 0.5]], cutHi: 10, cutLo: 1.4, ftau: 0.08, q: 2, cutMax: 9000, atk: 0.002, tau: 0.16, min: 0.6, r: 0.1 }),
    s: { rev: 0.6, del: 0.7, hp: 120 },
  },
  arp: {
    v: dec({ w: [[SQ, 0, 0.7], [SAW, -6, 0.6]], cutHi: 7, cutLo: 1.6, ftau: 0.05, q: 3, cutMax: 7000, atk: 0.002, tau: 0.1, min: 0.4, r: 0.08 }),
    s: { rev: 0.5, del: 0.6, hp: 150 },
  },
  lead: {
    v: sus({ w: [[SAW, -8, 1], [SAW, 9, 1], [SQ, 0, 0.35, -1]], cut: 5.5, cutMax: 6500, q: 1.2, a: 0.012, r: 0.16, vib: [16, 0.22, 0], glide: 0.06 }),
    s: { rev: 0.7, del: 0.6, hp: 140 },
    rel: 0.18,
  },
  ePiano: { v: ePiano, s: { rev: 0.6, del: 0.3, ch: 0.45 }, rel: 0.2 },
  guitar: { v: guitar, s: { rev: 0.22, ch: 0.5, hp: 70 }, rel: 0.08 },
  cowbell: { v: cowbell, s: { rev: 0.3, del: 0.2, hp: 200 } },
  // ── percussion & fx ──
  taikoLo: { v: hit('taikoLo', { ens: true }), s: drum(0.55) },
  taikoMid: { v: hit('taikoMid', { ens: true }), s: drum(0.55) },
  taikoHi: { v: hit('taikoHi'), s: drum(0.5) },
  boom: { v: hit('boom', { curve: 1.3 }), s: drum(0.6) },
  impact: { v: hit('impact', { curve: 1.3 }), s: drum(0.7) },
  snareOrch: { v: hit('snareOrch'), s: drum(0.6) },
  stick: { v: hit('stick'), s: drum(0.5) },
  anvil: { v: hit('anvil'), s: drum(0.7) },
  gong: { v: hit('gong', { curve: 1.3 }), s: drum(0.9) },
  crash: { v: hit('crash', { curve: 1.3 }), s: drum(0.7) },
  swell: { v: swellV, s: drum(0.6) },
  kick: { v: hit('kick'), s: drum(0.04) },
  kickDeep: { v: hit('kickDeep'), s: drum(0.04) },
  kickSoft: { v: hit('kickSoft'), s: drum(0.08) },
  snare: { v: hit('snare'), s: drum(0.3) },
  snareLofi: { v: hit('snareLofi'), s: drum(0.22) },
  clap: { v: hit('clap'), s: drum(0.35) },
  rim: { v: hit('rim'), s: drum(0.35) },
  hat: { v: hit('hat'), s: drum(0.1) },
  hatOpen: { v: hit('hatOpen'), s: drum(0.15) },
  shaker: { v: hit('shaker'), s: drum(0.2) },
  tick: { v: hit('tick'), s: drum(0.5) },
  riser: { v: riser, s: { rev: 0.5 } },
  subDrop: { v: subDrop, s: { rev: 0.1 } },
  vinyl: { v: vinylV, s: { rev: 0 } },
};

/** transient layers each instrument needs alongside its own samples */
const EXTRA: Partial<Record<Inst, string[]>> = {
  spiccato: ['bite'], choirAh: ['noise'], choirOo: ['noise'], choirLo: ['noise'], piano: ['thump'], felt: ['thump'], soprano: ['breath'], organ: ['breath'], choirStac: ['breath'],
  flute: ['breath', 'noise'], bamboo: ['breath', 'noise'], riser: ['noise'], timpani: ['timpani'],
};
const PLUCKS = new Set<string>(['harp', 'zither', 'pizz']);
const BELLS = new Set<string>(['bell', 'glock', 'celesta']);

/** Renders every sample a set of notes will need, yielding to the UI as it goes. */
export async function prepareSamples(notes: Iterable<{ i: Inst; m: number; a?: number }>, onProgress?: (p: number) => void, urgent = true): Promise<void> {
  const keys = new Set<string>();
  for (const { i, m, a } of notes) {
    const zs = RECORDINGS.on ? SAMPLED_ZONES[i] : undefined;
    if (zs) {
      const p = pickSample(a === 3 && zs[1] ? zs[1] : zs[0], m);
      if (p && !failed.has(p.key)) keys.add(p.key);
    }
    if (PLUCKS.has(i)) keys.add(`k:${i}:${clamp(Math.round(m), 24, 108)}`);
    else if (BELLS.has(i)) keys.add(`b:${i}:${clamp(Math.round(m), 33, 108)}`);
    else if (i in PERC) keys.add('p:' + i);
    for (const x of EXTRA[i] ?? []) keys.add('p:' + x);
  }
  const recorded = [...keys].filter((k) => k.charCodeAt(0) === 115 && !bufCache.has(k));
  const list = [...keys].filter((k) => k.charCodeAt(0) !== 115 && !bufCache.has(k));
  const all = recorded.length + list.length;
  let got = 0;
  const tick = () => onProgress?.(++got / Math.max(1, all));
  const fetched = Promise.all(recorded.map((k) => want(k, urgent).then(tick)));
  if (!list.length) {
    await fetched;
    onProgress?.(1);
    return;
  }
  if (workers()) {
    // reversed so that, when jumping the queue, the list still comes out in its own order
    const order = urgent ? [...list].reverse() : list;
    await Promise.all([fetched, ...order.map((k) => want(k, urgent).then(tick))]);
    return;
  }
  let slice = performance.now();
  for (let k = 0; k < list.length; k++) {
    renderHere(list[k]);
    if (performance.now() - slice > 14) {
      onProgress?.((got + k + 1) / all);
      await new Promise((r) => setTimeout(r, 0));
      slice = performance.now();
    }
  }
  await fetched;
  onProgress?.(1);
}

// ───────────────────────────── the graph ─────────────────────────────

interface Strip {
  in: GainNode;
  fader: GainNode;
  bus: string;
}
interface BusNodes {
  sum: GainNode;
  pump: GainNode;
  an?: AnalyserNode;
  data?: Float32Array<ArrayBuffer>;
}

export interface GraphOpts {
  live?: boolean;
  /** skip the mastering chain and the hall (used for level calibration) */
  raw?: boolean;
  /** user mixer: 0..1.5 per bus */
  levels?: Partial<Record<Bus, number>>;
}

/** how the sections of the orchestra sit against each other (measured on full renders, see /lab) */
export const BUS_TRIM: Record<string, number> = { melody: 1.4, pad: 1.5, ost: 1.5, bass: 1, choir: 1.15, brass: 1, drums: 0.5, color: 1.3, fx: 0.75, live: 1.6 };
const PUMPED = new Set(['pad', 'ost', 'bass', 'melody', 'choir', 'brass', 'color']);
/** mastering constants (mutable so the lab bench can tune them) */
export const TUNE = { drive: 0.66, threshold: -18, ratio: 2.2, knee: 12, lowTrim: -2, mud: -2, presence: 2, hallHp: 250 };
const REVERB_RETURN = 1;

export class AudioGraph {
  readonly ctx: BaseAudioContext;
  readonly style: StylePreset;
  readonly live: boolean;
  bpm: number;
  /** vibrato LFOs */
  lfo: OscillatorNode[] = [];
  /** tremolo sources, pre-scaled */
  trem: GainNode[] = [];
  private chLfo: GainNode[] = [];
  private lfos: OscillatorNode[] = [];
  private sum: GainNode;
  private outNode: GainNode;
  private revIn: GainNode | null = null;
  private delIn: GainNode | null = null;
  private delays: DelayNode[] = [];
  private strips = new Map<string, Strip>();
  private buses = new Map<string, BusNodes>();
  private voices = new Set<Voice>();
  private waves = new Map<string, PeriodicWave>();
  private cur: Voice | null = null;
  private user: Partial<Record<string, number>>;
  private dead = false;

  constructor(ctx: BaseAudioContext, dest: AudioNode, style: StylePreset, bpm: number, opts: GraphOpts = {}) {
    this.ctx = ctx;
    this.style = style;
    this.bpm = bpm;
    this.live = !!opts.live;
    this.user = { ...(opts.levels ?? {}) };

    const lfo = (hz: number) => {
      const o = ctx.createOscillator();
      o.frequency.value = hz;
      o.start();
      this.lfos.push(o);
      return o;
    };
    const scaled = (hz: number, depth: number) => {
      const g = ctx.createGain();
      g.gain.value = depth;
      lfo(hz).connect(g);
      return g;
    };
    this.lfo = [lfo(5.3), lfo(6.1), lfo(4.7), lfo(5.7), lfo(6.6), lfo(5.0)];
    this.trem = [scaled(11.3, 0.36), scaled(12.9, 0.36), scaled(14.2, 0.36)];
    this.chLfo = [scaled(0.53, 0.0032), scaled(0.81, 0.0038)];

    this.outNode = ctx.createGain();
    this.outNode.connect(dest);
    this.sum = ctx.createGain();

    if (opts.raw) {
      this.sum.connect(this.outNode);
      return;
    }

    // mastering: rumble filter → tone tilt → clear the low mids, bring the detail forward → glue compression → soft clip ceiling
    const hp = this.bq('highpass', 26, 0.7);
    const lo = this.bq('lowshelf', 120, 0.7);
    lo.gain.value = style.tilt.low + TUNE.lowTrim;
    const mud = this.bq('peaking', 300, 0.9);
    mud.gain.value = TUNE.mud;
    const pres = this.bq('peaking', 3200, 0.8);
    pres.gain.value = TUNE.presence;
    const hi = this.bq('highshelf', 6500, 0.7);
    hi.gain.value = style.tilt.high;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = TUNE.threshold;
    comp.knee.value = TUNE.knee;
    comp.ratio.value = TUNE.ratio;
    comp.attack.value = 0.015;
    comp.release.value = 0.25;
    const pre = this.gn(TUNE.drive / CLIP_RANGE);
    const clip = ctx.createWaveShaper();
    clip.curve = softClipCurve();
    clip.oversample = '2x';
    this.sum.connect(hp);
    hp.connect(lo);
    lo.connect(mud);
    mud.connect(pres);
    pres.connect(hi);
    hi.connect(comp);
    comp.connect(pre);
    pre.connect(clip);
    clip.connect(this.outNode);

    // the hall
    this.revIn = this.gn(1);
    // a hall full of low mids is mud: the reverb only gets what is above them
    const rhp = this.bq('highpass', TUNE.hallHp, 0.5);
    const predelay = ctx.createDelay(0.25);
    predelay.delayTime.value = style.reverb.predelay;
    const conv = ctx.createConvolver();
    conv.buffer = irBuffer(ctx.sampleRate, style.reverb.size, style.reverb.damp);
    const ret = this.gn(REVERB_RETURN);
    this.revIn.connect(rhp);
    rhp.connect(predelay);
    predelay.connect(conv);
    conv.connect(ret);
    ret.connect(this.sum);

    // tempo-synced ping-pong delay
    if (style.delay) {
      const time = (style.delay.beats * 60) / bpm;
      this.delIn = this.gn(1);
      const dl = ctx.createDelay(3);
      const dr = ctx.createDelay(3);
      dl.delayTime.value = time;
      dr.delayTime.value = time;
      this.delays = [dl, dr];
      const fb = this.gn(style.delay.fb);
      const flp = this.bq('lowpass', 3400, 0.5);
      const fhp = this.bq('highpass', 300, 0.5);
      const pl = ctx.createStereoPanner();
      pl.pan.value = -0.7;
      const pr = ctx.createStereoPanner();
      pr.pan.value = 0.7;
      const out = this.gn(style.delay.mix * 2.2);
      const toHall = this.gn(0.3);
      this.delIn.connect(dl);
      dl.connect(pl);
      dl.connect(dr);
      dr.connect(pr);
      dr.connect(fhp);
      fhp.connect(flp);
      flp.connect(fb);
      fb.connect(dl);
      pl.connect(out);
      pr.connect(out);
      out.connect(this.sum);
      out.connect(toHall);
      toHall.connect(this.revIn);
    }
  }

  // ── node helpers (used by the voices) ──

  gn(v: number): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = v;
    return g;
  }

  bq(type: BiquadFilterType, f: number, q: number): BiquadFilterNode {
    const b = this.ctx.createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    b.Q.value = q;
    return b;
  }

  shaper(k: number): WaveShaperNode {
    const s = this.ctx.createWaveShaper();
    s.curve = tanhCurve(k);
    return s;
  }

  osc(w: OscillatorType | PeriodicWave, f: number, t: number, cents = 0): OscillatorNode {
    const o = this.ctx.createOscillator();
    if (typeof w === 'string') o.type = w as OscillatorType;
    else o.setPeriodicWave(w);
    o.frequency.value = f;
    if (cents) o.detune.value = cents;
    o.start(Math.max(0, t));
    this.cur!.srcs.push(o);
    return o;
  }

  buf(b: AudioBuffer, t: number, rate = 1, offset = 0, loop = false): AudioBufferSourceNode {
    const s = this.ctx.createBufferSource();
    s.buffer = b;
    s.playbackRate.value = rate;
    s.loop = loop;
    s.start(Math.max(0, t), offset);
    this.cur!.srcs.push(s);
    return s;
  }

  /** connect a shared modulator to something inside the current voice, remembering to undo it later */
  mod(src: AudioNode, dst: AudioNode | AudioParam) {
    if (dst instanceof AudioNode) src.connect(dst);
    else src.connect(dst);
    this.cur!.mods.push([src, dst]);
  }

  /** a PeriodicWave from harmonic amplitudes; variant > 0 scrambles the phases so doubled voices don't stack peaks */
  pw(key: string, amps: () => number[], variant: number): PeriodicWave {
    let w = this.waves.get(key);
    if (!w) {
      const a = amps();
      const real = new Float32Array(a.length + 1);
      const imag = new Float32Array(a.length + 1);
      let s = 0x2f6e2b1 * (variant + 1);
      for (let i = 0; i < a.length; i++) {
        if (variant) {
          s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
          const ph = (s / 4294967296) * Math.PI * 2;
          real[i + 1] = a[i] * Math.cos(ph);
          imag[i + 1] = a[i] * Math.sin(ph);
        } else imag[i + 1] = a[i];
      }
      w = this.ctx.createPeriodicWave(real, imag);
      this.waves.set(key, w);
    }
    return w;
  }

  // ── routing ──

  private levelOf(bus: string): number {
    return (this.user[bus] ?? 1) * (this.style.mix?.[bus as Bus] ?? 1) * (BUS_TRIM[bus] ?? 1);
  }

  private bus(key: string): BusNodes {
    let b = this.buses.get(key);
    if (!b) {
      const sum = this.ctx.createGain();
      const pump = this.ctx.createGain();
      sum.connect(pump);
      pump.connect(this.sum);
      b = { sum, pump };
      if (this.live) {
        b.an = this.ctx.createAnalyser();
        b.an.fftSize = 512;
        b.data = new Float32Array(512);
        pump.connect(b.an);
      }
      this.buses.set(key, b);
    }
    return b;
  }

  private chorus(input: AudioNode, amount: number): AudioNode {
    const out = this.gn(1);
    input.connect(out);
    const taps: [number, number][] = [[0.017, -0.8], [0.024, 0.8]];
    taps.forEach(([base, pan], i) => {
      const d = this.ctx.createDelay(0.08);
      d.delayTime.value = base;
      this.chLfo[i].connect(d.delayTime);
      const w = this.gn(amount * 0.7);
      const p = this.ctx.createStereoPanner();
      p.pan.value = pan;
      input.connect(d);
      d.connect(w);
      w.connect(p);
      p.connect(out);
    });
    return out;
  }

  private strip(busKey: string, inst: Inst): Strip {
    const key = busKey + '/' + inst;
    let st = this.strips.get(key);
    if (!st) {
      const s = DEFS[inst].s;
      const input = this.gn(GAIN[inst]);
      let node: AudioNode = input;
      if (s.hp) {
        const f = this.bq('highpass', s.hp, 0.6);
        node.connect(f);
        node = f;
      }
      if (s.lp) {
        const f = this.bq('lowpass', s.lp, 0.6);
        node.connect(f);
        node = f;
      }
      if (s.ch) node = this.chorus(node, s.ch);
      const fader = this.gn(this.levelOf(busKey));
      node.connect(fader);
      fader.connect(this.bus(busKey).sum);
      if (s.rev && this.revIn) {
        const send = this.gn(s.rev * this.style.reverb.wet * 1.6);
        fader.connect(send);
        send.connect(this.revIn);
      }
      if (s.del && this.delIn) {
        const send = this.gn(s.del);
        fader.connect(send);
        send.connect(this.delIn);
      }
      st = { in: input, fader, bus: busKey };
      this.strips.set(key, st);
    }
    return st;
  }

  // ── playing ──

  private start(inst: Inst, bus: string, t: number, d: number, m: number, v: number, pan: number, from: number | undefined, art: number, seed: number, live: boolean): Voice {
    const def = DEFS[inst];
    const strip = this.strip(bus, inst);
    const vca = this.ctx.createGain();
    let pn: StereoPannerNode | null = null;
    if (pan) {
      pn = this.ctx.createStereoPanner();
      pn.pan.value = clamp(pan, -1, 1);
      vca.connect(pn);
      pn.connect(strip.in);
    } else vca.connect(strip.in);
    const voice: Voice = { vca, pan: pn, dest: strip.in, srcs: [], mods: [], rel: def.rel, live, done: false };
    this.cur = voice;
    const end = def.v(this, { t, d, m, f: mtof(m), v, a: art, from, seed, vca });
    this.cur = null;
    let left = voice.srcs.length;
    if (!left) {
      this.free(voice);
      return voice;
    }
    const onEnd = () => {
      if (--left === 0) this.free(voice);
    };
    for (const s of voice.srcs) {
      s.onended = onEnd;
      s.stop(end);
    }
    this.voices.add(voice);
    return voice;
  }

  private free(v: Voice) {
    if (v.done) return;
    v.done = true;
    this.voices.delete(v);
    try {
      (v.pan ?? v.vca).disconnect();
      for (const [src, dst] of v.mods) {
        if (dst instanceof AudioNode) src.disconnect(dst);
        else src.disconnect(dst);
      }
    } catch {
      /* already gone */
    }
  }

  /** schedule one score event at context time `when` */
  playEvent(ev: NoteEv, when: number, secPerBeat: number, beats = ev.d) {
    if (this.dead) return;
    const x = Math.sin(ev.t * 127.1 + ev.m * 311.7) * 43758.5453;
    this.start(ev.i, ev.b, when, beats * secPerBeat, ev.m, Math.min(ev.v, 1.2), ev.p ?? 0, ev.from, ev.a ?? 0, x - Math.floor(x), false);
    if (this.style.pump && (ev.i === 'kick' || ev.i === 'kickDeep')) this.pumpAt(when, this.style.pump);
  }

  private pumpAt(when: number, depth: number) {
    for (const [key, b] of this.buses) {
      if (!PUMPED.has(key)) continue;
      const d = key === 'melody' ? depth * 0.5 : depth;
      b.pump.gain.setTargetAtTime(1 - d, Math.max(0, when - 0.005), 0.004);
      b.pump.gain.setTargetAtTime(1, when + 0.035, 0.085);
    }
  }

  /** a key goes down (pads, piano keys) */
  noteOn(inst: Inst, midi: number, vel = 0.85): Voice {
    const sustained = DEFS[inst].rel !== undefined;
    return this.start(inst, 'live', this.ctx.currentTime + 0.003, sustained ? 14 : 2, midi, vel, clamp((midi - 62) / 50, -0.5, 0.5), undefined, 0, Math.random(), true);
  }

  noteOff(v: Voice) {
    if (v.done || v.rel === undefined) return;
    const now = this.ctx.currentTime;
    v.vca.gain.setTargetAtTime(0, now, v.rel / 4);
    for (const s of v.srcs) s.stop(now + v.rel * 2);
  }

  /** silence everything scheduled from the score (held keys keep sounding unless `all`) */
  stopAll(all = false) {
    const now = this.ctx.currentTime;
    const killed: Voice[] = [];
    for (const v of this.voices) {
      if (v.live && !all) continue;
      v.vca.gain.cancelScheduledValues(now);
      v.vca.gain.setTargetAtTime(0, now, 0.012);
      for (const s of v.srcs) {
        try {
          s.stop(now + 0.07);
        } catch {
          /* never started */
        }
      }
      killed.push(v);
    }
    for (const [key, b] of this.buses) {
      if (!PUMPED.has(key)) continue;
      b.pump.gain.cancelScheduledValues(now);
      b.pump.gain.setTargetAtTime(1, now, 0.03);
    }
    if (killed.length && this.live) setTimeout(() => killed.forEach((v) => this.free(v)), 250);
  }

  get activeVoices(): number {
    return this.voices.size;
  }

  setLevel(bus: Bus, level: number) {
    this.user[bus] = level;
    const now = this.ctx.currentTime;
    for (const st of this.strips.values()) if (st.bus === bus) st.fader.gain.setTargetAtTime(this.levelOf(bus), now, 0.03);
  }

  setTempo(bpm: number) {
    this.bpm = bpm;
    if (this.style.delay) for (const d of this.delays) d.delayTime.setTargetAtTime((this.style.delay.beats * 60) / bpm, this.ctx.currentTime, 0.05);
  }

  /** current loudness of a bus, 0..1 (live graphs only) */
  meter(bus: string): number {
    const b = this.buses.get(bus);
    if (!b?.an || !b.data) return 0;
    b.an.getFloatTimeDomainData(b.data);
    let s = 0;
    for (let i = 0; i < b.data.length; i++) s += b.data[i] * b.data[i];
    return Math.sqrt(s / b.data.length);
  }

  /** fade out and tear the whole graph down */
  dispose(fade = 0.25) {
    if (this.dead) return;
    this.dead = true;
    const now = this.ctx.currentTime;
    this.outNode.gain.setTargetAtTime(0, now, fade / 4);
    this.stopAll(true);
    const kill = () => {
      try {
        this.outNode.disconnect();
        for (const o of this.lfos) o.stop();
      } catch {
        /* context already closed */
      }
    };
    if (this.live) setTimeout(kill, fade * 1000 + 2500);
    else kill();
  }
}

export const hasVoice = (i: string): i is Inst => i in DEFS;

/** does this instrument hold for as long as the note is written (vs. ringing out by itself)? */
export const isSustained = (i: Inst): boolean => DEFS[i].rel !== undefined;
