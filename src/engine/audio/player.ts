/**
 * The conductor: owns the live AudioContext, schedules the score a quarter-second ahead of the
 * music, keeps the pads playable at any time, and tells the visuals exactly when each hit is heard.
 */
import { STYLES } from '../styles';
import { BUSES, type Bus, type Inst, type Score, type StylePreset } from '../types';
import { encodeMp3, saveBlob, wavBlob } from './encode';
import { AudioGraph, isSustained, prepareHall, prepareSamples, type Voice } from './graph';
import { renderScore } from './render';

export type PlayerEvent = 'state' | 'section' | 'chord' | 'end';

export interface Comet {
  /** performance.now() / 1000 when it was heard */
  at: number;
  /** seconds */
  dur: number;
  midi: number;
  live: boolean;
}

const TICK_MS = 40;
const LOOKAHEAD = 0.28;
const START_DELAY = 0.09;

class Player {
  ctx: AudioContext | null = null;
  graph: AudioGraph | null = null;
  analyser: AnalyserNode | null = null;
  score: Score | null = null;
  style: StylePreset = STYLES.titan;
  playing = false;
  loop = false;
  volume = 0.9;
  /** user mixer */
  levels: Record<Bus, number> = Object.fromEntries(BUSES.map((b) => [b, 1])) as Record<Bus, number>;
  mutes: Record<Bus, boolean> = Object.fromEntries(BUSES.map((b) => [b, false])) as Record<Bus, boolean>;

  // visual state, refreshed by frame()
  kick = 0;
  beat = 0;
  touch = 0;
  /** seconds since each of the last heavy hits (newest first) */
  shocks: number[] = [9, 9, 9, 9];
  comets: Comet[] = [];
  sectionIdx = -1;
  chordIdx = -1;
  /** midi notes of the melody sounding right now */
  sounding = new Set<number>();

  private out: GainNode | null = null;
  private t0 = 0;
  private spb = 0.5;
  private idx = 0;
  private pausedAt = 0;
  private timer: Worker | null = null;
  private visQ: { time: number; s: number }[] = [];
  private noteQ: { time: number; end: number; m: number }[] = [];
  private noteOffQ: { end: number; m: number }[] = [];
  private held = new Map<string, Voice>();
  private subs = new Set<(e: PlayerEvent) => void>();
  private lastFrame = 0;

  subscribe(fn: (e: PlayerEvent) => void): () => void {
    this.subs.add(fn);
    return () => this.subs.delete(fn);
  }
  private emit(e: PlayerEvent) {
    this.subs.forEach((f) => f(e));
  }

