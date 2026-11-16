import { create } from 'zustand';
import { player } from '@/engine/audio/player';
import { AMPLIFY_ID, composeBacking } from '@/engine/backing';
import type { SongMap } from '@/engine/beat';
import { compose, inspire } from '@/engine/composer';
import { STYLES } from '@/engine/styles';
import type { ModeId } from '@/engine/theory';
import { BUSES, type Bus, type Origin, type PieceLength, type Score, type StylePreset } from '@/engine/types';
import { fitRange, MAX_SECONDS, pickInWindow, type HeardNote, type Phrase, type Window } from '@/engine/listen';
import { mmss, noteNames, parseRequest } from '@/engine/request';
import { allPadMidis, inScale, type PadKey } from './keys';

export const MAX_NOTES = 16;

export interface ChatLine {
  who: 'you' | 'me';
  text: string;
}

const span = (p: { from: number; to: number }) => (mmss(p.from) === mmss(p.to) ? `at ${mmss(p.from)}` : `${mmss(p.from)}–${mmss(p.to)}`);
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
  drop?: boolean;
  origin?: Origin | null;
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
  /** exporting one part of the piece only (beats, and its name) */
  part: ExportPart | null;
}

export interface ExportPart {
  idx: number;
  name: string;
  /** beats */
  from: number;
  to: number;
}

type ForgeKind = 'new' | 'world' | 'restore';

interface Studio {
  styleId: string;
  motif: number[];
  /** pads write into the motif while this is on; off = jam over the piece */
  capture: boolean;
  length: PieceLength;
  intensity: number;
  /** add a build-up and a drop before every big arrival */
  drop: boolean;
  /** the motif was heard in an imported recording (cleared as soon as the motif is edited) */
  origin: Origin | null;
  /** the phrases heard in the last imported recording, to try another */
  heard: { name: string; phrases: Phrase[]; idx: number; line: HeardNote[]; seconds: number } | null;
  /** talking to the composer about the imported song */
  chat: ChatLine[];
  /** an import in progress */
  importing: { p: number; label: string } | null;
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
  setDrop(on: boolean): void;
  importFile(file: File): Promise<void>;
  nextPhrase(): void;
  /** a request in plain words about the imported song; answers in the chat */
  tell(text: string): void;
  reply(text: string): void;
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
  /** open the export; with a section index, for that part of the piece only */
  openExport(open: boolean, part?: number): void;
  download(format: 'mp3' | 'wav'): Promise<void>;
  /** where a part of the piece ends, in beats (the next part's start, or the end of the piece) */
  partSpan(idx: number): { from: number; to: number } | null;
  /** put the lead line of one part of the piece on the JAM pads, rhythm and all, ready to forge */
  sectionToJam(idx: number): void;
  openPiece(p: SavedPiece): void;
  removePiece(id: string): void;
}

/** how long the last forge spent where, in ms (diagnostics) */
export const forgeTiming = { compose: 0, load: 0, total: 0 };

let rehearsed = '';
/** the voice a live note plays in this world: some worlds split the keyboard into a low and a high voice */
const voiceAt = (style: StylePreset, midi: number) => (style.padLow && midi < style.padLow.below ? style.padLow.inst : style.padVoice);
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

/** the last song imported, at full quality, for Amplify to play (kept in memory only) */
let lastSong: { name: string; buf: AudioBuffer; map: SongMap; tune: number } | null = null;

let toastTimer = 0;
let previewRun = 0;
let wired = false;

