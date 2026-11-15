import { create } from 'zustand';
import { player } from '@/engine/audio/player';
import { compose, inspire } from '@/engine/composer';
import { STYLES } from '@/engine/styles';
import type { ModeId } from '@/engine/theory';
import { BUSES, type Bus, type PieceLength, type Score } from '@/engine/types';
import { allPadMidis, inScale, type PadKey } from './keys';

export const MAX_NOTES = 16;
const LIB_KEY = 'epyc-sg.library.v1';
const PREF_KEY = 'epyc-sg.prefs.v1';

export interface SavedPiece {
  id: string;
  title: string;
  styleId: string;
  notes: number[];
  seed: number;
  length: PieceLength;
  intensity: number;
  key: PadKey;
  keyName: string;
  bpm: number;
  seconds: number;
  at: number;
}

export interface ForgeStep {
  label: string;
  detail: string;
}

export interface ExportState {
  open: boolean;
  busy: boolean;
  p: number;
  label: string;
  done: { name: string; bytes: number; seconds: number } | null;
  error: string | null;
}

type ForgeKind = 'new' | 'world' | 'restore';

interface Studio {
  styleId: string;
  motif: number[];
  /** pads write into the motif while this is on; off = jam over the piece */
  capture: boolean;
  length: PieceLength;
  intensity: number;
  seed: number;
  padKey: PadKey;
  /** the user picked this key by hand, so the composer must respect it */
  keyLocked: boolean;
  kbTarget: 'pads' | 'piano';
  octave: number;
  held: Record<number, boolean>;

  score: Score | null;
  phase: 'idle' | 'forging' | 'ready';
  steps: ForgeStep[];
  stepAt: number;
  loadP: number;
  /** the piece being forged and one sentence about it, held still on stage while the steps tick */
  pending: Score | null;
  forgeLine: string;

  playing: boolean;
  sectionIdx: number;
  chordIdx: number;
  loop: boolean;
  volume: number;
  levels: Record<Bus, number>;
  mutes: Record<Bus, boolean>;

  cinema: boolean;
  toast: string | null;
  exp: ExportState;
  library: SavedPiece[];

  init(): void;
  setWorld(id: string): void;
  press(midi: number, vel?: number): void;
  release(midi: number): void;
  releaseAll(): void;
  undo(): void;
  newMotif(): void;
  setCapture(on: boolean): void;
  inspireMe(): void;
  previewMotif(): void;
  setPadKey(k: Partial<PadKey>): void;
  setKeyLocked(on: boolean): void;
  setLength(l: PieceLength): void;
  setIntensity(v: number): void;
  setKbTarget(t: 'pads' | 'piano'): void;
  shiftOctave(d: number): void;
  forge(kind?: ForgeKind): Promise<void>;
  toggle(): void;
  seek(beat: number): void;
  jump(dir: 1 | -1): void;
  setLoop(on: boolean): void;
  setVolume(v: number): void;
  setLevel(bus: Bus, v: number): void;
  toggleMute(bus: Bus): void;
  setCinema(on: boolean): void;
  say(msg: string): void;
  openExport(open: boolean): void;
  download(format: 'mp3' | 'wav'): Promise<void>;
  openPiece(p: SavedPiece): void;
  removePiece(id: string): void;
}

/** how long the last forge spent where, in ms (diagnostics) */
export const forgeTiming = { compose: 0, load: 0, total: 0 };

let rehearsed = '';
const rand = () => Math.floor(Math.random() * 2 ** 31);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const each = <T,>(v: T) => Object.fromEntries(BUSES.map((b) => [b, v])) as Record<Bus, T>;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode or a full disk: the studio still works, it just forgets */
  }
}

let toastTimer = 0;
let previewRun = 0;
let wired = false;

