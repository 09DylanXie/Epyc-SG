/** Music theory primitives: scales, chords, key detection, voicing. Pure, no DOM. */

export const PC_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'] as const;

export const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
export const pcOf = (m: number) => ((m % 12) + 12) % 12;
export const midiName = (m: number) => `${PC_NAMES[pcOf(m)]}${Math.floor(m / 12) - 1}`;

export type ModeId =
  | 'aeolian'
  | 'harmonic'
  | 'phrygian'
  | 'dorian'
  | 'ionian'
  | 'mixolydian'
  | 'lydian'
  | 'minorPent'
  | 'majorPent'
  | 'hirajoshi';

export type PoolId = 'aeolian' | 'harmonic' | 'phrygian' | 'dorian' | 'ionian' | 'mixolydian' | 'lydian';

export interface ModeDef {
  id: ModeId;
  name: string;
  /** melodic pitch set (what the pads and the melody snap to) */
  scale: number[];
  /** seven-note parent used for harmony */
  parent: number[];
  family: 'minor' | 'major';
  pool: PoolId;
  mood: string;
}

const AEO = [0, 2, 3, 5, 7, 8, 10];
const ION = [0, 2, 4, 5, 7, 9, 11];

export const MODES: Record<ModeId, ModeDef> = {
  aeolian: { id: 'aeolian', name: 'minor', scale: AEO, parent: AEO, family: 'minor', pool: 'aeolian', mood: 'dark and heroic' },
  harmonic: { id: 'harmonic', name: 'harmonic minor', scale: [0, 2, 3, 5, 7, 8, 11], parent: [0, 2, 3, 5, 7, 8, 11], family: 'minor', pool: 'harmonic', mood: 'gothic and dramatic' },
  phrygian: { id: 'phrygian', name: 'Phrygian', scale: [0, 1, 3, 5, 7, 8, 10], parent: [0, 1, 3, 5, 7, 8, 10], family: 'minor', pool: 'phrygian', mood: 'ominous and ancient' },
  dorian: { id: 'dorian', name: 'Dorian', scale: [0, 2, 3, 5, 7, 9, 10], parent: [0, 2, 3, 5, 7, 9, 10], family: 'minor', pool: 'dorian', mood: 'noble and bittersweet' },
  ionian: { id: 'ionian', name: 'major', scale: ION, parent: ION, family: 'major', pool: 'ionian', mood: 'bright and triumphant' },
  mixolydian: { id: 'mixolydian', name: 'Mixolydian', scale: [0, 2, 4, 5, 7, 9, 10], parent: [0, 2, 4, 5, 7, 9, 10], family: 'major', pool: 'mixolydian', mood: 'bold and adventurous' },
  lydian: { id: 'lydian', name: 'Lydian', scale: [0, 2, 4, 6, 7, 9, 11], parent: [0, 2, 4, 6, 7, 9, 11], family: 'major', pool: 'lydian', mood: 'weightless and wondrous' },
  minorPent: { id: 'minorPent', name: 'minor pentatonic', scale: [0, 3, 5, 7, 10], parent: AEO, family: 'minor', pool: 'aeolian', mood: 'earthy and strong' },
  majorPent: { id: 'majorPent', name: 'major pentatonic', scale: [0, 2, 4, 7, 9], parent: ION, family: 'major', pool: 'ionian', mood: 'open and luminous' },
  hirajoshi: { id: 'hirajoshi', name: 'Hirajōshi', scale: [0, 2, 3, 7, 8], parent: AEO, family: 'minor', pool: 'aeolian', mood: 'austere and ancient' },
};

// ───────────────────────────── chords ─────────────────────────────

export type Quality = 'maj' | 'min' | 'dim' | 'aug' | 'sus' | 'pow';
export interface Chord {
  /** semitones above the tonic, 0–11 */
  root: number;
  q: Quality;
  roman: string;
}

const NUMERAL: Record<string, number> = { I: 0, II: 2, III: 4, IV: 5, V: 7, VI: 9, VII: 11 };
const TRIAD: Record<Quality, number[]> = {
  maj: [0, 4, 7],
  min: [0, 3, 7],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  sus: [0, 5, 7],
  pow: [0, 7],
};
const SUFFIX: Record<Quality, string> = { maj: '', min: 'm', dim: '°', aug: '+', sus: 'sus4', pow: '5' };