export const useStudio = create<Studio>()((set, get) => {
  const warm = () => {
    const s = get();
    const idle = (window as unknown as { requestIdleCallback?: (f: () => void) => void }).requestIdleCallback ?? ((f: () => void) => setTimeout(f, 60));
    idle(() => {
      const style = STYLES[s.styleId];
      const pads = allPadMidis(s.padKey);
      player.warm(pads.filter((m) => voiceAt(style, m) === style.padVoice), style.padVoice);
      if (style.padLow) player.warm(pads.filter((m) => m < style.padLow!.below), style.padLow.inst);
      // Amplify's layer is written from the song; its few drums are prepared when it loads
      if (style.id === AMPLIFY_ID) return;
      const rehearsal = `${style.id}:${s.drop}`;
      if (rehearsed === rehearsal) return;
      rehearsed = rehearsal;
      // a throwaway piece in this world shows which drums, bells and strings a real one will need;
      // they are synthesized in the background now, so the forge has nothing left to wait for
      const demo = compose({ notes: inspire(7, s.padKey.tonicPc, s.padKey.mode), styleId: style.id, seed: 7, length: s.length, intensity: s.intensity, drop: s.drop, key: s.padKey });
      player.prewarm(style, demo.events);
    });
  };
  const savePrefs = () => {
    const s = get();
    writeJson(PREF_KEY, { styleId: s.styleId, length: s.length, intensity: s.intensity, drop: s.drop, volume: s.volume, kbTarget: s.kbTarget });
  };

  /** put a heard phrase on the pads and build a piece from it */
  const applyPhrase = (ph: Phrase, idx: number, asked: boolean) => {
    const h = get().heard;
    if (!h) return;
    // the composer finds the key from these notes; a hand-picked key would fight the recording
    set({
      heard: { ...h, idx },
      motif: fitRange(ph.notes).slice(0, MAX_NOTES),
      origin: {
        name: h.name,
        from: ph.from,
        to: ph.to,
        repeats: asked ? undefined : ph.repeats,
        loose: ph.loose,
        asked: asked || undefined,
        rhythm: ph.rhythm?.slice(0, MAX_NOTES),
        bpm: lastSong?.map.bpm ? Math.round(lastSong.map.bpm * 10) / 10 : undefined,
      },
      capture: true,
      keyLocked: false,
    });
    void get().forge('new');
  };

  /** Amplify: the imported recording, untouched, with a layer written from its beats under it */
  const amplify = async (kind: ForgeKind) => {
    const s = get();
    const style = STYLES[AMPLIFY_ID];
    const song = lastSong;
    if (!song) {
      get().say('Amplify plays a song you import and makes it bigger. Import one (the Import button, or drop a file on the page).');
      return;
    }
    const before = s.phase;
    try {
      player.ensure();
      get().releaseAll();
      const seed = kind === 'restore' ? s.seed : rand();
      const t0 = performance.now();
      const score = composeBacking({ map: song.map, name: song.name, seed, intensity: s.intensity, tune: song.tune, songSeconds: song.buf.duration });
      const m = song.map;
      const steps: ForgeStep[] = [
        { label: 'Song', detail: `${song.name} · ${mmss(m.seconds)}` },
        { label: 'Beat', detail: `${score.bpm} BPM · ${score.totalBars} bars` },
        { label: 'Drone', detail: score.song && score.events.some((e) => e.i === 'strings') ? score.progression : 'none: drums only' },
        { label: 'Layer', detail: score.sections.map((x) => x.name).join(' · ') },
        { label: 'Mix', detail: 'your song untouched, the layer under it' },
      ];
      const forgeLine = `Your song plays as it is. Under it: ${score.events.length.toLocaleString('en-US')} hits and held notes on its own beat, ${score.progression.toLowerCase()}.`;
      set({ phase: 'forging', steps, stepAt: 0, loadP: 0, pending: score, forgeLine, seed, playing: false });
      player.setSong(song.buf);
      const loading = player.load(score, style, (p) => set({ loadP: p }));
      for (let i = 0; i < steps.length; i++) {
        set({ stepAt: i });
        player.pulse(i === 0 || i === steps.length - 1);
        await sleep(kind === 'new' ? 120 : 60);
      }
      await loading;
      // not saved to the library: the recording itself is only kept until the page reloads
      set({ score, pending: null, phase: 'ready', capture: false, sectionIdx: 0, chordIdx: 0, stepAt: steps.length });
      player.play(0);
      forgeTiming.total = performance.now() - t0;
    } catch (err) {
      console.error(err);
      set({ phase: before, pending: null });
      get().say('The forge stumbled — ' + (err instanceof Error ? err.message : 'please try again.'));
    }
  };

  return {
    styleId: 'titan',
    motif: [],
    capture: true,
    length: 'standard',
    intensity: 0.8,
    drop: false,
    origin: null,
    heard: null,
    chat: [],
    importing: null,
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
    exp: { open: false, busy: false, p: 0, label: '', done: null, error: null, part: null },
    library: [],

    init() {
      if (wired) return;
      wired = true;
      const prefs = readJson<Partial<Pick<Studio, 'styleId' | 'length' | 'intensity' | 'drop' | 'volume' | 'kbTarget'>>>(PREF_KEY, {});
      const styleId = prefs.styleId && STYLES[prefs.styleId] ? prefs.styleId : 'titan';
      const style = STYLES[styleId];
      const volume = typeof prefs.volume === 'number' ? Math.max(0, Math.min(1, prefs.volume)) : 0.9;
      player.style = style;
      player.volume = volume;
      set({
        styleId,
        length: prefs.length === 'short' || prefs.length === 'extended' ? prefs.length : 'standard',
        intensity: typeof prefs.intensity === 'number' ? Math.max(0, Math.min(1, prefs.intensity)) : 0.8,
        drop: prefs.drop === true,
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
      if (!style || id === s.styleId || s.phase === 'forging' || s.importing) return;
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
      player.noteOn('k' + midi, midi, vel, voiceAt(STYLES[s.styleId], midi));
      const next: Partial<Studio> = { held: { ...s.held, [midi]: true } };
      if (s.capture && s.phase !== 'forging') {
        if (s.motif.length < MAX_NOTES) {
          next.motif = [...s.motif, midi];
          next.origin = null;
        }
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
      set({ motif: s.motif.slice(0, -1), origin: null });
    },

    newMotif() {
      previewRun++;
      set({ motif: [], capture: true, origin: null });
    },

    setCapture(on) {
      set({ capture: on });
    },

    inspireMe() {
      const s = get();
      if (s.phase === 'forging') return;
      set({ motif: inspire(rand(), s.padKey.tonicPc, s.padKey.mode), capture: true, origin: null });
      get().previewMotif();
    },

    previewMotif() {
      const s = get();
      const notes = s.motif;
      if (!notes.length) return;
      const run = ++previewRun;
      const style = STYLES[s.styleId];
      const step = s.playing ? 0 : 230;
      if (!step) return;
      void (async () => {
        for (let i = 0; i < notes.length; i++) {
          if (run !== previewRun) return;
          const id = `pv${run}-${i}`;
          player.noteOn(id, notes[i], 0.8, voiceAt(style, notes[i]));
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
      const s = get();
      if (l === s.length) return;
      set({ length: l });
      savePrefs();
      // the same melody at the new length, straight away (Amplify is as long as the song)
      if (s.score && s.phase !== 'forging' && !s.importing && s.styleId !== AMPLIFY_ID) void get().forge('new');
    },

    setIntensity(v) {
      set({ intensity: v });
      savePrefs();
    },

    setDrop(on) {
      const s = get();
      if (s.phase === 'forging' || on === s.drop) return;
      set({ drop: on });
      savePrefs();
      // a piece is already playing: rewrite it with the same notes and seed, now with (or without) its drops
      if (s.score) void get().forge('restore');
      else warm();
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
      if (s.phase === 'forging' || s.importing) return;
      previewRun++;
      const style = STYLES[s.styleId];
      const before = s.phase;
      if (style.id === AMPLIFY_ID) return amplify(kind);
      try {
        player.ensure();
        get().releaseAll();
        let notes = s.motif;
        const origin = notes.length ? s.origin : null;
        if (!notes.length) notes = inspire(rand(), s.padKey.tonicPc, s.padKey.mode);
        const seed = kind === 'restore' ? s.seed : rand();
        const fits = notes.every((n) => inScale(n, s.padKey));
        const key = kind === 'restore' ? s.padKey : kind === 'new' && s.keyLocked && fits ? s.padKey : null;
        const t0 = performance.now();
        const score = compose({ notes, styleId: style.id, seed, length: s.length, intensity: s.intensity, drop: s.drop, key, origin });
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
          id: `${style.id}:${seed}:${notes.join('.')}:${s.length}:${Math.round(s.intensity * 100)}${s.drop ? ':drop' : ''}`,
          title: score.title,
          styleId: style.id,
          notes,
          seed,
          length: s.length,
          intensity: s.intensity,
          drop: s.drop,
          origin,
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

    async importFile(file) {
      const s = get();
      if (s.phase === 'forging' || s.importing) return;
      previewRun++;
      get().releaseAll();
      set({ importing: { p: 0, label: 'Reading the file' } });
      try {
        player.ensure();
        const { hearFile } = await import('@/engine/audio/hear');
        const { heard, audio } = await hearFile(file, (p, label) => set({ importing: { p, label } }));
        set({ importing: null });
        const name = file.name.replace(/\.[a-z0-9]+$/i, '');
        lastSong = heard.map ? { name, buf: audio, map: heard.map, tune: heard.tune ?? 0 } : null;
        const amp = get().styleId === AMPLIFY_ID;
        if (amp && !lastSong) {
          get().say(`I couldn't find a beat in ${file.name} to play along with. A song with drums or a steady pulse works best.`);
          return;
        }
        if (!heard.phrases.length) {
          if (amp) {
            set({ heard: null, chat: [], motif: [], origin: null });
            void get().forge('new');
            return;
          }
          get().say(`I couldn't hear a clear melody in ${file.name}. A song with a clear lead or vocal line works best${lastSong ? ' — or pick Amplify to play the song itself with an epic layer under it' : ''}.`);
          return;
        }
        set({ heard: { name, phrases: heard.phrases, idx: -1, line: heard.line, seconds: heard.seconds }, chat: [] });
        // in Amplify this builds the layer under the song; the phrase is kept for switching modes later
        get().nextPhrase();
        if (amp) {
          get().reply(`Playing ${name} exactly as it is, with a layer of drums, a low drone and impacts under it that follows its beat. Switch to another mode (say “make it Titan”) and I’ll build a new piece from its melody instead.`);
          return;
        }
        const first = heard.phrases[0];
        const n = heard.phrases.length;
        get().reply(
          `I listened to ${name} (${mmss(heard.seconds)}) and found ${n} phrase${n === 1 ? '' : 's'} I could use. I started with the ${first.loose ? 'clearest guess' : 'strongest one'}, ${span(first)}. Tell me which part of the song to take the melody from instead, like “use 1:20 to 1:35” or “something near the end”.`,
        );
        if (heard.phrases[0].loose) get().say(`The melody in ${file.name} was hard to hear clearly, so this is a best guess. A song with a clear lead or vocal line works best.`);
      } catch (err) {
        // the reason is shown to the person; nothing else to report
        set({ importing: null });
        get().say(err instanceof Error ? err.message : 'That file could not be read.');
      }
    },

    nextPhrase() {
      const s = get();
      if (!s.heard || s.phase === 'forging') return;
      const n = s.heard.phrases.length;
      const now = s.motif.join();
      // skip a phrase that is the one already playing (a stretch picked in the chat can match one)
      let idx = (s.heard.idx + 1) % n;
      for (let k = 0; k < n - 1 && fitRange(s.heard.phrases[idx].notes).slice(0, MAX_NOTES).join() === now; k++) idx = (idx + 1) % n;
      applyPhrase(s.heard.phrases[idx], idx, false);
    },

    tell(text) {
      const s = get();
      const said = text.trim();
      if (!said) return;
      set({ chat: [...s.chat, { who: 'you' as const, text: said }].slice(-40) });
      const reply = get().reply;
      if (s.phase === 'forging' || s.importing) return reply('One moment, I’m still working on the last change. Ask again when it’s done.');
      const h = s.heard;
      if (!h) return reply('Import a song first (the Import button, or drop a file on the page), then tell me which part to take the melody from.');
      const r = parseRequest(said, { seconds: h.seconds, styles: Object.values(STYLES).map((x) => ({ id: x.id, name: x.name })) });
      if (s.styleId === AMPLIFY_ID && r.kind !== 'style') {
        if (r.kind === 'again') {
          void get().forge('new');
          return reply('Rebuilding the layer. It follows your song’s beat and loudness, so it comes out much the same each time; turn Intensity up or down first to change how much of it there is.');
        }
        return reply(`In Amplify your song plays exactly as it is, so there’s no melody to pick from it. Switch to another mode (say “make it Titan”) and I’ll build a piece from part of ${h.name}; then you can tell me which part.`);
      }
      const cur = s.origin;
      const take = (from: number, to: number, size?: number, why = '', more: Partial<Window> = {}) => {
        const ph = pickInWindow(h.line, { from, to, size, ...more });
        if (!ph) return reply(`I couldn’t hear any melody between ${mmss(from)} and ${mmss(to)}. It may be quiet or only drums there, so try another stretch.`);
        const n = s.motif.length;
        if (more.min && ph.notes.length <= n) return reply(`I couldn’t find a longer phrase around ${span(cur!)}; the melody breaks up there. Give me a wider stretch instead, like “use ${mmss(Math.max(0, cur!.from - 5))} to ${mmss(Math.min(h.seconds, cur!.to + 10))}”.`);
        if (more.max && ph.notes.length >= n) return reply(`I couldn’t find a shorter phrase around ${span(cur!)}.`);
        applyPhrase(ph, h.idx, true);
        reply(
          `${why}Took ${ph.notes.length} notes from ${span(ph)}: ${noteNames(ph.notes)}.${ph.loose ? ' The melody is hard to make out there, so this is a best guess.' : ''} Rebuilding the piece in ${STYLES[get().styleId].name} around them.`,
        );
      };
      switch (r.kind) {
        case 'window':
          return take(r.from, r.to, r.size);
        case 'past-end':
          return reply(
            h.seconds >= MAX_SECONDS - 1
              ? `I only listened to the first ${mmss(h.seconds)} of ${h.name}, so I can’t reach ${mmss(r.at)}. Pick a time before that.`
              : `${h.name} is only ${mmss(h.seconds)} long, so there’s nothing at ${mmss(r.at)}. Pick a time before that.`,
          );
        case 'shift': {
          if (!cur) return reply('Tell me a time to start from first, like “use 1:20 to 1:35”.');
          if (r.dir < 0) {
            if (cur.from < 1.5) return reply('This phrase is already at the very start of the song.');
            return take(Math.max(0, cur.from - 15), cur.from - 0.2, undefined, 'Going earlier. ');
          }
          if (cur.to > h.seconds - 1.5) return reply('This phrase is already at the very end of what I heard.');
          return take(cur.to + 0.2, Math.min(h.seconds, cur.to + 15), undefined, 'Going later. ');
        }
        case 'size': {
          if (!cur) return reply('Pick a stretch of the song first, like “use 1:20 to 1:35”.');
          const longer = r.size > 8;
          const n = s.motif.length;
          if (!longer && n <= 3) return reply(`This phrase is only ${n} notes already.`);
          if (longer && n >= MAX_NOTES) return reply(`This phrase already has the most notes a motif can hold (${MAX_NOTES}).`);
          const pad = longer ? 4 : 0.5;
          return take(Math.max(0, cur.from - pad), Math.min(h.seconds, cur.to + pad), r.size, longer ? 'A longer phrase from about the same spot. ' : 'A shorter phrase from the same spot. ', longer ? { min: n + 1 } : { max: n - 1 });
        }
        case 'next': {
          if (h.phrases.length < 2) return reply('I only found one clear phrase on my own. Give me a time instead, like “use 1:20 to 1:35”.');
          get().nextPhrase();
          const i = get().heard!.idx;
          return reply(`Trying phrase ${i + 1} of ${h.phrases.length}, ${span(h.phrases[i])}.`);
        }
        case 'option': {
          if (r.n < 1 || r.n > h.phrases.length) return reply(`I have phrases 1 to ${h.phrases.length}. Say “list” to see them.`);
          applyPhrase(h.phrases[r.n - 1], r.n - 1, false);
          return reply(`Using phrase ${r.n}, ${span(h.phrases[r.n - 1])}.`);
        }
        case 'reset':
          applyPhrase(h.phrases[0], 0, false);
          return reply(`Back to my first pick, ${span(h.phrases[0])}.`);
        case 'list':
          return reply(
            `Phrases I found in ${h.name}: ` +
              h.phrases.map((p, i) => `${i + 1}) ${span(p)}, ${p.notes.length} notes${i === h.idx && cur && !cur.asked ? ' (playing)' : ''}`).join(' · ') +
              '. Say “option 2” to use one, or give me any time.',
          );
        case 'again':
          if (!s.motif.length) return reply('There’s no melody to rebuild yet. Give me a time to take it from.');
          void get().forge('new');
          return reply('Same melody, new arrangement.');
        case 'style':
          if (r.id === s.styleId) return reply(`It’s already in ${STYLES[r.id].name}.`);
          get().setWorld(r.id);
          return reply(`Rebuilding the same melody in ${STYLES[r.id].name}.`);
        case 'sections':
          return reply('I can’t tell verses from choruses yet. Give me a time instead, like “use 1:20 to 1:35” or “the last 30 seconds”.');
        default:
          return reply(
            'I can take the melody from any part of the song. Try “use 1:20 to 1:35”, “around 2:05”, “the first 30 seconds”, “later”, “earlier”, “longer”, “shorter”, “another one”, “list”, “option 3”, “go back”, “new arrangement”, or a mode name like “make it Phantom”.',
          );
      }
    },

    reply(text) {
      set({ chat: [...get().chat, { who: 'me' as const, text }].slice(-40) });
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

    openExport(open, part) {
      const e = get().exp;
      if (e.busy) return;
      const sc = get().score;
      const span = open && part !== undefined ? get().partSpan(part) : null;
      const p: ExportPart | null = span && sc ? { idx: part!, name: sc.sections[part!].name, ...span } : null;
      set({ exp: { open, busy: false, p: 0, label: '', done: null, error: null, part: p } });
    },

    async download(format) {
      const s = get();
      if (!s.score || s.exp.busy) return;
      const part = s.exp.part;
      set({ exp: { open: true, busy: true, p: 0, label: 'Tuning the orchestra', done: null, error: null, part } });
      try {
        const done = await player.download(format, (p, label) => set({ exp: { ...get().exp, p, label } }), part ?? undefined);
        set({ exp: { open: true, busy: false, p: 1, label: 'Done', done, error: null, part } });
      } catch (err) {
        console.error(err);
        set({ exp: { open: true, busy: false, p: 0, label: '', done: null, error: err instanceof Error ? err.message : 'Export failed', part } });
      }
    },

    partSpan(idx) {
      const sc = get().score;
      const sec = sc?.sections[idx];
      if (!sc || !sec) return null;
      const end = sc.sections[idx + 1]?.startBeat ?? sc.durationSec / (60 / sc.bpm);
      return { from: sec.startBeat, to: end };
    },

    sectionToJam(idx) {
      const s = get();
      const sc = s.score;
      const sec = sc?.sections[idx];
      if (!sc || !sec || s.phase === 'forging') return;
      if (sc.song) return get().say('In Amplify the music is your recording — import it in another mode to take its melody.');
      const span = get().partSpan(idx)!;
      const spb = 60 / sc.bpm;
      // the lead line of this part, one note per onset (the highest, if two start together)
      const line: { t: number; d: number; m: number }[] = [];
      for (const n of sc.melody) {
        if (n.t < span.from - 1e-6 || n.t >= span.to - 1e-6) continue;
        const last = line[line.length - 1];
        if (last && Math.abs(last.t - n.t) < 1e-3) {
          if (n.m > last.m) line[line.length - 1] = n;
        } else line.push(n);
      }
      line.sort((a, b) => a.t - b.t);
      // its opening phrase: up to a motif's worth of notes within four bars
      const bar = sec.beats / Math.max(1, sec.bars);
      const phrase = line.filter((n) => n.t < (line[0]?.t ?? 0) + 4 * bar).slice(0, MAX_NOTES);
      if (phrase.length < 2) return get().say(`There’s no melody in ${sec.name} to take — try a part where the tune plays.`);
      const t0 = phrase[0].t;
      const r3 = (x: number) => Math.round(x * 1000) / 1000;
      const last = phrase[phrase.length - 1];
      previewRun++;
      set({
        motif: fitRange(phrase.map((n) => n.m)),
        origin: {
          name: `${sc.title} · ${sec.name}`,
          from: r3(t0 * spb),
          to: r3((last.t + last.d) * spb),
          rhythm: phrase.map((n) => [r3((n.t - t0) * spb), r3(n.d * spb)] as [number, number]),
          bpm: sc.bpm,
          own: true,
        },
        capture: true,
        keyLocked: false,
      });
      get().say(`${phrase.length} notes from ${sec.name} are on the JAM pads, rhythm and all. Pick a mode and FORGE to build a new piece from them.`);
    },

    openPiece(p) {
      const s = get();
      if (s.phase === 'forging' || !STYLES[p.styleId]) return;
      get().releaseAll();
      player.setStyle(STYLES[p.styleId]);
      set({ styleId: p.styleId, motif: p.notes, seed: p.seed, length: p.length, intensity: p.intensity, drop: p.drop === true, origin: p.origin ?? null, padKey: p.key, capture: false });
      void get().forge('restore');
    },

    removePiece(id) {
      const library = get().library.filter((p) => p.id !== id);
      writeJson(LIB_KEY, library);
      set({ library });
    },
  };
});
