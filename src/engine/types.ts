import type { Chord, ChordExt, ModeId, PoolId, ProgPool } from './theory';

// ───────────────────────────── instruments ─────────────────────────────

export const INSTRUMENTS = [
  // orchestra
  'strings', 'tremolo', 'spiccato', 'pizz', 'cello', 'violin', 'horns', 'trumpets', 'lowBrass',
  'choirAh', 'choirOo', 'choirLo', 'choirStac', 'soprano', 'piano', 'felt', 'harp', 'zither', 'bell', 'glock',
  'celesta', 'organ', 'flute', 'bamboo', 'timpani', 'braam',
  // synths
  'sub', 'synBass', 'reese', 'b808', 'sawPad', 'warmPad', 'superSaw', 'pluck', 'arp', 'lead', 'ePiano',
  'guitar', 'cowbell',
  // percussion & fx
  'taikoLo', 'taikoMid', 'taikoHi', 'boom', 'impact', 'snareOrch', 'stick', 'anvil', 'gong', 'crash',
  'swell', 'kick', 'kickDeep', 'kickSoft', 'snare', 'snareLofi', 'clap', 'rim', 'hat', 'hatOpen',
  'shaker', 'tick', 'riser', 'subDrop', 'vinyl',
] as const;
export type Inst = (typeof INSTRUMENTS)[number];

export const BUSES = ['melody', 'pad', 'ost', 'bass', 'choir', 'brass', 'drums', 'color', 'fx'] as const;
export type Bus = (typeof BUSES)[number];

export const BUS_LABEL: Record<Bus, string> = {
  melody: 'Melody',
  pad: 'Harmony',
  ost: 'Ostinato',
  bass: 'Bass',
  choir: 'Choir',
  brass: 'Brass',
  drums: 'Percussion',
  color: 'Colour',
  fx: 'Impacts & FX',
};

export const INST_LABEL: Record<Inst, string> = {
  strings: 'string section', tremolo: 'tremolo strings', spiccato: 'spiccato strings', pizz: 'pizzicato',
  cello: 'cellos', violin: 'solo violin', horns: 'French horns', trumpets: 'trumpets', lowBrass: 'low brass',
  choirAh: 'full choir', choirOo: 'hushed choir', choirLo: "men's choir", choirStac: 'choir chants', soprano: 'solo soprano',
  piano: 'grand piano', felt: 'felt piano', harp: 'harp', zither: 'zither', bell: 'cathedral bell',
  glock: 'glockenspiel', celesta: 'celesta', organ: 'pipe organ', flute: 'flute', bamboo: 'bamboo flute',
  timpani: 'timpani', braam: 'braam', sub: 'sub bass', synBass: 'synth bass', reese: 'reese bass',
  b808: '808', sawPad: 'analog pad', warmPad: 'warm pad', superSaw: 'supersaw', pluck: 'synth pluck',
  arp: 'arpeggiator', lead: 'lead synth', ePiano: 'electric piano', guitar: 'distorted guitars', cowbell: 'cowbell', taikoLo: 'taiko', taikoMid: 'taiko',
  taikoHi: 'taiko', boom: 'gran cassa', impact: 'impact', snareOrch: 'field snare', stick: 'sticks',
  anvil: 'anvil', gong: 'tam-tam', crash: 'cymbals', swell: 'cymbal swell', kick: 'kick', kickDeep: 'kick',
  kickSoft: 'kick', snare: 'snare', snareLofi: 'snare', clap: 'clap', rim: 'rimshot', hat: 'hi-hat',
  hatOpen: 'open hat', shaker: 'shaker', tick: 'clock tick', riser: 'riser', subDrop: 'sub drop', vinyl: 'vinyl dust',
};

// ───────────────────────────── score ─────────────────────────────

export interface NoteEv {
  /** start, in quarter-note beats from the top */
  t: number;
  /** duration in beats */
  d: number;
  i: Inst;
  /** midi pitch (ignored by unpitched percussion) */
  m: number;
  /** velocity 0..~1.1 */
  v: number;
  b: Bus;
  /** section index */
  s: number;
  /** pan -1..1 */
  p?: number;
  /** glide from this midi note */
  from?: number;
  /** articulation: 1 swell, 2 sforzando, 3 tremolo, 4 soft */
  a?: number;
  /** visual beat marker: 2 = heavy hit, 1 = light hit */
  vis?: 1 | 2;
}