/** Roman numerals are written against the major scale: bVI is always 8 semitones up. */
export function parseRoman(sym: string): Chord {
  const m = /^(b|#)?([IViv]+)(°|\+|sus|5)?$/.exec(sym);
  if (!m) throw new Error(`bad roman numeral: ${sym}`);
  const acc = m[1] === 'b' ? -1 : m[1] === '#' ? 1 : 0;
  const upper = m[2] === m[2].toUpperCase();
  const base = NUMERAL[m[2].toUpperCase()];
  if (base === undefined) throw new Error(`bad roman numeral: ${sym}`);
  let q: Quality = upper ? 'maj' : 'min';
  if (m[3] === '°') q = 'dim';
  else if (m[3] === '+') q = 'aug';
  else if (m[3] === 'sus') q = 'sus';
  else if (m[3] === '5') q = 'pow';
  return { root: (base + acc + 12) % 12, q, roman: sym };
}

export const parseProg = (s: string): Chord[] => s.trim().split(/\s+/).map(parseRoman);

export const triadOf = (ch: Chord) => TRIAD[ch.q];

/** absolute pitch classes of the triad */
export function chordPcs(ch: Chord, tonicPc: number): number[] {
  return TRIAD[ch.q].map((i) => (tonicPc + ch.root + i) % 12);
}

export function chordLabel(ch: Chord, tonicPc: number): string {
  return PC_NAMES[(tonicPc + ch.root) % 12] + SUFFIX[ch.q];
}

/** pretty roman numeral: ♭ instead of b */
export const prettyRoman = (r: string) => r.replace(/^b/, '♭').replace(/^#/, '♯');

export type ChordExt = 'triad' | 'power' | 'add9' | 'seventh' | 'ninth';

/** intervals from the chord root, with a style-dependent extension that stays inside the parent scale */
export function chordIntervals(ch: Chord, ext: ChordExt, parent: number[]): number[] {
  const tri = TRIAD[ch.q];
  const inScale = (semi: number) => parent.includes((ch.root + semi) % 12);
  if (ext === 'power') return ch.q === 'dim' ? tri : [0, 7];
  if (ext === 'triad' || ch.q === 'pow') return tri;
  const out = [...tri];
  if (ext === 'seventh' || ext === 'ninth') {
    if (ch.q === 'dim') out.push(inScale(10) ? 10 : 9);
    else if (ch.q === 'maj') out.push(inScale(11) && !inScale(10) ? 11 : inScale(10) ? 10 : 11);
    else out.push(10);
  }
  if ((ext === 'add9' || ext === 'ninth') && ch.q !== 'dim' && inScale(2)) out.push(14);
  return out;
}

// ─────────────────────────── progressions ───────────────────────────

export interface ProgPool {
  A: string[];
  B: string[];
  /** two chords that drive into the final tonic */
  cadence: string;
  tonic: string;
}

export const PROGS: Record<PoolId, ProgPool> = {
  aeolian: {
    A: ['i bVI bIII bVII', 'i bVII bVI bVII', 'i iv bVI bVII', 'i bIII bVII iv', 'i v bVI bVII', 'i bVI iv bVII', 'i bVI bVII v', 'i bVII bIII bVI'],
    B: ['bVI bIII bVII i', 'iv bVI bIII bVII', 'bVI bVII i bIII', 'iv i bVI bVII', 'bIII bVII iv bVI'],
    cadence: 'bVI bVII',
    tonic: 'i',
  },
  harmonic: {
    A: ['i iv V i', 'i bVI iv V', 'i bVII bVI V', 'i iv bVI V', 'i bVI ii° V', 'i V bVI iv'],
    B: ['iv i V i', 'bVI iv ii° V', 'iv bVI V V', 'bVI V i V'],
    cadence: 'iv V',
    tonic: 'i',
  },
  phrygian: {
    A: ['i bII i bvii', 'i bII bIII bII', 'i bvii bVI bII', 'i bII bvii i', 'i iv bII i'],
    B: ['bVI bII i i', 'bIII bII i bvii', 'iv bII bIII i'],
    cadence: 'bIII bII',
    tonic: 'i',
  },
  dorian: {
    A: ['i IV i bVII', 'i bIII bVII IV', 'i bVII IV i', 'i IV bVII bIII', 'i v IV bVII'],
    B: ['IV i bVII i', 'bIII IV i i', 'bVII IV i v'],
    cadence: 'IV bVII',
    tonic: 'i',
  },
  ionian: {
    A: ['I V vi IV', 'I IV vi V', 'vi IV I V', 'I iii IV V', 'I V IV V', 'I vi IV V'],
    B: ['IV V vi I', 'vi V IV V', 'ii IV I V', 'IV V iii vi'],
    cadence: 'IV V',
    tonic: 'I',
  },
  mixolydian: {
    A: ['I bVII IV I', 'I IV bVII IV', 'I v IV I', 'I bVII I IV'],
    B: ['bVII IV I I', 'IV bVII I v', 'v IV bVII I'],
    cadence: 'IV bVII',
    tonic: 'I',
  },
  lydian: {
    A: ['I II I II', 'I II iii II', 'I vii II I', 'I II vi II'],
    B: ['II I II iii', 'vi II I II'],
    cadence: 'vi II',
    tonic: 'I',
  },
};

// ───────────────────────── scale <-> degree ─────────────────────────

export function degToMidi(deg: number, tonicMidi: number, scale: number[]): number {
  const n = scale.length;
  const o = Math.floor(deg / n);
  const i = ((deg % n) + n) % n;
  return tonicMidi + 12 * o + scale[i];
}

/** nearest scale degree to a midi note; ties resolve downward */
export function midiToDeg(m: number, tonicMidi: number, scale: number[]): number {
  const n = scale.length;
  const baseOct = Math.floor((m - tonicMidi) / 12);
  let best = 0;
  let bd = Infinity;
  for (let o = baseOct - 1; o <= baseOct + 1; o++) {
    for (let i = 0; i < n; i++) {
      const d = Math.abs(tonicMidi + 12 * o + scale[i] - m);
      if (d < bd - 1e-9) {
        bd = d;
        best = o * n + i;
      }
    }
  }
  return best;
}

// ───────────────────────── key detection ─────────────────────────

export interface KeyGuess {
  tonicPc: number;
  mode: ModeId;
  /** how many of the played notes already sit in the scale */
  inScale: number;
  total: number;
  score: number;
}

/**
 * Finds the key that best explains a handful of notes, biased toward the modes a style prefers.
 * Notes are weighted (first and last matter most) and tonal anchors (tonic, fifth, third) are rewarded.
 */
export function detectKey(notes: number[], candidates: readonly (readonly [ModeId, number])[]): KeyGuess {
  let best: KeyGuess | null = null;
  const n = notes.length;
  const lowest = Math.min(...notes);
  for (const [modeId, weight] of candidates) {
    const mode = MODES[modeId];
    for (let tonic = 0; tonic < 12; tonic++) {
      let fit = 0;
      let inScale = 0;
      for (let i = 0; i < n; i++) {
        const rel = pcOf(notes[i] - tonic);
        const w = i === 0 || i === n - 1 ? 1.5 : 1;
        if (mode.scale.includes(rel)) {
          fit += w;
          inScale++;
        } else if (mode.parent.includes(rel)) {
          fit += 0.55 * w;
        } else {
          fit -= 1.3 * w;
        }
        if (rel === 0) fit += 0.5 * w;
        else if (rel === 7) fit += 0.25 * w;
        else if (rel === mode.scale[2] || rel === 3 || rel === 4) fit += 0.12 * w;
      }
      if (pcOf(notes[0] - tonic) === 0) fit += 0.7;
      const lastRel = pcOf(notes[n - 1] - tonic);
      if (lastRel === 0) fit += 0.9;
      else if (lastRel === 7) fit += 0.25;
      if (pcOf(lowest - tonic) === 0) fit += 0.35;
      const score = (fit / Math.max(1, n)) * (0.7 + 0.3 * weight) + 0.35 * weight;
      if (!best || score > best.score + 1e-9) best = { tonicPc: tonic, mode: modeId, inScale, total: n, score };
    }
  }
  return best!;
}

// ───────────────────────────── voicing ─────────────────────────────

/**
 * Spread `n` voices of a chord around `center`. With a previous voicing, every voice moves to its
 * nearest chord tone (smooth voice-leading); the result always contains every pitch class it can.
 */
export function voiceChord(pcs: number[], center: number, n: number, prev?: number[]): number[] {
  const cands: number[] = [];
  for (let m = center - 16; m <= center + 16; m++) if (pcs.includes(pcOf(m))) cands.push(m);
  const span = (n - 1) * 4.6;
  const targets =
    prev && prev.length === n ? prev : Array.from({ length: n }, (_, i) => center - span / 2 + (n === 1 ? 0 : (i * span) / (n - 1)));
  const used = new Set<number>();
  const out: number[] = [];
  for (const t of targets) {
    let pick = cands[0];
    let bd = Infinity;
    for (const c of cands) {
      if (used.has(c)) continue;
      const d = Math.abs(c - t) + (c < center - 14 || c > center + 14 ? 3 : 0);
      if (d < bd) {
        bd = d;
        pick = c;
      }
    }
    used.add(pick);
    out.push(pick);
  }
  // make sure every chord tone is represented when there are enough voices
  const need = pcs.slice(0, Math.min(pcs.length, n));
  for (const pc of need) {
    if (out.some((m) => pcOf(m) === pc)) continue;
    const counts = new Map<number, number>();
    for (const m of out) counts.set(pcOf(m), (counts.get(pcOf(m)) ?? 0) + 1);
    let vi = -1;
    let bd = Infinity;
    let target = 0;
    for (let i = 0; i < out.length; i++) {
      if ((counts.get(pcOf(out[i])) ?? 0) < 2) continue;
      for (const c of cands) {
        if (pcOf(c) !== pc || out.includes(c)) continue;
        const d = Math.abs(c - out[i]);
        if (d < bd) {
          bd = d;
          vi = i;
          target = c;
        }
      }
    }
    if (vi >= 0) out[vi] = target;
  }
  return out.sort((a, b) => a - b);
}

/** ascending chord tones starting at the first one >= low */
export function chordStack(pcs: number[], low: number, count: number): number[] {
  const out: number[] = [];
  for (let m = low; out.length < count && m < low + 60; m++) if (pcs.includes(pcOf(m))) out.push(m);
  return out;
}

/** the midi note with pitch class `pc` closest to `near` (ties go down) */
export function nearestPc(pc: number, near: number): number {
  const base = near - pcOf(near - pc);
  return near - base <= 6 ? base : base + 12;
}