  /** must first be called from a user gesture */
  ensure(): AudioContext {
    if (!this.ctx) {
      const Ctx: typeof AudioContext = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx({ latencyHint: 'interactive' });
      this.ctx = ctx;
      this.out = ctx.createGain();
      this.out.gain.value = this.volume;
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.62;
      this.analyser.minDecibels = -86;
      this.analyser.maxDecibels = -16;
      this.out.connect(ctx.destination);
      this.out.connect(this.analyser);
      this.buildGraph();
      const src = `let id=null;onmessage=e=>{if(e.data==='start'){if(id===null)id=setInterval(()=>postMessage(0),${TICK_MS})}else{clearInterval(id);id=null}}`;
      this.timer = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
      this.timer.onmessage = () => this.tick();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  private effective(): Record<Bus, number> {
    return Object.fromEntries(BUSES.map((b) => [b, this.mutes[b] ? 0 : this.levels[b]])) as Record<Bus, number>;
  }

  private buildGraph() {
    if (!this.ctx || !this.out) return;
    this.held.clear();
    this.graph?.dispose();
    this.graph = new AudioGraph(this.ctx, this.out, this.style, this.score?.bpm ?? 110, { live: true, levels: this.effective() });
  }

  /** change world; the pads take on its voice immediately */
  setStyle(style: StylePreset) {
    if (style.id === this.style.id) return;
    if (this.playing) this.pause();
    this.style = style;
    if (this.ctx) this.buildGraph();
  }

  /** take a new score; resolves once every sample it needs has been rendered */
  async load(score: Score, style: StylePreset, onProgress?: (p: number) => void): Promise<void> {
    this.stop();
    this.score = score;
    this.spb = 60 / score.bpm;
    if (style.id !== this.style.id || !this.graph) {
      this.style = style;
      if (this.ctx) this.buildGraph();
    } else this.graph.setTempo(score.bpm);
    this.sectionIdx = -1;
    this.chordIdx = -1;
    await prepareSamples(score.events, onProgress);
  }

  get endBeat(): number {
    return this.score ? this.score.durationSec / this.spb : 0;
  }

  /** the beat being heard right now */
  get position(): number {
    if (!this.score) return 0;
    if (!this.playing || !this.ctx) return this.pausedAt;
    const lat = Math.min(0.2, this.ctx.outputLatency || this.ctx.baseLatency || 0);
    return Math.max(0, Math.min(this.endBeat, (this.ctx.currentTime - lat - this.t0) / this.spb));
  }

  get seconds(): number {
    return this.position * this.spb;
  }

  play(from = this.pausedAt) {
    const score = this.score;
    if (!score) return;
    const ctx = this.ensure();
    const graph = this.graph!;
    if (from >= score.totalBeats - 0.01) from = 0;
    graph.stopAll();
    const start = ctx.currentTime + START_DELAY;
    this.t0 = start - from * this.spb;
    const evs = score.events;
    let lo = 0;
    let hi = evs.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (evs[mid].t < from) lo = mid + 1;
      else hi = mid;
    }
    // jumping into the middle of the piece: re-bow the notes that should already be sounding
    if (from > 0) {
      for (let k = lo - 1; k >= 0 && evs[k].t > from - 20; k--) {
        const e = evs[k];
        const rest = e.t + e.d - from;
        if (rest > 0.75 && isSustained(e.i)) graph.playEvent(e, start, this.spb, rest);
      }
    }
    this.idx = lo;
    this.visQ.length = 0;
    this.noteQ.length = 0;
    this.noteOffQ.length = 0;
    this.sounding.clear();
    this.playing = true;
    this.pausedAt = from;
    this.timer?.postMessage('start');
    this.tick();
    this.emit('state');
  }

  pause() {
    if (!this.playing) return;
    this.pausedAt = this.position;
    this.playing = false;
    this.timer?.postMessage('stop');
    this.graph?.stopAll();
    this.sounding.clear();
    this.emit('state');
  }

  stop() {
    const was = this.playing;
    this.playing = false;
    this.pausedAt = 0;
    this.timer?.postMessage('stop');
    this.graph?.stopAll();
    this.sounding.clear();
    if (was) this.emit('state');
  }

  toggle() {
    if (this.playing) this.pause();
    else this.play();
  }

  seek(beat: number) {
    if (!this.score) return;
    const b = Math.max(0, Math.min(this.score.totalBeats - 0.05, beat));
    if (this.playing) this.play(b);
    else {
      this.pausedAt = b;
      this.emit('state');
    }
  }

  private tick() {
    const { ctx, score, graph } = this;
    if (!this.playing || !ctx || !score || !graph) return;
    const now = ctx.currentTime;
    const horizon = now + LOOKAHEAD;
    const evs = score.events;
    while (this.idx < evs.length) {
      const e = evs[this.idx];
      const when = this.t0 + e.t * this.spb;
      if (when > horizon) break;
      if (when > now - 0.06) {
        graph.playEvent(e, Math.max(when, now), this.spb);
        if (e.vis) this.visQ.push({ time: when, s: e.vis });
        if (e.b === 'melody') this.noteQ.push({ time: when, end: when + e.d * this.spb, m: e.m });
      }
      this.idx++;
    }
    if ((now - this.t0) / this.spb >= this.endBeat) {
      if (this.loop) this.play(0);
      else {
        this.stop();
        this.emit('state');
        this.emit('end');
      }
    }
  }

  /** advance the visual state; call once per animation frame */
  frame() {
    const t = performance.now() / 1000;
    const dt = Math.min(0.1, this.lastFrame ? t - this.lastFrame : 0.016);
    this.lastFrame = t;
    this.kick *= Math.exp(-dt * 5);
    this.beat *= Math.exp(-dt * 8);
    this.touch *= Math.exp(-dt * 6);
    for (let i = 0; i < this.shocks.length; i++) this.shocks[i] += dt;
    while (this.comets.length && t - this.comets[0].at > 7) this.comets.shift();
    const ctx = this.ctx;
    if (!ctx) return;
    const heard = ctx.currentTime - Math.min(0.2, ctx.outputLatency || ctx.baseLatency || 0);
    while (this.visQ.length && this.visQ[0].time <= heard) {
      const v = this.visQ.shift()!;
      if (v.s === 2) {
        this.kick = 1;
        if (this.shocks[0] > 0.18) {
          this.shocks.pop();
          this.shocks.unshift(0);
        }
      } else this.beat = Math.max(this.beat, 0.85);
    }
    while (this.noteQ.length && this.noteQ[0].time <= heard) {
      const n = this.noteQ.shift()!;
      this.comets.push({ at: t, dur: n.end - n.time, midi: n.m, live: false });
      this.sounding.add(n.m);
      this.noteOffQ.push({ end: n.end, m: n.m });
    }
    if (this.noteOffQ.length) {
      this.noteOffQ = this.noteOffQ.filter((n) => {
        if (n.end > heard) return true;
        this.sounding.delete(n.m);
        return false;
      });
    }
    const score = this.score;
    if (score) {
      const pos = this.position;
      let si = score.sections.findIndex((s) => pos < s.startBeat + s.beats);
      if (si < 0) si = score.sections.length - 1;
      if (si !== this.sectionIdx) {
        this.sectionIdx = si;
        this.emit('section');
      }
      let ci = this.chordIdx >= 0 && this.chordIdx < score.chords.length && score.chords[this.chordIdx].beat <= pos ? this.chordIdx : 0;
      while (ci + 1 < score.chords.length && score.chords[ci + 1].beat <= pos) ci++;
      if (ci !== this.chordIdx) {
        this.chordIdx = ci;
        this.emit('chord');
      }
    }
  }

  /** a visual hit with no sound behind it (used while the forge is working) */
  pulse(heavy = true) {
    if (heavy) {
      this.kick = 1;
      this.shocks.pop();
      this.shocks.unshift(0);
    } else this.beat = 1;
  }

  // ── live keys ──

  noteOn(id: string, midi: number, vel = 0.85, inst: Inst = this.style.padVoice) {
    this.ensure();
    if (this.held.has(id) || !this.graph) return;
    this.held.set(id, this.graph.noteOn(inst, midi, vel));
    this.touch = 1;
    this.beat = Math.max(this.beat, 0.5);
    this.comets.push({ at: performance.now() / 1000, dur: 0.6, midi, live: true });
  }

  noteOff(id: string) {
    const v = this.held.get(id);
    if (!v) return;
    this.graph?.noteOff(v);
    this.held.delete(id);
  }

  allNotesOff() {
    for (const id of [...this.held.keys()]) this.noteOff(id);
  }

  /** render the pad instrument's samples for these pitches in the background */
  warm(midis: number[], inst: Inst = this.style.padVoice) {
    void prepareSamples(midis.map((m) => ({ i: inst, m })));
  }

  /** rehearse a world in the background: its hall, and the samples a piece in it will reach for */
  prewarm(style: StylePreset, notes: Iterable<{ i: Inst; m: number }>) {
    void prepareHall(style, this.ctx ? [this.ctx.sampleRate, 44100] : [48000, 44100]);
    void prepareSamples(notes, undefined, false);
  }

  /** diagnostics: how hard each stretch is to perform — render time ÷ audio time, per 3 s */
  async profile(): Promise<{ t: number; load: number }[]> {
    if (!this.score) return [];
    const out: { t: number; load: number }[] = [];
    await renderScore(this.score, this.style, { levels: this.effective(), onChunk: (t, ms, span) => out.push({ t, load: ms / (span * 1000) }) });
    return out;
  }

  // ── mixer ──

  setVolume(v: number) {
    this.volume = v;
    if (this.out && this.ctx) this.out.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  }

  setLevel(bus: Bus, level: number) {
    this.levels[bus] = level;
    this.graph?.setLevel(bus, this.mutes[bus] ? 0 : level);
  }

  setMute(bus: Bus, muted: boolean) {
    this.mutes[bus] = muted;
    this.graph?.setLevel(bus, muted ? 0 : this.levels[bus]);
  }

  meter(bus: Bus): number {
    return this.graph?.meter(bus) ?? 0;
  }

  // ── export ──

  /** renders the current piece offline (with your mixer settings) and downloads it */
  async download(format: 'mp3' | 'wav', onProgress: (p: number, label: string) => void): Promise<{ bytes: number; seconds: number; name: string }> {
    const score = this.score;
    if (!score) throw new Error('Nothing to export yet');
    const t0 = performance.now();
    const res = await renderScore(score, this.style, {
      levels: this.effective(),
      onProgress: (p, stage) => onProgress(stage === 'samples' ? p * 0.08 : 0.08 + p * 0.62, stage === 'samples' ? 'Tuning the orchestra' : 'Performing the piece'),
    });
    const name = `${score.title} — Epyc SG`.replace(/[\\/:*?"<>|]/g, '').trim();
    const t1 = performance.now();
    let blob: Blob;
    if (format === 'mp3') {
      blob = await encodeMp3(res.left, res.right, res.sampleRate, 256, (p) => onProgress(0.7 + p * 0.3, 'Pressing the MP3'));
    } else {
      onProgress(0.85, 'Writing the WAV');
      blob = wavBlob(res.left, res.right, res.sampleRate);
    }
    onProgress(1, 'Done');
    exportTiming.render = t1 - t0;
    exportTiming.encode = performance.now() - t1;
    saveBlob(blob, `${name}.${format}`);
    return { bytes: blob.size, seconds: res.seconds, name: `${name}.${format}` };
  }
}

/** how long the last export spent performing and encoding, in ms (diagnostics) */
export const exportTiming = { render: 0, encode: 0 };

export const player = new Player();
export type { Player };