export type SectionKind = 'intro' | 'theme' | 'build' | 'climax' | 'break' | 'finale' | 'outro';

export interface ChordAt {
  bar: number;
  beat: number;
  beats: number;
  name: string;
  roman: string;
  pcs: number[];
}

export interface Section {
  name: string;
  kind: SectionKind;
  startBar: number;
  bars: number;
  startBeat: number;
  beats: number;
  energy: number;
  /** semitone lift relative to the home key */
  lift: number;
  keyName: string;
  say: string[];
  /** instrument labels sounding in this section */
  voices: string[];
}

export interface MotifNote {
  pos: number;
  len: number;
  deg: number;
}

export interface DnaStrand {
  label: string;
  hint: string;
  span: number;
  notes: MotifNote[];
}

export interface Insight {
  title: string;
  body: string;
}

export interface MelodyNote {
  t: number;
  d: number;
  m: number;
}

export interface Meter {
  id: MeterId;
  label: string;
  /** quarter-note beats per bar */
  beats: number;
  /** sixteenth-note steps per bar */
  steps: number;
  /** eighth-note slots per bar */
  eighths: number;
  /** metric weight of each eighth slot */
  weights: number[];
}

export type MeterId = '4/4' | '3/4' | '6/8';

export const METERS: Record<MeterId, Meter> = {
  '4/4': { id: '4/4', label: '4/4', beats: 4, steps: 16, eighths: 8, weights: [1, 0.2, 0.55, 0.2, 0.8, 0.2, 0.55, 0.2] },
  '3/4': { id: '3/4', label: '3/4', beats: 3, steps: 12, eighths: 6, weights: [1, 0.2, 0.6, 0.2, 0.6, 0.2] },
  '6/8': { id: '6/8', label: '6/8', beats: 3, steps: 12, eighths: 6, weights: [1, 0.25, 0.35, 0.8, 0.25, 0.35] },
};

export interface Score {
  title: string;
  styleId: string;
  seed: number;
  bpm: number;
  meter: Meter;
  tonicPc: number;
  mode: ModeId;
  keyName: string;
  totalBars: number;
  totalBeats: number;
  /** musical length in seconds (without reverb tail) */
  musicSec: number;
  /** full length including tail */
  durationSec: number;
  sections: Section[];
  chords: ChordAt[];
  events: NoteEv[];
  melody: MelodyNote[];
  dna: DnaStrand[];
  insights: Insight[];
  /** the notes the user actually played (midi) */
  input: number[];
  /** home tonic midi the melody is written around */
  baseTonic: number;
  progression: string;
  origin?: Origin | null;
  /** Amplify: the imported recording plays under this score, untouched */
  song?: { name: string; seconds: number; rms: number } | null;
}

// ───────────────────────────── style presets ─────────────────────────────

export type MelForm = 'theme' | 'statement' | 'call' | 'response' | 'fragment' | 'augmented' | 'broad' | 'inverted' | 'loop' | 'sparse';

interface LayerBase {
  /** first bar (inclusive) inside the section */
  from?: number;
  /** last bar (exclusive) */
  to?: number;
  vel?: number;
  /** velocity ramp across the layer's span */
  cresc?: [number, number];
  bus?: Bus;
  /** only when the intensity dial is above half */
  x?: boolean;
  /** only on bars where bar % every === 0 */
  every?: number;
}
export interface MelLayer extends LayerBase {
  k: 'mel';
  inst: Inst;
  form: MelForm;
  oct?: number;
  dbl?: { inst: Inst; oct: number; vel?: number; bus?: Bus }[];
  /** detached instead of legato */
  detached?: boolean;
  /** grace-note ornaments */
  orn?: boolean;
}
export interface CounterLayer extends LayerBase {
  k: 'counter';
  inst: Inst;
  reg?: number;
}
export interface PadLayer extends LayerBase {
  k: 'pad';
  inst: Inst;
  reg?: number;
  n?: number;
  /** step pattern of re-attacks: X x o hit, - hold, . silence */
  pat?: string;
  art?: number;
  /** hold tonic + fifth regardless of the chords */
  pedal?: boolean;
  ext?: ChordExt;
}
export interface BassLayer extends LayerBase {
  k: 'bass';
  inst: Inst;
  /** 0 root, 1 octave, 5 fifth, - hold, . rest */
  pat: string;
  acc?: string;
  reg?: number;
  art?: number;
}
export interface OstLayer extends LayerBase {
  k: 'ost';
  inst: Inst;
  /** digits = chord-tone index, - hold, . rest, ? random sparkle */
  pat: string;
  acc?: string;
  reg?: number;
  /** let the moving notes follow the motif's contour */
  shape?: boolean;
  art?: number;
}
export interface DrumLayer extends LayerBase {
  k: 'drums';
  g: Partial<Record<Inst, string>>;
  fill?: Partial<Record<Inst, string>>;
  fillBars?: number;
}
export type Layer = MelLayer | CounterLayer | PadLayer | BassLayer | OstLayer | DrumLayer;