export const useStudio = create<Studio>()((set, get) => {
  const warm = () => {
    const s = get();
    const idle = (window as unknown as { requestIdleCallback?: (f: () => void) => void }).requestIdleCallback ?? ((f: () => void) => setTimeout(f, 60));
    idle(() => {
      const style = STYLES[s.styleId];
      player.warm(allPadMidis(s.padKey), style.padVoice);
      if (rehearsed === style.id) return;
      rehearsed = style.id;
      // a throwaway piece in this world shows which drums, bells and strings a real one will need;
      // they are synthesized in the background now, so the forge has nothing left to wait for
      const demo = compose({ notes: inspire(7, s.padKey.tonicPc, s.padKey.mode), styleId: style.id, seed: 7, length: s.length, intensity: s.intensity, key: s.padKey });
      player.prewarm(style, demo.events);
    });
  };
  const savePrefs = () => {
    const s = get();
    writeJson(PREF_KEY, { styleId: s.styleId, length: s.length, intensity: s.intensity, volume: s.volume, kbTarget: s.kbTarget });
  };

  return {
    styleId: 'titan',
    motif: [],
    capture: true,
    length: 'standard',
    intensity: 0.8,
    seed: 1,
    padKey: { tonicPc: 2, mode: 'aeolian' },
    keyLocked: false,
    kbTarget: 'pads',
    octave: 4,
    held: {},

    score: null,
    phase: 'idle',
    steps: [],
    stepAt: 0,
    loadP: 0,
    pending: null,
    forgeLine: '',

    playing: false,
    sectionIdx: 0,
    chordIdx: 0,
    loop: false,
    volume: 0.9,
    levels: each(1),
    mutes: each(false),

    cinema: false,
    toast: null,
    exp: { open: false, busy: false, p: 0, label: '', done: null, error: null },
    library: [],

    init() {
      if (wired) return;
      wired = true;
      const prefs = readJson<Partial<Pick<Studio, 'styleId' | 'length' | 'intensity' | 'volume' | 'kbTarget'>>>(PREF_KEY, {});
      const styleId = prefs.styleId && STYLES[prefs.styleId] ? prefs.styleId : 'titan';
      const style = STYLES[styleId];
      const volume = typeof prefs.volume === 'number' ? Math.max(0, Math.min(1, prefs.volume)) : 0.9;
      player.style = style;
      player.volume = volume;
      set({
        styleId,
        length: prefs.length === 'short' || prefs.length === 'extended' ? prefs.length : 'standard',
        intensity: typeof prefs.intensity === 'number' ? Math.max(0, Math.min(1, prefs.intensity)) : 0.8,
        volume,
        kbTarget: prefs.kbTarget === 'piano' ? 'piano' : 'pads',
        padKey: { tonicPc: 2, mode: style.modes[0][0] },
        library: readJson<SavedPiece[]>(LIB_KEY, []).filter((p) => p && STYLES[p.styleId] && Array.isArray(p.notes)),
      });
      player.subscribe((e) => {
        if (e === 'state') set({ playing: player.playing });
        else if (e === 'section') set({ sectionIdx: Math.max(0, player.sectionIdx) });
        else if (e === 'chord') set({ chordIdx: Math.max(0, player.chordIdx) });
      });
      warm();
    },

    setWorld(id) {
      const s = get();
      const style = STYLES[id];
      if (!style || id === s.styleId || s.phase === 'forging') return;
      get().releaseAll();
      if (s.score) {
        // same motif, new world: let it be re-read in that world's own language
        set({ styleId: id });
        savePrefs();
        void get().forge('world');
        return;
      }
      player.setStyle(style);
      set({ styleId: id, padKey: s.motif.length || s.keyLocked ? s.padKey : { tonicPc: s.padKey.tonicPc, mode: style.modes[0][0] } });
      savePrefs();
      warm();
    },

    press(midi, vel = 0.88) {
      const s = get();
      if (s.held[midi]) return;
      player.noteOn('k' + midi, midi, vel, STYLES[s.styleId].padVoice);
      const next: Partial<Studio> = { held: { ...s.held, [midi]: true } };
      if (s.capture && s.phase !== 'forging') {
        if (s.motif.length < MAX_NOTES) next.motif = [...s.motif, midi];
        else get().say(`A motif holds ${MAX_NOTES} notes — forge it, or start a new one.`);
      }
      set(next);
    },

    release(midi) {
      const s = get();
      if (!s.held[midi]) return;
      player.noteOff('k' + midi);
      const held = { ...s.held };
      delete held[midi];
      set({ held });
    },

    releaseAll() {
      player.allNotesOff();
      if (Object.keys(get().held).length) set({ held: {} });
    },

    undo() {
      const s = get();
      if (!s.capture || !s.motif.length) return;
      set({ motif: s.motif.slice(0, -1) });
    },

    newMotif() {
      previewRun++;
      set({ motif: [], capture: true });
    },

    setCapture(on) {
      set({ capture: on });
    },

    inspireMe() {
      const s = get();
      if (s.phase === 'forging') return;
      set({ motif: inspire(rand(), s.padKey.tonicPc, s.padKey.mode), capture: true });
      get().previewMotif();
    },

    previewMotif() {
      const s = get();
      const notes = s.motif;
      if (!notes.length) return;
      const run = ++previewRun;
      const inst = STYLES[s.styleId].padVoice;
      const step = s.playing ? 0 : 230;
      if (!step) return;
      void (async () => {
        for (let i = 0; i < notes.length; i++) {
          if (run !== previewRun) return;
          const id = `pv${run}-${i}`;
          player.noteOn(id, notes[i], 0.8, inst);
          set({ held: { ...get().held, [notes[i]]: true } });
          await sleep(step);
          player.noteOff(id);
          const held = { ...get().held };
          delete held[notes[i]];
          set({ held });
        }
      })();
    },

    setPadKey(k) {
      const s = get();
      get().releaseAll();
      set({ padKey: { ...s.padKey, ...k }, keyLocked: true });
      warm();
    },

    setKeyLocked(on) {
      set({ keyLocked: on });
    },

    setLength(l) {
      set({ length: l });
      savePrefs();
    },

    setIntensity(v) {
      set({ intensity: v });
      savePrefs();
    },

    setKbTarget(t) {
      get().releaseAll();
      set({ kbTarget: t });
      savePrefs();
    },

    shiftOctave(d) {
      get().releaseAll();
      set({ octave: Math.max(2, Math.min(6, get().octave + d)) });
    },

    async forge(kind = 'new') {
      const s = get();
      if (s.phase === 'forging') return;
      previewRun++;
      const style = STYLES[s.styleId];
      const before = s.phase;
      try {
        player.ensure();
        get().releaseAll();
        let notes = s.motif;
        if (!notes.length) notes = inspire(rand(), s.padKey.tonicPc, s.padKey.mode);
        const seed = kind === 'restore' ? s.seed : rand();
        const fits = notes.every((n) => inScale(n, s.padKey));
        const key = kind === 'restore' ? s.padKey : kind === 'new' && s.keyLocked && fits ? s.padKey : null;
        const t0 = performance.now();
        const score = compose({ notes, styleId: style.id, seed, length: s.length, intensity: s.intensity, key });
        const t1 = performance.now();
        forgeTiming.compose = t1 - t0;
        const count = score.events.length.toLocaleString('en-US');
        const steps: ForgeStep[] = [
          { label: 'Motif', detail: `${notes.length} note${notes.length === 1 ? '' : 's'} → ${score.keyName}` },
          { label: 'Theme', detail: 'motif · answer · return · cadence' },
          { label: 'Harmony', detail: score.progression },
          { label: 'Orchestration', detail: `${score.sections.length} movements · ${score.totalBars} bars · ${count} notes` },
          { label: 'Instruments', detail: `${style.name} · ${score.bpm} BPM · ${score.meter.label}` },
        ];
        const forgeLine = `Your ${notes.length === 1 ? 'note points' : `${notes.length} notes point`} to ${score.keyName}. ${score.sections.length} movements, ${score.totalBars} bars and ${count} notes over ${score.progression}.`;
        set({ phase: 'forging', steps, stepAt: 0, loadP: 0, pending: score, forgeLine, motif: notes, seed, playing: false });
        const loading = player.load(score, style, (p) => set({ loadP: p })).then(() => {
          forgeTiming.load = performance.now() - t1;
        });
        for (let i = 0; i < steps.length; i++) {
          set({ stepAt: i });
          player.pulse(i === 0 || i === steps.length - 1);
          // a flourish, not a wait: the title holds still, the steps tick past under it, and the
          // reasoning itself stays on screen in the Composer's Mind panel
          await sleep(kind === 'new' ? 120 : 60);
        }
        await loading;
        const padKey: PadKey = { tonicPc: score.tonicPc, mode: score.mode as ModeId };
        const piece: SavedPiece = {
          id: `${style.id}:${seed}:${notes.join('.')}:${s.length}:${Math.round(s.intensity * 100)}`,
          title: score.title,
          styleId: style.id,
          notes,
          seed,
          length: s.length,
          intensity: s.intensity,
          key: padKey,
          keyName: score.keyName,
          bpm: score.bpm,
          seconds: score.durationSec,
          at: Date.now(),
        };
        const library = [piece, ...get().library.filter((p) => p.id !== piece.id)].slice(0, 30);
        writeJson(LIB_KEY, library);
        set({ score, pending: null, phase: 'ready', padKey, capture: false, sectionIdx: 0, chordIdx: 0, library, stepAt: steps.length });
        warm();
        player.play(0);
        forgeTiming.total = performance.now() - t0;
      } catch (err) {
        console.error(err);
        set({ phase: before, pending: null });
        get().say('The forge stumbled — ' + (err instanceof Error ? err.message : 'please try again.'));
      }
    },

    toggle() {
      const s = get();
      if (s.phase === 'forging') return;
      if (!s.score) {
        void get().forge();
        return;
      }
      player.toggle();
    },

    seek(beat) {
      player.seek(beat);
    },

    jump(dir) {
      const s = get();
      if (!s.score) return;
      const secs = s.score.sections;
      const pos = player.position;
      let i = secs.findIndex((x) => pos < x.startBeat + x.beats);
      if (i < 0) i = secs.length - 1;
      if (dir < 0) {
        const into = pos - secs[i].startBeat;
        i = into > 2 || i === 0 ? i : i - 1;
      } else i = Math.min(secs.length - 1, i + 1);
      player.seek(secs[i].startBeat);
    },

    setLoop(on) {
      player.loop = on;
      set({ loop: on });
    },

    setVolume(v) {
      player.setVolume(v);
      set({ volume: v });
      savePrefs();
    },

    setLevel(bus, v) {
      player.setLevel(bus, v);
      set({ levels: { ...get().levels, [bus]: v } });
    },

    toggleMute(bus) {
      const m = !get().mutes[bus];
      player.setMute(bus, m);
      set({ mutes: { ...get().mutes, [bus]: m } });
    },

    setCinema(on) {
      set({ cinema: on });
    },

    say(msg) {
      window.clearTimeout(toastTimer);
      set({ toast: msg });
      toastTimer = window.setTimeout(() => set({ toast: null }), 3800);
    },

    openExport(open) {
      const e = get().exp;
      if (e.busy) return;
      set({ exp: { open, busy: false, p: 0, label: '', done: null, error: null } });
    },

    async download(format) {
      const s = get();
      if (!s.score || s.exp.busy) return;
      set({ exp: { open: true, busy: true, p: 0, label: 'Tuning the orchestra', done: null, error: null } });
      try {
        const done = await player.download(format, (p, label) => set({ exp: { ...get().exp, p, label } }));
        set({ exp: { open: true, busy: false, p: 1, label: 'Done', done, error: null } });
      } catch (err) {
        console.error(err);
        set({ exp: { open: true, busy: false, p: 0, label: '', done: null, error: err instanceof Error ? err.message : 'Export failed' } });
      }
    },

    openPiece(p) {
      const s = get();
      if (s.phase === 'forging' || !STYLES[p.styleId]) return;
      get().releaseAll();
      player.setStyle(STYLES[p.styleId]);
      set({ styleId: p.styleId, motif: p.notes, seed: p.seed, length: p.length, intensity: p.intensity, padKey: p.key, capture: false });
      void get().forge('restore');
    },

    removePiece(id) {
      const library = get().library.filter((p) => p.id !== id);
      writeJson(LIB_KEY, library);
      set({ library });
    },
  };
});