export type ExitFx = 'riser' | 'roll' | 'swell' | 'cut' | 'run' | 'gliss';
export type EnterFx = 'big' | 'hit' | 'drop' | 'soft' | 'none';

export interface SectionSpec {
  name: string;
  kind: SectionKind;
  bars: number;
  energy: number;
  prog?: 'A' | 'B' | 'pedal' | 'final';
  /** bars per chord */
  rate?: number;
  lift?: number;
  layers: Layer[];
  enter?: EnterFx;
  exit?: ExitFx[];
  say?: string;
  /** Build & Drop lands here: impact and sub drop on the downbeat */
  drop?: boolean;
}

export type Hit = readonly [Inst, number];

export interface StylePreset {
  id: string;
  name: string;
  genre: string;
  tagline: string;
  /** primary, secondary, deep */
  palette: [string, string, string];
  meter: MeterId;
  tempo: [number, number];
  modes: readonly (readonly [ModeId, number])[];
  /** 0 = on the beat, 1 = heavily syncopated motif rhythm */
  sync: number;
  chordExt: ChordExt;
  /** the voice the pads play live */
  padVoice: Inst;
  /** live notes below this MIDI note play a second voice instead (e.g. the men under the sopranos) */
  padLow?: { below: number; inst: Inst };
  reverb: { size: number; damp: number; wet: number; predelay: number };
  /** master tone tilt in dB */
  tilt: { low: number; high: number };
  /** tempo-synced delay */
  delay?: { beats: number; fb: number; mix: number };
  /** per-bus gain trims */
  mix?: Partial<Record<Bus, number>>;
  /** 0..0.33 — how late off-beat sixteenths land */
  swing?: number;
  humanize: number;
  /** sidechain depth applied to pad/ost/bass/melody buses on every kick */
  pump?: number;
  fx: {
    big: Hit[];
    hit: Hit[];
    drop: Hit[];
    roll: Inst;
    run?: Inst;
    gliss?: Inst;
    riser?: boolean;
  };
  titles: { a: string[]; b: string[]; join: string };
  progs?: Partial<Record<PoolId, ProgPool>>;
  form(len: PieceLength): SectionSpec[];
}

export type PieceLength = 'short' | 'standard' | 'extended';

export interface ComposeInput {
  notes: number[];
  styleId: string;
  seed: number;
  length: PieceLength;
  /** 0..1 */
  intensity: number;
  tempo?: number | null;
  key?: { tonicPc: number; mode: ModeId } | null;
  /** give every big arrival a build-up, a breath of silence and a drop */
  drop?: boolean;
  /** the notes were heard in an imported recording */
  origin?: Origin | null;
}

export interface Origin {
  /** file name as the user knows it */
  name: string;
  /** where in the recording the phrase was heard, in seconds */
  from: number;
  to: number;
  /** how many more times the phrase's shape came back in the recording */
  repeats?: number;
  /** the melody was hard to make out, so this is a best guess */
  loose?: boolean;
  /** the person chose this stretch of the recording themselves */
  asked?: boolean;
  /** each note's onset (seconds after the first) and length, exactly as played in the recording */
  rhythm?: [number, number][];
  /** the recording's tempo, so the melody can keep its own speed */
  bpm?: number;
  /** taken from a part of one of your own pieces (right-click on the timeline), not a recording */
  own?: boolean;
}

export type { Chord };
