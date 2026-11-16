/**
 * Worlds. Each style is data: a palette, a tempo, the modes it leans toward, a mix, and a form —
 * the list of sections with the layers that play in each. One engine performs all of them.
 *
 * Pattern strings are sixteenth-note steps (16 per 4/4 bar, 12 per 3/4 or 6/8 bar); spaces are ignored.
 */
import type {
  BassLayer, CounterLayer, DrumLayer, Inst, Layer, MelForm, MelLayer, OstLayer, PadLayer, PieceLength,
  SectionKind, SectionSpec, StylePreset,
} from './types';

const P = (s: string) => s.replace(/[\s|]/g, '');
type O<T> = Partial<Omit<T, 'k'>>;
type Kit = Partial<Record<Inst, string>>;
const kit = (g: Kit): Kit => Object.fromEntries(Object.entries(g).map(([k, v]) => [k, P(v as string)])) as Kit;

const mel = (inst: Inst, form: MelForm, o: O<MelLayer> = {}): MelLayer => ({ k: 'mel', inst, form, ...o });
const counter = (inst: Inst, o: O<CounterLayer> = {}): CounterLayer => ({ k: 'counter', inst, ...o });
const pad = (inst: Inst, o: O<PadLayer> = {}): PadLayer => ({ k: 'pad', inst, ...o, pat: o.pat ? P(o.pat) : undefined });
const bass = (inst: Inst, pat: string, o: O<BassLayer> = {}): BassLayer => ({ k: 'bass', inst, ...o, pat: P(pat), acc: o.acc ? P(o.acc) : undefined });
const ost = (inst: Inst, pat: string, o: O<OstLayer> = {}): OstLayer => ({ k: 'ost', inst, ...o, pat: P(pat), acc: o.acc ? P(o.acc) : undefined });
const drums = (g: Kit, o: O<DrumLayer> = {}): DrumLayer => ({ k: 'drums', ...o, g: kit(g), fill: o.fill ? kit(o.fill) : undefined });
const sec = (name: string, kind: SectionKind, bars: number, energy: number, layers: Layer[], o: Partial<SectionSpec> = {}): SectionSpec => ({
  name, kind, bars, energy, layers, ...o,
});
const lv = (len: PieceLength) => (len === 'short' ? 0 : len === 'standard' ? 1 : 2);
const when = <T,>(cond: boolean, ...items: T[]): T[] => (cond ? items : []);

// ═════════════════════════════ TITAN — epic orchestral ═════════════════════════════

const titan: StylePreset = {
  id: 'titan',
  name: 'Titan',
  genre: 'Epic orchestral',
  tagline: 'Thunder drums, towering brass, a choir holding up the sky.',
  palette: ['#ffb347', '#ff5e3a', '#3a1c71'],
  meter: '4/4',
  tempo: [96, 112],
  modes: [['aeolian', 1], ['dorian', 0.85], ['minorPent', 0.8], ['harmonic', 0.75], ['phrygian', 0.6], ['ionian', 0.5], ['mixolydian', 0.45]],
  sync: 0.25,
  chordExt: 'triad',
  padVoice: 'piano',
  reverb: { size: 3.4, damp: 0.45, wet: 0.34, predelay: 0.028 },
  tilt: { low: 2, high: 1.5 },
  humanize: 0.8,
  fx: {
    big: [['impact', 1], ['boom', 1], ['crash', 0.85], ['subDrop', 0.6]],
    hit: [['boom', 0.85], ['crash', 0.5]],
    drop: [['subDrop', 0.6], ['gong', 0.4]],
    roll: 'timpani', run: 'strings', gliss: 'harp',
  },
  titles: {
    a: ['Crown', 'Oath', 'Throne', 'Banner', 'Wrath', 'March', 'Dawn', 'Legend', 'Fall', 'Rise'],
    b: ['the Last King', 'Iron', 'the Fallen Sun', 'a Thousand Storms', 'the Old Gods', 'Embers', 'the Unbroken', 'the Ninth Gate'],
    join: 'of',
  },
  form(len) {
    const L = lv(len);
    const up = L >= 1 ? 2 : 0;
    const big = (anvil: boolean): DrumLayer =>
      drums(
        {
          boom: 'X... .... .... ....',
          taikoLo: 'X..x ..x. X..x ..x.',
          taikoMid: '..x. .x.. ..x. .x.x',
          snareOrch: '.... x... .... x.xx',
          timpani: 'X... .... x... ..x.',
          ...(anvil ? { anvil: '.... X... .... X...' } : {}),
        },
        { vel: 0.9, fill: { taikoLo: 'X... X... X.X. XXXX', snareOrch: 'x.x. xxxx x.xx xxxx', taikoMid: '..x. ..x. .x.x xxxx' } },
      );
    return [
      sec('First Light', 'intro', 4, 0.15, [
        mel('piano', 'statement', { vel: 0.62 }),
        pad('strings', { pedal: true, reg: 43, n: 3, vel: 0.36, art: 1 }),
        pad('choirOo', { bus: 'choir', from: 2, reg: 60, n: 3, vel: 0.3, art: 1 }),
        ost('harp', '0... .... 2... ....', { from: 2, reg: 55, vel: 0.3, bus: 'color' }),
      ], { say: 'One piano in an empty hall. Nothing else yet — only your idea.' }),

      sec('The Oath', 'theme', 8, 0.42, [
        mel('cello', 'theme', { oct: -1, vel: 0.82 }),
        mel('violin', 'response', { vel: 0.44 }),
        pad('strings', { reg: 57, n: 4, vel: 0.44, art: 1 }),
        ost('harp', '0.2. 4.2. 3.2. 4.2.', { reg: 52, vel: 0.36, bus: 'color' }),
        bass('strings', '0--- ---- ---- ----', { reg: 38, vel: 0.5 }),
        pad('choirOo', { bus: 'choir', from: 4, reg: 60, n: 3, vel: 0.34, art: 1 }),
        drums({ timpani: 'X... .... .... ..o.' }, { from: 4, vel: 0.5 }),
      ], { say: 'The strings take your motif and give it a full eight-bar theme.' }),

      ...when(L >= 2, sec('The Long March', 'theme', 8, 0.54, [
        mel('violin', 'theme', { vel: 0.8, dbl: [{ inst: 'flute', oct: 1, vel: 0.32, bus: 'color' }] }),
        counter('cello', { reg: 52, vel: 0.6 }),
        pad('strings', { reg: 57, n: 4, vel: 0.4, art: 1 }),
        ost('pizz', '0.2. 3.2. 0.2. 3.2.', { reg: 50, vel: 0.46 }),
        bass('strings', '0--- ---- 0--- ----', { reg: 38, vel: 0.5 }),
        drums({ taikoLo: 'X... .... x... ....', stick: '..x. ..x. ..x. ..xx' }, { vel: 0.5 }),
      ], { prog: 'B', say: 'Same melody, new chords underneath — the theme seen from another side.' })),

      sec('Gathering Storm', 'build', L === 0 ? 4 : 8, 0.64, [
        mel('horns', 'fragment', { oct: -1, vel: 0.72, bus: 'brass', cresc: [0.75, 1.15] }),
        ost('spiccato', '0.0. 2.0. 0.0. 3.0.', { reg: 50, shape: true, acc: 'X.o. x.o. X.o. x.o.', vel: 0.6, cresc: [0.6, 1.15] }),
        pad('tremolo', { reg: 62, n: 4, vel: 0.34, cresc: [0.5, 1.3] }),
        bass('strings', '0... 0... 0... 0...', { reg: 38, vel: 0.55, cresc: [0.7, 1.1] }),
        bass('lowBrass', '0--- ---- ---- ----', { reg: 38, vel: 0.5, bus: 'brass', from: L === 0 ? 2 : 4, cresc: [0.6, 1.1] }),
        pad('choirOo', { bus: 'choir', reg: 58, n: 4, vel: 0.4, from: L === 0 ? 2 : 4, cresc: [0.6, 1.2], art: 1 }),
        drums({ taikoLo: 'X... ..x. X... x...', taikoMid: '..x. ..x. ..x. x.xx', stick: 'x.x. x.x. x.x. x.x.' }, { vel: 0.7, cresc: [0.5, 1.1] }),
      ], { exit: ['riser', 'roll', 'run', 'cut'], say: 'Pressure. Short strings start the engine and the drums fall in behind it.' }),

      sec('Titan', 'climax', 8, 1, [
        mel('strings', 'theme', { oct: 1, vel: 0.92, dbl: [{ inst: 'horns', oct: 0, vel: 0.85, bus: 'brass' }, { inst: 'trumpets', oct: 0, vel: 0.5, bus: 'brass' }] }),
        counter('strings', { reg: 62, vel: 0.5 }),
        pad('choirAh', { bus: 'choir', reg: 62, n: 5, vel: 0.62 }),
        pad('strings', { reg: 55, n: 4, vel: 0.42 }),
        ost('spiccato', '0000 2000 3000 2000', { reg: 50, shape: true, acc: 'X..x ..x. X..x ..x.', vel: 0.62 }),
        bass('lowBrass', '0--- ---- 0--- 0---', { reg: 38, vel: 0.75, bus: 'brass' }),
        bass('strings', '0.0. 0.0. 0.0. 0.0.', { reg: 38, vel: 0.6, acc: 'X.o. x.o. X.o. x.o.' }),
        bass('sub', '0--- ---- ---- ----', { reg: 36, vel: 0.6 }),
        big(false),
        drums({ crash: 'X... .... .... ....' }, { from: 4, to: 5, vel: 0.7 }),
      ], { say: 'Everything at once: your theme in full strings and brass, the choir behind it.' }),

      ...when(L >= 2, sec('The Clash', 'climax', 8, 0.9, [
        mel('trumpets', 'call', { vel: 0.85, bus: 'brass', dbl: [{ inst: 'horns', oct: -1, vel: 0.8, bus: 'brass' }] }),
        mel('strings', 'response', { oct: 1, vel: 0.86 }),
        pad('choirStac', { bus: 'choir', pat: 'X..X ..X. ..X. X...', reg: 60, n: 4, vel: 0.56 }),
        pad('strings', { reg: 55, n: 4, vel: 0.4 }),
        ost('spiccato', '0020 0030 0020 0040', { reg: 50, shape: true, acc: 'X..x ..x. X..x ..x.', vel: 0.62 }),
        bass('lowBrass', '0--- ---- 0--- ----', { reg: 38, vel: 0.7, bus: 'brass' }),
        bass('sub', '0--- ---- ---- ----', { reg: 36, vel: 0.56 }),
        big(true),
      ], { prog: 'B', enter: 'hit', say: 'Brass throws your motif out; the strings throw the answer back.' })),

      ...when(L >= 1, sec('Ashes', 'break', 8, 0.2, [
        mel('soprano', 'inverted', { vel: 0.6 }),
        pad('strings', { reg: 57, n: 4, vel: 0.3, art: 1 }),
        ost('harp', '0.1. 2.3. 2.1. 2...', { reg: 52, vel: 0.34, bus: 'color' }),
        bass('strings', '0--- ---- ---- ----', { reg: 38, vel: 0.4 }),
        pad('horns', { bus: 'brass', reg: 53, n: 3, vel: 0.28, from: 4, art: 1 }),
      ], { exit: ['swell', 'roll', 'gliss'], say: 'After the summit, ash. A lone voice sings your motif upside-down.' })),

      ...when(L >= 1, sec('Ascension', 'finale', 8, 1, [
        mel('strings', 'theme', { oct: 1, vel: 0.96, dbl: [{ inst: 'trumpets', oct: 0, vel: 0.78, bus: 'brass' }, { inst: 'glock', oct: 2, vel: 0.3, bus: 'color' }] }),
        mel('horns', 'augmented', { oct: -1, vel: 0.8, bus: 'brass', dbl: [{ inst: 'lowBrass', oct: -2, vel: 0.6, bus: 'brass' }] }),
        pad('choirAh', { bus: 'choir', reg: 63, n: 5, vel: 0.68 }),
        pad('strings', { reg: 55, n: 4, vel: 0.42 }),
        ost('spiccato', '0020 0030 0020 0040', { reg: 50, shape: true, acc: 'X..x ..x. X..x ..x.', vel: 0.64 }),
        bass('strings', '0.0. 0.0. 0.0. 0.0.', { reg: 38, vel: 0.6, acc: 'X.o. x.o. X.o. x.o.' }),
        bass('sub', '0--- ---- ---- ----', { reg: 36, vel: 0.62 }),
        big(true),
      ], { prog: 'final', lift: up, say: 'One step higher. The theme on top, and underneath it the same theme at half speed in the brass.' })),

      sec('Embers', 'outro', 4, 0.12, [
        mel('piano', 'statement', { vel: 0.5, to: 2 }),
        pad('strings', { pedal: true, reg: 43, n: 4, vel: 0.36, art: 4 }),
        pad('choirOo', { bus: 'choir', pedal: true, reg: 55, n: 2, vel: 0.26, art: 4 }),
        ost('bell', '0... .... .... ....', { from: 2, to: 3, reg: 55, vel: 0.4, bus: 'color' }),
      ], { prog: 'pedal', lift: up, say: 'The hall empties. The piano remembers how it began.' }),
    ];
  },
};

// ═════════════════════════════ ELDRITCH — gothic horror in 6/8 ═════════════════════════════

const eldritch: StylePreset = {
  id: 'eldritch',
  name: 'Eldritch',
  genre: 'Gothic horror',
  tagline: 'Cathedral choir, pipe organ and bells for something that should not be awake.',
  palette: ['#e23b4e', '#8b5cf6', '#0b1d3a'],
  meter: '6/8',
  tempo: [100, 116],
  modes: [['harmonic', 1], ['phrygian', 0.9], ['aeolian', 0.75], ['hirajoshi', 0.5], ['dorian', 0.45]],
  sync: 0.15,
  chordExt: 'triad',
  padVoice: 'organ',
  reverb: { size: 4.4, damp: 0.38, wet: 0.4, predelay: 0.04 },
  tilt: { low: 2.5, high: 0.5 },
  humanize: 0.9,
  fx: {
    big: [['impact', 1], ['boom', 1], ['gong', 0.7], ['crash', 0.7], ['subDrop', 0.6]],
    hit: [['boom', 0.85], ['gong', 0.4]],
    drop: [['subDrop', 0.6], ['gong', 0.5]],
    roll: 'timpani', run: 'strings', gliss: 'harp',
  },
  titles: {
    a: ['Vespers', 'Requiem', 'Hymn', 'Nocturne', 'Litany', 'Vigil', 'Elegy', 'Dirge', 'Omen'],
    b: ['the Pale Moon', 'the Hollow Saint', 'a Drowned Choir', 'the Waking Dark', 'the Last Lantern', 'Ash and Ichor', 'the Unseen', 'the Sunken Chapel'],
    join: 'for',
  },
  form(len) {
    const L = lv(len);
    const up = L >= 1 ? 1 : 0;
    const big: DrumLayer = drums(
      {
        boom: 'X..... ......',
        taikoLo: 'X..... x...x.',
        taikoMid: '..x.x. ..x.xx',
        anvil: '...... X.....',
        snareOrch: '...... x...xx',
        timpani: 'X..... ....x.',
      },
      { vel: 0.9, fill: { taikoLo: 'X..X.. X.XXXX', snareOrch: 'x.xxx. xxxxxx', taikoMid: '..x.x. xxxxxx' } },
    );
    return [
      sec('Vespers', 'intro', 4, 0.15, [
        mel('cello', 'statement', { oct: -1, vel: 0.66 }),
        pad('organ', { pedal: true, reg: 36, n: 2, vel: 0.3, art: 4 }),
        pad('tremolo', { pedal: true, reg: 62, n: 2, vel: 0.2, from: 2, art: 4 }),
        ost('bell', '0..... ......', { every: 2, reg: 50, vel: 0.5, bus: 'color' }),
      ], { prog: 'pedal', say: 'A bell. A cello in the dark, playing what you played.' }),

      sec('The Cathedral Wakes', 'theme', 8, 0.45, [
        mel('violin', 'theme', { vel: 0.78, orn: true }),
        counter('cello', { reg: 52, vel: 0.56 }),
        pad('choirOo', { bus: 'choir', reg: 58, n: 4, vel: 0.42, art: 1 }),
        ost('harp', '0.2.3. 4.3.2.', { reg: 50, vel: 0.36, bus: 'color' }),
        bass('organ', '0----- ------', { reg: 38, vel: 0.42 }),
        pad('strings', { reg: 55, n: 3, vel: 0.3, from: 4, art: 1 }),
        drums({ timpani: 'X..... ......' }, { from: 4, vel: 0.45 }),
      ], { say: 'A violin carries the theme in a slow, swaying six; a cello shadows it a sixth below.' }),

      ...when(L >= 1, sec('Procession', 'theme', 8, 0.56, [
        mel('choirAh', 'theme', { vel: 0.7, bus: 'choir' }),
        counter('cello', { reg: 50, vel: 0.56 }),
        pad('organ', { reg: 50, n: 4, vel: 0.38 }),
        bass('strings', '0..... 0...0.', { reg: 38, vel: 0.52 }),
        ost('pizz', '0.2.3. 0.2.3.', { reg: 50, vel: 0.4 }),
        drums({ taikoLo: 'X..... x.....', taikoMid: '...... ....x.' }, { vel: 0.5 }),
      ], { prog: 'B', say: 'The choir takes the theme over darker chords. Feet on stone.' })),

      sec('Descent', 'build', L === 0 ? 4 : 8, 0.65, [
        mel('horns', 'fragment', { oct: -1, vel: 0.7, bus: 'brass', cresc: [0.7, 1.15] }),
        ost('spiccato', '0.2.3. 0.2.3.', { reg: 50, shape: true, acc: 'X.o.o. x.o.o.', vel: 0.6, cresc: [0.6, 1.15] }),
        pad('choirStac', { bus: 'choir', pat: 'X..... x.....', reg: 58, n: 4, vel: 0.5, from: L === 0 ? 2 : 4, cresc: [0.7, 1.2] }),
        pad('tremolo', { reg: 62, n: 4, vel: 0.34, cresc: [0.5, 1.3] }),
        bass('lowBrass', '0----- 0-----', { reg: 38, vel: 0.55, bus: 'brass', cresc: [0.6, 1.1] }),
        bass('organ', '0----- ------', { reg: 36, vel: 0.4 }),
        drums({ taikoLo: 'X..... x...x.', taikoMid: '....x. ....xx' }, { vel: 0.7, cresc: [0.5, 1.1] }),
        drums({ anvil: '...... X.....' }, { from: L === 0 ? 2 : 4, vel: 0.6 }),
      ], { prog: 'B', exit: ['riser', 'roll', 'run', 'cut'], say: 'The stairs go down. Chanting, tremolo strings, an anvil on the second pulse.' }),

      sec('Unchained', 'climax', 8, 1, [
        mel('strings', 'theme', { oct: 1, vel: 0.92, dbl: [{ inst: 'choirAh', oct: 0, vel: 0.8, bus: 'choir' }, { inst: 'trumpets', oct: 0, vel: 0.55, bus: 'brass' }] }),
        counter('horns', { reg: 57, vel: 0.62, bus: 'brass' }),
        pad('organ', { reg: 50, n: 4, vel: 0.46 }),
        ost('spiccato', '020302 030204', { reg: 50, shape: true, acc: 'X.o.o. X.o.o.', vel: 0.62 }),
        ost('bell', '0..... ......', { every: 2, reg: 55, vel: 0.5, bus: 'color' }),
        bass('lowBrass', '0----- 0--0--', { reg: 38, vel: 0.75, bus: 'brass' }),
        bass('strings', '0.0.0. 0.0.0.', { reg: 38, vel: 0.58, acc: 'X.o.o. x.o.o.' }),
        bass('sub', '0----- ------', { reg: 36, vel: 0.6 }),
        big,
      ], { say: 'It is loose. The full choir sings your theme over frantic strings and the organ.' }),

      ...when(L >= 1, sec('Frenzy', 'climax', 8, 0.9, [
        mel('trumpets', 'call', { vel: 0.84, bus: 'brass', dbl: [{ inst: 'horns', oct: -1, vel: 0.8, bus: 'brass' }] }),
        mel('strings', 'response', { oct: 1, vel: 0.88, dbl: [{ inst: 'choirAh', oct: 0, vel: 0.76, bus: 'choir' }] }),
        pad('choirStac', { bus: 'choir', pat: 'X..x.. X.....', reg: 58, n: 4, vel: 0.56 }),
        pad('organ', { reg: 50, n: 4, vel: 0.44 }),
        ost('spiccato', '020302 030204', { reg: 50, shape: true, acc: 'X.o.o. X.o.o.', vel: 0.62 }),
        bass('lowBrass', '0----- 0--0--', { reg: 38, vel: 0.72, bus: 'brass' }),
        bass('sub', '0----- ------', { reg: 36, vel: 0.58 }),
        big,
      ], { prog: 'B', enter: 'hit', say: 'Brass snarls your motif; strings and choir scream the answer back.' })),

      ...when(L >= 1, sec('Vigil', 'break', 8, 0.18, [
        mel('soprano', 'augmented', { vel: 0.62 }),
        pad('organ', { reg: 48, n: 3, vel: 0.28, art: 4 }),
        ost('celesta', '0.2.4. 5.4.2.', { reg: 72, vel: 0.3, bus: 'color' }),
        ost('bell', '0..... ......', { every: 4, reg: 50, vel: 0.42, bus: 'color' }),
        pad('choirOo', { bus: 'choir', reg: 55, n: 3, vel: 0.26, from: 4, art: 1 }),
      ], { rate: 2, exit: ['swell', 'roll'], say: 'A music box in an empty nave. One soprano, your motif at half speed.' })),

      ...when(L >= 1, sec('Requiem', 'finale', 8, 1, [
        mel('strings', 'theme', { oct: 1, vel: 0.96, dbl: [{ inst: 'choirAh', oct: 0, vel: 0.85, bus: 'choir' }, { inst: 'trumpets', oct: 0, vel: 0.7, bus: 'brass' }] }),
        mel('lowBrass', 'augmented', { oct: -2, vel: 0.78, bus: 'brass', dbl: [{ inst: 'horns', oct: -1, vel: 0.7, bus: 'brass' }] }),
        pad('organ', { reg: 52, n: 5, vel: 0.52 }),
        ost('spiccato', '020302 030204', { reg: 50, shape: true, acc: 'X.o.o. X.o.o.', vel: 0.64 }),
        ost('bell', '0..... ......', { reg: 55, vel: 0.55, bus: 'color' }),
        bass('strings', '0.0.0. 0.0.0.', { reg: 38, vel: 0.58, acc: 'X.o.o. x.o.o.' }),
        bass('sub', '0----- ------', { reg: 36, vel: 0.62 }),
        big,
      ], { prog: 'final', lift: up, say: 'A semitone higher — the most unsettling lift there is. Bells on every bar.' })),

      ...when(L >= 2, sec('Apotheosis', 'finale', 8, 1, [
        mel('strings', 'theme', { oct: 1, vel: 0.98, dbl: [{ inst: 'choirAh', oct: 0, vel: 0.88, bus: 'choir' }, { inst: 'trumpets', oct: 0, vel: 0.74, bus: 'brass' }, { inst: 'soprano', oct: 1, vel: 0.5, bus: 'choir' }] }),
        counter('horns', { reg: 57, vel: 0.66, bus: 'brass' }),
        pad('organ', { reg: 52, n: 5, vel: 0.54 }),
        pad('choirStac', { bus: 'choir', pat: 'X..x.. X.....', reg: 58, n: 4, vel: 0.5 }),
        ost('spiccato', '020302 030204', { reg: 50, shape: true, acc: 'X.o.o. X.o.o.', vel: 0.64 }),
        ost('bell', '0..... ......', { reg: 55, vel: 0.55, bus: 'color' }),
        bass('lowBrass', '0----- 0--0--', { reg: 38, vel: 0.76, bus: 'brass' }),
        bass('sub', '0----- ------', { reg: 36, vel: 0.62 }),
        big,
      ], { prog: 'final', lift: up + 2, enter: 'big', say: 'And higher again — a minor third above where you began. Nothing left in reserve.' })),

      sec('Last Bell', 'outro', 4, 0.1, [
        mel('cello', 'statement', { oct: -1, vel: 0.55, to: 2 }),
        pad('organ', { pedal: true, reg: 36, n: 3, vel: 0.32, art: 4 }),
        pad('choirOo', { bus: 'choir', pedal: true, reg: 55, n: 2, vel: 0.24, art: 4 }),
        ost('bell', '0..... ......', { every: 2, reg: 50, vel: 0.5, bus: 'color' }),
      ], { prog: 'pedal', lift: L >= 2 ? up + 2 : up, say: 'The cello again, alone. Whatever it was has gone back to sleep.' }),
    ];
  },
};

// ═════════════════════════════ ASHEN LAMENT — sorrow in 3/4 ═════════════════════════════

const ashen: StylePreset = {
  id: 'ashen',
  name: 'Ashen Lament',
  genre: 'Melancholic waltz',
  tagline: 'Felt piano, a solo cello, and the quiet after everything has burned.',
  palette: ['#9fb4d8', '#c7a27a', '#1a2233'],
  meter: '3/4',
  tempo: [68, 84],
  modes: [['aeolian', 1], ['dorian', 0.85], ['harmonic', 0.7], ['phrygian', 0.5], ['ionian', 0.45]],
  sync: 0.1,
  chordExt: 'add9',
  padVoice: 'felt',
  reverb: { size: 4.2, damp: 0.5, wet: 0.4, predelay: 0.035 },
  tilt: { low: 1, high: -0.5 },
  humanize: 1.1,
  fx: { big: [['boom', 0.7], ['gong', 0.35]], hit: [['boom', 0.5]], drop: [['gong', 0.3]], roll: 'timpani', gliss: 'harp' },
  titles: {
    a: ['Lament', 'Elegy', 'Lullaby', 'Letters', 'Snowfall', 'A Prayer', 'Farewell', 'Memory'],
    b: ['the Fallen', 'What Remains', 'a Ruined Garden', 'the Last Flame', 'the Long Winter', 'No One Left'],
    join: 'for',
  },
  form(len) {
    const L = lv(len);
    const up = L >= 1 ? 2 : 0;
    return [
      sec('Dust', 'intro', 4, 0.12, [
        ost('felt', '0.2. 4.5. 4.2.', { reg: 50, vel: 0.44, bus: 'color' }),
        bass('felt', '0--- ---- ----', { reg: 40, vel: 0.4 }),
        pad('strings', { pedal: true, reg: 48, n: 2, vel: 0.22, from: 2, art: 4 }),
      ], { say: 'A felt piano turns your chords over slowly, three beats to the bar.' }),

      sec('Lament', 'theme', 8, 0.35, [
        mel('cello', 'theme', { oct: -1, vel: 0.8 }),
        ost('felt', '0.2. 4.5. 4.2.', { reg: 50, vel: 0.4, bus: 'color' }),
        bass('felt', '0--- ---- ----', { reg: 40, vel: 0.4 }),
        pad('strings', { reg: 58, n: 4, vel: 0.3, from: 4, art: 1 }),
      ], { say: 'The cello sings your theme. Nothing hurries it.' }),

      ...when(L >= 1, sec('What Remains', 'theme', 8, 0.5, [
        mel('violin', 'theme', { vel: 0.76 }),
        counter('cello', { reg: 52, vel: 0.6 }),
        pad('strings', { reg: 57, n: 4, vel: 0.36, art: 1 }),
        pad('choirOo', { bus: 'choir', reg: 60, n: 3, vel: 0.3, from: 4, art: 1 }),
        ost('felt', '0.2. 4.5. 4.2.', { reg: 50, vel: 0.36, bus: 'color' }),
        bass('strings', '0--- ---- ----', { reg: 38, vel: 0.44 }),
      ], { prog: 'B', say: 'A violin takes the melody; the cello stays as its shadow.' })),

      sec('The Swell', 'climax', 8, 0.78, [
        mel('strings', 'theme', { oct: 1, vel: 0.9, dbl: [{ inst: 'horns', oct: 0, vel: 0.6, bus: 'brass' }] }),
        counter('cello', { reg: 55, vel: 0.62 }),
        pad('choirAh', { bus: 'choir', reg: 60, n: 4, vel: 0.5, art: 1 }),
        pad('strings', { reg: 55, n: 4, vel: 0.44 }),
        ost('piano', '0.2. 4.5. 4.2.', { reg: 50, vel: 0.5, bus: 'color' }),
        ost('harp', '0.3. 5.3. 6.5.', { reg: 55, vel: 0.34, bus: 'color' }),
        bass('strings', '0--- ---- ----', { reg: 38, vel: 0.6 }),
        bass('sub', '0--- ---- ----', { reg: 36, vel: 0.4 }),
        drums({ timpani: 'X... .... ..o.', boom: 'X... .... .... | .... .... ....' }, { vel: 0.6 }),
      ], { enter: 'hit', say: 'Grief, out loud: the whole string section and a wordless choir.' }),

      ...when(L >= 2, sec('Remembrance', 'theme', 8, 0.4, [
        mel('felt', 'call', { vel: 0.66 }),
        mel('soprano', 'response', { vel: 0.56 }),
        pad('strings', { reg: 57, n: 4, vel: 0.3, art: 1 }),
        ost('harp', '0.2. 4.5. 4.2.', { reg: 52, vel: 0.34, bus: 'color' }),
        bass('strings', '0--- ---- ----', { reg: 38, vel: 0.42 }),
      ], { prog: 'B', say: 'The piano asks; a distant voice answers.' })),

      ...when(L >= 1, sec('Hollow', 'break', 4, 0.15, [
        mel('felt', 'inverted', { vel: 0.6 }),
        pad('strings', { reg: 57, n: 3, vel: 0.22, art: 4 }),
        bass('felt', '0--- ---- ----', { reg: 40, vel: 0.36 }),
      ], { say: 'The piano alone, your motif upside-down.' })),

      ...when(L >= 1, sec('Absolution', 'finale', 8, 0.85, [
        mel('soprano', 'theme', { vel: 0.74, dbl: [{ inst: 'strings', oct: 1, vel: 0.8 }] }),
        counter('cello', { reg: 55, vel: 0.62 }),
        pad('choirAh', { bus: 'choir', reg: 60, n: 4, vel: 0.5, art: 1 }),
        pad('strings', { reg: 55, n: 4, vel: 0.44 }),
        ost('piano', '0.2. 4.5. 4.2.', { reg: 50, vel: 0.5, bus: 'color' }),
        bass('strings', '0--- ---- ----', { reg: 38, vel: 0.6 }),
        bass('sub', '0--- ---- ----', { reg: 36, vel: 0.4 }),
        drums({ timpani: 'X... .... ..o.' }, { vel: 0.6 }),
      ], { prog: 'final', lift: up, exit: ['gliss'], say: 'A whole step up, and a single soprano above the strings.' })),

      sec('Embers', 'outro', 4, 0.1, [
        mel('felt', 'statement', { vel: 0.5, to: 2 }),
        pad('strings', { pedal: true, reg: 48, n: 3, vel: 0.26, art: 4 }),
        bass('felt', '0--- ---- ----', { reg: 40, vel: 0.36, to: 3, every: 2 }),
      ], { prog: 'pedal', lift: up, say: 'Your notes one last time, and then the room.' }),
    ];
  },
};

// ═════════════════════════════ VALOR — heroic adventure ═════════════════════════════

const valor: StylePreset = {
  id: 'valor',
  name: 'Valor',
  genre: 'Heroic adventure',
  tagline: 'Fanfares, snare drums and wide-open skies.',
  palette: ['#ffd166', '#4cc9f0', '#12305c'],
  meter: '4/4',
  tempo: [112, 130],
  modes: [['ionian', 1], ['mixolydian', 0.9], ['majorPent', 0.85], ['lydian', 0.6], ['dorian', 0.5], ['aeolian', 0.45]],
  sync: 0.3,
  chordExt: 'triad',
  padVoice: 'piano',
  reverb: { size: 2.8, damp: 0.42, wet: 0.3, predelay: 0.024 },
  tilt: { low: 1, high: 2 },
  humanize: 0.8,
  fx: {
    big: [['boom', 0.9], ['crash', 0.9], ['timpani', 0.9]],
    hit: [['crash', 0.55], ['timpani', 0.7]],
    drop: [['gong', 0.3]],
    roll: 'snareOrch', run: 'strings', gliss: 'harp',
  },
  titles: {
    a: ['Banner', 'Wings', 'Song', 'Call', 'Road', 'Heart', 'Horizon', 'Sails'],
    b: ['the Brave', 'the Morning', 'the Open Sea', 'Distant Shores', 'the Free', 'a New Age', 'the Sky Riders'],
    join: 'of',
  },
  form(len) {
    const L = lv(len);
    const up = L >= 1 ? 2 : 0;
    const march = (v: number): DrumLayer =>
      drums(
        {
          snareOrch: 'x.xx x.xx x.xx x.rx',
          boom: 'X... .... .... ....',
          timpani: 'X... .... x... x...',
          crash: 'X... .... .... .... | .... .... .... .... | .... .... .... .... | .... .... .... ....',
        },
        { vel: v, fill: { snareOrch: 'x.xx xxxx xrxr xxxx', timpani: 'X... X... X.X. XXXX' } },
      );
    return [
      sec('Daybreak', 'intro', 4, 0.2, [
        mel('horns', 'statement', { oct: -1, vel: 0.66, bus: 'brass' }),
        pad('tremolo', { pedal: true, reg: 62, n: 2, vel: 0.22, art: 4 }),
        pad('strings', { reg: 55, n: 4, vel: 0.3, from: 2, art: 1 }),
        drums({ timpani: 'o... .... .... ....' }, { vel: 0.5, every: 2 }),
      ], { say: 'A horn call across the valley — your motif, as a signal.' }),

      sec('Setting Out', 'theme', 8, 0.45, [
        mel('flute', 'theme', { oct: 1, vel: 0.66, dbl: [{ inst: 'violin', oct: 0, vel: 0.7 }] }),
        pad('strings', { reg: 57, n: 4, vel: 0.36, art: 1 }),
        ost('harp', '0.2. 4.2. 5.4. 2.4.', { reg: 52, vel: 0.36, bus: 'color' }),
        bass('pizz', '0... 5... 0... 5...', { reg: 40, vel: 0.6 }),
        drums({ snareOrch: 'o.gg o.gg o.gg o.go' }, { from: 4, vel: 0.36 }),
      ], { say: 'Flute and violin share the theme over plucked basses. The road opens.' }),

      ...when(L >= 1, sec('Open Road', 'theme', 8, 0.55, [
        mel('violin', 'theme', { vel: 0.78 }),
        counter('horns', { reg: 55, vel: 0.5, bus: 'brass' }),
        pad('strings', { reg: 57, n: 4, vel: 0.36 }),
        ost('pizz', '0.2. 3.2. 4.2. 3.2.', { reg: 52, vel: 0.44 }),
        bass('strings', '0... 0... 5... 0...', { reg: 38, vel: 0.5 }),
        drums({ snareOrch: 'x.gg x.gg x.gg x.rx', timpani: 'X... .... .... ....' }, { vel: 0.5 }),
      ], { prog: 'B', say: 'New chords under the same tune; a horn answers every phrase.' })),

      sec('Rally', 'build', L === 0 ? 4 : 8, 0.66, [
        mel('trumpets', 'fragment', { vel: 0.66, bus: 'brass', cresc: [0.7, 1.15] }),
        ost('spiccato', '0.0. 2.0. 3.0. 2.0.', { reg: 52, shape: true, acc: 'X.o. x.o. X.o. x.o.', vel: 0.56, cresc: [0.6, 1.15] }),
        pad('tremolo', { reg: 64, n: 4, vel: 0.3, cresc: [0.5, 1.3] }),
        bass('strings', '0... 0... 0... 0...', { reg: 38, vel: 0.55 }),
        bass('lowBrass', '0--- ---- ---- ----', { reg: 40, vel: 0.5, bus: 'brass', from: L === 0 ? 2 : 4 }),
        drums({ snareOrch: 'x.xx x.xx x.xx x.rx', timpani: 'X... .... x... ....' }, { vel: 0.6, cresc: [0.5, 1.1] }),
      ], { exit: ['swell', 'roll', 'run', 'cut'], say: 'The snare drum starts to march. Trumpets try out the first notes of your motif.' }),

      sec('Valor', 'climax', 8, 1, [
        mel('trumpets', 'theme', { vel: 0.9, bus: 'brass', dbl: [{ inst: 'horns', oct: -1, vel: 0.8, bus: 'brass' }, { inst: 'strings', oct: 1, vel: 0.8 }, { inst: 'glock', oct: 2, vel: 0.26, bus: 'color' }] }),
        counter('strings', { reg: 62, vel: 0.5 }),
        pad('choirAh', { bus: 'choir', reg: 62, n: 4, vel: 0.5 }),
        pad('strings', { reg: 57, n: 4, vel: 0.4 }),
        ost('spiccato', '0020 0030 0020 0040', { reg: 52, shape: true, acc: 'X..x ..x. X..x ..x.', vel: 0.56 }),
        bass('lowBrass', '0--- ---- 0--- 5---', { reg: 40, vel: 0.72, bus: 'brass' }),
        bass('strings', '0.0. 0.0. 0.0. 0.0.', { reg: 38, vel: 0.55, acc: 'X.o. x.o. X.o. x.o.' }),
        march(0.82),
      ], { say: 'Full fanfare: trumpets and horns carry your theme, strings fly above them.' }),

      ...when(L >= 2, sec('Skyward', 'climax', 8, 0.9, [
        mel('horns', 'call', { oct: -1, vel: 0.86, bus: 'brass' }),
        mel('strings', 'response', { oct: 1, vel: 0.86, dbl: [{ inst: 'flute', oct: 1, vel: 0.4, bus: 'color' }] }),
        pad('strings', { reg: 57, n: 4, vel: 0.4 }),
        pad('choirAh', { bus: 'choir', reg: 62, n: 4, vel: 0.44 }),
        ost('spiccato', '0020 0030 0020 0040', { reg: 52, shape: true, acc: 'X..x ..x. X..x ..x.', vel: 0.56 }),
        bass('lowBrass', '0--- ---- 0--- 5---', { reg: 40, vel: 0.7, bus: 'brass' }),
        bass('strings', '0.0. 0.0. 0.0. 0.0.', { reg: 38, vel: 0.55, acc: 'X.o. x.o. X.o. x.o.' }),
        march(0.8),
      ], { prog: 'B', enter: 'hit', say: 'Horns call, strings answer, and the chords take a turn you have not heard yet.' })),

      ...when(L >= 1, sec('Homeward', 'break', 8, 0.25, [
        mel('flute', 'inverted', { oct: 1, vel: 0.6 }),
        pad('strings', { reg: 57, n: 4, vel: 0.3, art: 1 }),
        ost('harp', '0.2. 4.2. 5.4. 2.4.', { reg: 52, vel: 0.36, bus: 'color' }),
        bass('pizz', '0... .... 5... ....', { reg: 40, vel: 0.5 }),
      ], { exit: ['swell', 'roll', 'gliss'], say: 'A quiet look back. The flute turns your motif over.' })),

      ...when(L >= 1, sec('Triumph', 'finale', 8, 1, [
        mel('trumpets', 'theme', { vel: 0.94, bus: 'brass', dbl: [{ inst: 'strings', oct: 1, vel: 0.84 }, { inst: 'glock', oct: 2, vel: 0.28, bus: 'color' }] }),
        mel('horns', 'augmented', { oct: -1, vel: 0.8, bus: 'brass', dbl: [{ inst: 'lowBrass', oct: -2, vel: 0.6, bus: 'brass' }] }),
        pad('choirAh', { bus: 'choir', reg: 63, n: 5, vel: 0.56 }),
        pad('strings', { reg: 57, n: 4, vel: 0.4 }),
        ost('spiccato', '0020 0030 0020 0040', { reg: 52, shape: true, acc: 'X..x ..x. X..x ..x.', vel: 0.58 }),
        bass('strings', '0.0. 0.0. 0.0. 0.0.', { reg: 38, vel: 0.55, acc: 'X.o. x.o. X.o. x.o.' }),
        bass('sub', '0--- ---- ---- ----', { reg: 36, vel: 0.45 }),
        march(0.88),
      ], { prog: 'final', lift: up, say: 'Up a whole step — the oldest trick in the hero’s book, because it works.' })),

      sec('Legend', 'outro', 4, 0.7, [
        mel('trumpets', 'statement', { vel: 0.8, bus: 'brass', to: 2, dbl: [{ inst: 'horns', oct: -1, vel: 0.75, bus: 'brass' }] }),
        pad('strings', { reg: 60, n: 5, vel: 0.5 }),
        pad('choirAh', { bus: 'choir', reg: 60, n: 4, vel: 0.46 }),
        pad('lowBrass', { bus: 'brass', reg: 45, n: 2, vel: 0.5 }),
        bass('sub', '0--- ---- ---- ----', { reg: 36, vel: 0.45 }),
        drums({ timpani: 'X.xx xxxx xxxx xxxx | X... .... .... ....', crash: '.... .... .... .... | X... .... .... ....' }, { vel: 0.7, to: 2 }),
        drums({ timpani: 'X... .... .... ....', boom: 'X... .... .... ....', crash: 'X... .... .... ....' }, { from: 2, to: 3, vel: 0.85 }),
      ], { prog: 'pedal', lift: up, enter: 'big', say: 'One last statement and a held chord. The story gets told for years.' }),
    ];
  },
};

// ═════════════════════════════ CATACLYSM — hybrid trailer ═════════════════════════════

const cataclysm: StylePreset = {
  id: 'cataclysm',
  name: 'Cataclysm',
  genre: 'Hybrid trailer',
  tagline: 'Ticking clocks, sub drops and braams that level cities.',
  palette: ['#ff3d2e', '#ff9f1c', '#1b0a0a'],
  meter: '4/4',
  tempo: [88, 102],
  modes: [['phrygian', 1], ['aeolian', 0.95], ['harmonic', 0.75], ['minorPent', 0.7], ['hirajoshi', 0.45]],
  sync: 0.2,
  chordExt: 'power',
  padVoice: 'piano',
  reverb: { size: 3.8, damp: 0.4, wet: 0.34, predelay: 0.03 },
  tilt: { low: 3, high: 1.5 },
  humanize: 0.5,
  fx: {
    big: [['braam', 1], ['impact', 1], ['boom', 1], ['subDrop', 0.9], ['crash', 0.7]],
    hit: [['impact', 0.85], ['boom', 0.85]],
    drop: [['subDrop', 0.9], ['gong', 0.35]],
    roll: 'taikoMid', run: 'strings', riser: true,
  },
  titles: {
    a: ['Zero Hour', 'Extinction', 'Collapse', 'Black Sun', 'Impact', 'Endgame', 'Last Light', 'Fracture'],
    b: ['Protocol', 'Rising', 'Event', 'Horizon', 'Descending', 'Unleashed', 'Reckoning'],
    join: '',
  },
  form(len) {
    const L = lv(len);
    const up = L >= 1 ? 1 : 0;
    const big = (anvil: boolean): DrumLayer =>
      drums(
        {
          boom: 'X... .... .... ....',
          taikoLo: 'X..x ..x. ..x. x...',
          taikoMid: '..x. .x.. .x.. ..xx',
          snareOrch: '.... .... X... ....',
          impact: '.... .... X... .... | .... .... .... ....',
          ...(anvil ? { anvil: '.... X... .... X...' } : {}),
        },
        { vel: 0.92, fill: { taikoLo: 'X..X ..X. X.X. XXXX', taikoMid: '..x. ..x. .x.x xxxx', snareOrch: '.... x... x.x. xxxx' } },
      );
    return [
      sec('T-Minus', 'intro', 4, 0.15, [
        mel('piano', 'sparse', { oct: -1, vel: 0.6 }),
        bass('sub', '0--- ---- ---- ----', { reg: 36, vel: 0.5 }),
        pad('tremolo', { pedal: true, reg: 60, n: 2, vel: 0.2, from: 2, art: 4 }),
        drums({ tick: 'x... x... x... x...' }, { vel: 0.5 }),
      ], { prog: 'pedal', say: 'A clock. One low piano note per bar — your notes, counted down.' }),

      sec('Pressure', 'build', L === 0 ? 4 : 8, 0.6, [
        mel('lowBrass', 'fragment', { oct: -2, vel: 0.7, bus: 'brass', cresc: [0.7, 1.15] }),
        bass('synBass', '0.0. 0.0. 0.0. 0.0.', { reg: 36, vel: 0.56, acc: 'X.o. x.o. X.o. x.o.', cresc: [0.6, 1.15] }),
        ost('spiccato', '0.0. 2.0. 0.0. 3.0.', { reg: 50, shape: true, acc: 'X.o. x.o. X.o. x.o.', vel: 0.56, cresc: [0.6, 1.15] }),
        ost('arp', '0213 0213 0213 0213', { reg: 62, vel: 0.26, cresc: [0.4, 1.2] }),
        pad('choirOo', { bus: 'choir', reg: 58, n: 4, vel: 0.36, cresc: [0.5, 1.3], art: 1 }),
        drums({ tick: 'x... x... x... x...', taikoLo: 'X... .... ..x. ....', taikoMid: '.... ..x. .... x.xx' }, { vel: 0.66, cresc: [0.5, 1.1] }),
      ], { exit: ['riser', 'roll', 'cut'], say: 'A pulse starts underneath and does not stop. Every two bars it climbs.' }),

      sec('Impact', 'climax', 8, 1, [
        mel('horns', 'theme', { oct: -1, vel: 0.9, bus: 'brass', dbl: [{ inst: 'strings', oct: 1, vel: 0.84 }, { inst: 'trumpets', oct: 0, vel: 0.5, bus: 'brass' }] }),
        pad('choirStac', { bus: 'choir', pat: 'X..X ..X. X..X ..X.', reg: 60, n: 4, vel: 0.56 }),
        pad('strings', { reg: 55, n: 4, vel: 0.4, ext: 'triad' }),
        ost('braam', '0--- ---- ---- ----', { every: 2, reg: 28, vel: 0.8, bus: 'fx' }),
        bass('synBass', '0000 0000 0000 0000', { reg: 36, vel: 0.56, acc: 'X.ox .ox. X.ox .ox.' }),
        bass('sub', '0--- ---- ---- ----', { reg: 36, vel: 0.66 }),
        ost('spiccato', '0000 2000 3000 2000', { reg: 50, shape: true, acc: 'X..x ..x. X..x ..x.', vel: 0.56 }),
        big(false),
      ], { say: 'The hit. Braams every two bars, choir chanting three-three-two, your theme in the horns.' }),

      ...when(L >= 2, sec('Fallout', 'climax', 8, 0.88, [
        mel('strings', 'call', { oct: 1, vel: 0.86 }),
        mel('lowBrass', 'response', { oct: -2, vel: 0.84, bus: 'brass', dbl: [{ inst: 'horns', oct: -1, vel: 0.8, bus: 'brass' }] }),
        pad('choirAh', { bus: 'choir', reg: 60, n: 4, vel: 0.5 }),
        bass('synBass', '0000 0000 0000 0000', { reg: 36, vel: 0.56, acc: 'X.ox .ox. X.ox .ox.' }),
        bass('sub', '0--- ---- ---- ----', { reg: 36, vel: 0.62 }),
        ost('arp', '0213 0213 0213 0213', { reg: 62, vel: 0.3 }),
        big(true),
      ], { prog: 'B', enter: 'hit', say: 'Strings call, low brass answers from the bottom of the orchestra.' })),

      ...when(L >= 1, sec('Silence', 'break', 4, 0.15, [
        mel('piano', 'sparse', { vel: 0.56 }),
        bass('sub', '0--- ---- ---- ----', { reg: 36, vel: 0.46 }),
        pad('choirOo', { bus: 'choir', reg: 58, n: 3, vel: 0.26, art: 1 }),
        drums({ tick: 'x... x... x... x...' }, { vel: 0.5 }),
      ], { exit: ['riser', 'roll', 'cut'], say: 'Everything stops except the clock.' })),

      ...when(L >= 1, sec('Extinction', 'finale', 8, 1, [
        mel('strings', 'theme', { oct: 1, vel: 0.95, dbl: [{ inst: 'trumpets', oct: 0, vel: 0.76, bus: 'brass' }, { inst: 'horns', oct: -1, vel: 0.86, bus: 'brass' }] }),
        mel('lowBrass', 'augmented', { oct: -2, vel: 0.8, bus: 'brass' }),
        pad('choirStac', { bus: 'choir', pat: 'X..X ..X. X..X ..X.', reg: 61, n: 4, vel: 0.6 }),
        pad('choirAh', { bus: 'choir', reg: 60, n: 4, vel: 0.46 }),
        ost('braam', '0--- ---- ---- ----', { every: 2, reg: 28, vel: 0.84, bus: 'fx' }),
        bass('synBass', '0000 0000 0000 0000', { reg: 36, vel: 0.58, acc: 'X.ox .ox. X.ox .ox.' }),
        bass('sub', '0--- ---- ---- ----', { reg: 36, vel: 0.68 }),
        ost('spiccato', '0020 0030 0020 0040', { reg: 50, shape: true, acc: 'X..x ..x. X..x ..x.', vel: 0.58 }),
        big(true),
      ], { prog: 'final', lift: up, say: 'A semitone up and nothing held back.' })),

      sec('Aftermath', 'outro', L === 0 ? 2 : 4, 0.1, [
        mel('piano', 'statement', { oct: -1, vel: 0.5, to: 2 }),
        bass('sub', '0--- ---- ---- ----', { reg: 36, vel: 0.46 }),
        pad('tremolo', { pedal: true, reg: 60, n: 2, vel: 0.18, art: 4 }),
      ], { prog: 'pedal', lift: up, enter: 'drop', say: 'The floor drops out. What is left is your motif and the dust.' }),
    ];
  },
};

// ═════════════════════════════ NEON DRIVE — synthwave ═════════════════════════════

const neon: StylePreset = {
  id: 'neon',
  name: 'Neon Drive',
  genre: 'Synthwave',
  tagline: 'Analog pads, gated snares and a midnight highway.',
  palette: ['#ff2e97', '#00e5ff', '#1a0b3b'],
  meter: '4/4',
  tempo: [98, 114],
  modes: [['aeolian', 1], ['dorian', 0.9], ['minorPent', 0.75], ['mixolydian', 0.55], ['ionian', 0.55], ['lydian', 0.45]],
  sync: 0.45,
  chordExt: 'add9',
  padVoice: 'pluck',
  reverb: { size: 2.6, damp: 0.5, wet: 0.28, predelay: 0.02 },
  tilt: { low: 1.5, high: 1.5 },
  delay: { beats: 0.75, fb: 0.36, mix: 0.24 },
  humanize: 0.25,
  pump: 0.32,
  fx: { big: [['crash', 0.7], ['subDrop', 0.5]], hit: [['crash', 0.5]], drop: [['subDrop', 0.6]], roll: 'snare', riser: true },
  titles: {
    a: ['Midnight', 'Neon', 'Chrome', 'Laser', 'Sunset', 'Turbo', 'Night', 'Starlight'],
    b: ['Highway', 'Horizon', 'Runner', 'Boulevard', 'Overdrive', 'Skyline', 'Dreams', 'Protocol'],
    join: '',
  },
  form(len) {
    const L = lv(len);
    const up = L >= 1 ? 2 : 0;
    const beat = (v: number, open: boolean): DrumLayer =>
      drums(
        {
          kick: 'X... .... X.x. ....',
          snare: '.... X... .... X...',
          hat: 'x.x. x.x. x.x. x.xx',
          ...(open ? { hatOpen: '..x. ..x. ..x. ..x.', clap: '.... X... .... X...' } : {}),
        },
        { vel: v, fill: { kick: 'X... .... X... ....', snare: '.... X... x.x. xxxx', hat: 'x.x. x.x. x.x. x.x.' } },
      );
    return [
      sec('Ignition', 'intro', 4, 0.25, [
        ost('arp', '0213 0213 0213 0213', { reg: 57, vel: 0.36, cresc: [0.5, 1.1] }),
        pad('sawPad', { reg: 57, n: 4, vel: 0.36, art: 1 }),
        bass('synBass', '0--- ---- ---- ----', { reg: 36, vel: 0.5 }),
        drums({ kick: 'X... .... X... ....', hat: '..x. ..x. ..x. ..x.' }, { from: 2, vel: 0.6 }),
      ], { say: 'An arpeggiator spells out your chords. The engine turns over.' }),

      sec('Night Highway', 'theme', 8, 0.55, [
        mel('pluck', 'theme', { vel: 0.74 }),
        pad('sawPad', { reg: 57, n: 4, vel: 0.36 }),
        ost('arp', '0213 0213 0213 0213', { reg: 57, vel: 0.26 }),
        bass('synBass', '0.0. 0.0. 0.0. 0.0.', { reg: 36, vel: 0.6, acc: 'X.o. x.o. X.o. x.o.' }),
        beat(0.74, false),
      ], { say: 'Your theme on a bright pluck, eighth-note bass rolling underneath.' }),

      ...when(L >= 2, sec('Tunnel', 'theme', 8, 0.6, [
        mel('lead', 'call', { vel: 0.7 }),
        mel('pluck', 'response', { oct: 1, vel: 0.6 }),
        pad('sawPad', { reg: 57, n: 4, vel: 0.36 }),
        bass('synBass', '0.0. 0.0. 0.0. 0.1.', { reg: 36, vel: 0.6, acc: 'X.o. x.o. X.o. x.o.' }),
        beat(0.76, false),
      ], { prog: 'B', say: 'Lead and pluck trade phrases over a new set of chords.' })),

      sec('Rev', 'build', 4, 0.7, [
        mel('pluck', 'fragment', { vel: 0.66, cresc: [0.7, 1.1] }),
        pad('sawPad', { reg: 59, n: 4, vel: 0.36, cresc: [0.6, 1.3] }),
        bass('synBass', '0.0. 0.0. 0.0. 0.0.', { reg: 36, vel: 0.56 }),
        drums({ kick: 'X... X... X... X...', snare: '.... x... .... x... | .... x... x... x... | x.x. x.x. x.x. x.x. | xxxx xxxx xxxx xxxx' }, { vel: 0.7, cresc: [0.5, 1.1] }),
      ], { exit: ['riser', 'cut'], say: 'Snare roll, filter opening, foot down.' }),

      sec('Neon Horizon', 'climax', 8, 1, [
        mel('lead', 'theme', { vel: 0.88, dbl: [{ inst: 'superSaw', oct: 0, vel: 0.5 }] }),
        counter('pluck', { reg: 60, vel: 0.46, bus: 'ost' }),
        pad('superSaw', { reg: 57, n: 4, vel: 0.44 }),
        ost('arp', '0213 2130 0213 2132', { reg: 60, vel: 0.36 }),
        bass('synBass', '0010 0010 0010 0011', { reg: 36, vel: 0.64, acc: 'X.xo X.xo X.xo X.xx' }),
        bass('sub', '0--- ---- ---- ----', { reg: 36, vel: 0.5 }),
        beat(0.86, true),
      ], { say: 'The chorus: lead synth with the full theme, supersaws wide open.' }),

      ...when(L >= 1, sec('Rearview', 'break', L >= 2 ? 8 : 4, 0.25, [
        mel('ePiano', 'inverted', { vel: 0.62 }),
        pad('warmPad', { reg: 57, n: 4, vel: 0.4, art: 1 }),
        bass('synBass', '0--- ---- ---- ----', { reg: 36, vel: 0.46 }),
        drums({ hat: '..x. ..x. ..x. ..x.' }, { vel: 0.4, from: 2 }),
      ], { exit: ['riser', 'roll', 'cut'], say: 'City lights behind you. An electric piano turns the motif over.' })),

      ...when(L >= 1, sec('Overdrive', 'finale', 8, 1, [
        mel('lead', 'theme', { oct: 1, vel: 0.9, dbl: [{ inst: 'superSaw', oct: 0, vel: 0.56 }, { inst: 'pluck', oct: 0, vel: 0.5 }] }),
        pad('superSaw', { reg: 57, n: 4, vel: 0.46 }),
        pad('choirOo', { bus: 'choir', reg: 60, n: 3, vel: 0.3 }),
        ost('arp', '0213 2130 0213 2132', { reg: 60, vel: 0.38 }),
        bass('synBass', '0010 0010 0010 0011', { reg: 36, vel: 0.66, acc: 'X.xo X.xo X.xo X.xx' }),
        bass('sub', '0--- ---- ---- ----', { reg: 36, vel: 0.5 }),
        beat(0.9, true),
      ], { prog: 'final', lift: up, say: 'Key change, top down, an octave higher.' })),

      sec('Taillights', 'outro', 4, 0.2, [
        mel('pluck', 'statement', { vel: 0.56, to: 2 }),
        ost('arp', '0213 0213 0213 0213', { reg: 57, vel: 0.3, cresc: [1, 0.3] }),
        pad('sawPad', { reg: 57, n: 4, vel: 0.36, art: 4 }),
        bass('synBass', '0--- ---- ---- ----', { reg: 36, vel: 0.46 }),
      ], { prog: 'pedal', lift: up, say: 'The arpeggio fades into the distance.' }),
    ];
  },
};

// ═════════════════════════════ MIDNIGHT TAPE — lo-fi ═════════════════════════════

const tape: StylePreset = {
  id: 'tape',
  name: 'Midnight Tape',
  genre: 'Lo-fi hip hop',
  tagline: 'Dusty keys, soft kicks and rain on the window.',
  palette: ['#f4a261', '#b5838d', '#22223b'],
  meter: '4/4',
  tempo: [70, 86],
  modes: [['dorian', 1], ['aeolian', 0.9], ['ionian', 0.75], ['mixolydian', 0.65], ['majorPent', 0.65], ['minorPent', 0.65], ['lydian', 0.55]],
  sync: 0.5,
  chordExt: 'ninth',
  padVoice: 'ePiano',
  reverb: { size: 1.6, damp: 0.65, wet: 0.2, predelay: 0.012 },
  tilt: { low: 1.5, high: -4.5 },
  swing: 0.2,
  humanize: 1.3,
  fx: { big: [], hit: [], drop: [], roll: 'snareLofi' },
  titles: {
    a: ['Rainy', 'Sleepy', 'Late', 'Quiet', 'Faded', 'Warm', 'Paper', 'Slow'],
    b: ['Window', 'Sunday', 'Tape', 'Coffee', 'Polaroid', 'Rooftop', 'Bus Ride', 'Afternoon'],
    join: '',
  },
  form(len) {
    const L = lv(len);
    const beat = (kick: boolean): DrumLayer =>
      drums(
        {
          ...(kick ? { kickSoft: 'X... ..x. ..X. ....' } : {}),
          snareLofi: '.... X... .... X...',
          hat: 'x.x. x.x. x.x. x.xg',
          shaker: '..g. ..g. ..g. ..g.',
        },
        { vel: 0.7, fill: { kickSoft: 'X... ..x. ..X. ....', snareLofi: '.... X... ..x. X.xx', hat: 'x.x. x.x. x.x. x...' } },
      );
    return [
      sec('Needle Drop', 'intro', 4, 0.2, [
        pad('ePiano', { reg: 57, n: 4, vel: 0.5, pat: 'X--- ---- ..x- ----' }),
        mel('felt', 'statement', { vel: 0.5, from: 2 }),
        drums({ vinyl: 'X' }, { vel: 0.5 }),
      ], { say: 'Vinyl crackle, and an electric piano finding your chords with ninths on top.' }),

      sec('Rainy Window', 'theme', 8, 0.5, [
        mel('felt', 'loop', { vel: 0.66 }),
        pad('ePiano', { reg: 57, n: 4, vel: 0.46, pat: 'X--- --x- ---- x---' }),
        bass('sub', '0--- --0- ..0- ----', { reg: 38, vel: 0.6 }),
        beat(true),
        drums({ vinyl: 'X' }, { vel: 0.5 }),
      ], { say: 'Your motif becomes the loop. The beat leans back behind it.' }),

      ...when(L >= 1, sec('Second Cup', 'theme', 8, 0.5, [
        mel('felt', 'call', { vel: 0.64 }),
        mel('celesta', 'response', { oct: 1, vel: 0.44, bus: 'color' }),
        pad('ePiano', { reg: 57, n: 4, vel: 0.46, pat: 'X--- ---- x--- --x-' }),
        pad('warmPad', { reg: 60, n: 3, vel: 0.26 }),
        bass('sub', '0--- ---- ..0- --5-', { reg: 38, vel: 0.6 }),
        beat(true),
        drums({ vinyl: 'X' }, { vel: 0.5 }),
      ], { prog: 'B', say: 'A music-box answer to every phrase, over different chords.' })),

      ...when(L >= 2, sec('Steam', 'break', 4, 0.25, [
        mel('ePiano', 'sparse', { vel: 0.5 }),
        pad('warmPad', { reg: 58, n: 4, vel: 0.34 }),
        drums({ hat: '..g. ..g. ..g. ..g.', vinyl: 'X' }, { vel: 0.5 }),
      ], { say: 'The drums step out for a moment.' })),

      ...when(L >= 2, sec('Daydream', 'theme', 8, 0.45, [
        mel('ePiano', 'inverted', { oct: 1, vel: 0.56 }),
        pad('warmPad', { reg: 58, n: 4, vel: 0.34 }),
        pad('felt', { reg: 57, n: 3, vel: 0.4, pat: 'x--- ---- ..x- ----' }),
        bass('sub', '0--- ---- ..0- ----', { reg: 38, vel: 0.6 }),
        beat(true),
        drums({ vinyl: 'X' }, { vel: 0.5 }),
      ], { prog: 'B', say: 'The motif drifts upside-down for a while.' })),

      sec('Still Up', 'theme', 8, 0.55, [
        mel('felt', 'theme', { vel: 0.66, dbl: [{ inst: 'bamboo', oct: 1, vel: 0.3, bus: 'color' }] }),
        pad('ePiano', { reg: 57, n: 4, vel: 0.46, pat: 'X--- --x- ---- x---' }),
        pad('warmPad', { reg: 60, n: 3, vel: 0.26 }),
        bass('sub', '0--- --0- ..0- ----', { reg: 38, vel: 0.62 }),
        beat(true),
        drums({ vinyl: 'X' }, { vel: 0.5 }),
      ], { prog: 'final', say: 'The whole theme now, with a breathy flute an octave above.' }),

      sec('Run-Out Groove', 'outro', 4, 0.15, [
        mel('felt', 'statement', { vel: 0.5, to: 2 }),
        pad('ePiano', { reg: 57, n: 4, vel: 0.44, pat: 'X--- ---- ---- ----' }),
        drums({ vinyl: 'X' }, { vel: 0.5 }),
      ], { prog: 'pedal', say: 'The tape runs out.' }),
    ];
  },
};

// ═════════════════════════════ PHANTOM — dark trap ═════════════════════════════

const phantom: StylePreset = {
  id: 'phantom',
  name: 'Phantom',
  genre: 'Dark trap',
  tagline: 'Sliding 808s, rattling hats and a bell melody in the fog.',
  palette: ['#b388ff', '#ff1744', '#0d0d16'],
  meter: '4/4',
  tempo: [132, 148],
  modes: [['phrygian', 1], ['harmonic', 0.95], ['aeolian', 0.9], ['minorPent', 0.65]],
  sync: 0.4,
  chordExt: 'triad',
  padVoice: 'bell',
  reverb: { size: 2.4, damp: 0.5, wet: 0.26, predelay: 0.02 },
  tilt: { low: 3, high: 1 },
  delay: { beats: 0.75, fb: 0.3, mix: 0.18 },
  humanize: 0.2,
  fx: { big: [['subDrop', 0.8], ['crash', 0.5], ['impact', 0.6]], hit: [['crash', 0.4]], drop: [['subDrop', 0.7]], roll: 'snare', riser: true },
  titles: {
    a: ['Phantom', 'Midnight', 'Cold', 'Hollow', 'Black', 'Silent', 'Venom', 'Ghost'],
    b: ['Ritual', 'Smoke', 'Season', 'Chapel', 'Mirror', 'Signal', 'District', 'Halo'],
    join: '',
  },
  form(len) {
    const L = lv(len);
    const up = L >= 1 ? 1 : 0;
    const beat = (v: number, busy: boolean): DrumLayer =>
      drums(
        {
          kickDeep: 'X... .... ...x .... | X... ..x. .... ..x.',
          clap: '.... .... X... ....',
          snare: '.... .... X... .... | .... .... X... ...g',
          hat: busy ? 'x.x. xrx. x.x. rrx. | x.xx x.x. xrx. x.rr' : 'x.x. x.x. x.r. x.x. | x.x. xrx. x.x. x.x.',
          hatOpen: '.... .... .... ..x. | .... .... .... ....',
        },
        { vel: v, fill: { kickDeep: 'X... .... X... ....', snare: '.... .... X... x.xx', hat: 'x.x. rrrr x.x. rrrr' } },
      );
    return [
      sec('Fog', 'intro', L === 0 ? 4 : 8, 0.2, [
        mel('bell', 'broad', { vel: 0.6 }),
        pad('choirOo', { bus: 'choir', reg: 55, n: 3, vel: 0.34, art: 1 }),
        pad('warmPad', { reg: 50, n: 3, vel: 0.3 }),
      ], { rate: 2, say: 'A bell picks out your motif at half speed. Something is coming.' }),

      sec('Smoke', 'theme', L === 0 ? 8 : 16, 0.6, [
        mel('bell', 'broad', { vel: 0.66 }),
        pad('choirOo', { bus: 'choir', reg: 55, n: 3, vel: 0.3 }),
        ost('pluck', '0... ..2. .... 3... | 0... ..2. ..3. ....', { reg: 60, vel: 0.36 }),
        bass('b808', '0--- ---- ..0- ---- | 0--- --0- ---- 5-0-', { reg: 34, vel: 0.8 }),
        beat(0.76, false),
      ], { rate: 2, say: 'The 808 lands. Hats rattle in double time while your melody stays slow.' }),

      sec('Inhale', 'build', 4, 0.5, [
        mel('pluck', 'fragment', { vel: 0.6, cresc: [0.7, 1.1] }),
        pad('choirOo', { bus: 'choir', reg: 57, n: 4, vel: 0.36, cresc: [0.6, 1.3] }),
        drums({ snare: '.... .... x... .... | .... .... x... x... | x... x... x... x... | x.x. x.x. xxxx xxxx', hat: 'x.x. x.x. x.x. x.x.' }, { vel: 0.66, cresc: [0.5, 1.1] }),
      ], { rate: 2, exit: ['riser', 'cut'], say: 'The 808 drops out. Snare roll, breath in.' }),

      sec('Phantom', 'climax', L === 0 ? 8 : 16, 1, [
        mel('bell', 'broad', { oct: 1, vel: 0.74, dbl: [{ inst: 'lead', oct: 0, vel: 0.5 }] }),
        pad('choirAh', { bus: 'choir', reg: 57, n: 4, vel: 0.44 }),
        pad('lowBrass', { bus: 'brass', reg: 45, n: 2, vel: 0.56, pat: 'X--- ---- .... .... | .... .... X--- ....', art: 2 }),
        ost('pluck', '0.2. 3.2. 0.2. 4.2. | 0.2. 3.2. 4.3. 2.3.', { reg: 60, vel: 0.36 }),
        bass('b808', '0--- ---- ..0- ---- | 0--- --0- ..5- 0-0-', { reg: 34, vel: 0.9 }),
        beat(0.88, true),
      ], { rate: 2, say: 'The drop: brass stabs, a full choir, and the bell an octave up.' }),

      ...when(L >= 2, sec('Wraith', 'theme', 16, 0.7, [
        mel('pluck', 'broad', { vel: 0.66 }),
        counter('bell', { reg: 60, vel: 0.4, bus: 'color' }),
        pad('choirOo', { bus: 'choir', reg: 55, n: 3, vel: 0.32 }),
        pad('strings', { reg: 57, n: 3, vel: 0.3, pat: 'x... .... x... .... | x... .... x.x. ....' }),
        bass('b808', '0--- ---- ---- ..0- | 0--- ---- 5--- 0---', { reg: 34, vel: 0.84 }),
        beat(0.8, false),
      ], { rate: 2, prog: 'B', say: 'A second verse on new chords: pluck on the melody, staccato strings, the bell answering underneath.' })),

      ...when(L >= 1, sec('Hollow', 'break', 8, 0.22, [
        mel('piano', 'broad', { vel: 0.56 }),
        pad('warmPad', { reg: 55, n: 4, vel: 0.34 }),
        pad('choirOo', { bus: 'choir', reg: 57, n: 3, vel: 0.26, from: 4 }),
      ], { rate: 2, exit: ['riser', 'roll', 'cut'], say: 'Just a piano. Your motif and its fall home.' })),

      ...when(L >= 1, sec('Apparition', 'finale', 16, 1, [
        mel('bell', 'broad', { oct: 1, vel: 0.76, dbl: [{ inst: 'lead', oct: 0, vel: 0.56 }, { inst: 'strings', oct: 1, vel: 0.5 }] }),
        pad('choirAh', { bus: 'choir', reg: 57, n: 4, vel: 0.48 }),
        pad('lowBrass', { bus: 'brass', reg: 45, n: 2, vel: 0.6, pat: 'X--- ---- .... .... | .... .... X--- ....', art: 2 }),
        ost('pluck', '0.2. 3.2. 0.2. 4.2. | 0.2. 3.2. 4.3. 2.3.', { reg: 60, vel: 0.38 }),
        ost('spiccato', '0.0. 0.0. 0.0. 0.0.', { reg: 50, vel: 0.4, acc: 'X.o. x.o. X.o. x.o.', x: true }),
        bass('b808', '0--- ---- ..0- ---- | 0--- --0- ..5- 0-0-', { reg: 34, vel: 0.92 }),
        beat(0.9, true),
      ], { rate: 2, lift: up, say: 'Back in, a semitone darker, strings added.' })),

      sec('Vanish', 'outro', 4, 0.12, [
        mel('bell', 'sparse', { vel: 0.5 }),
        pad('choirOo', { bus: 'choir', reg: 55, n: 3, vel: 0.28, art: 4 }),
        pad('warmPad', { reg: 50, n: 3, vel: 0.26, art: 4 }),
      ], { prog: 'pedal', lift: up, enter: 'drop', say: 'Gone.' }),
    ];
  },
};

// ═════════════════════════════ PULSE — melodic house ═════════════════════════════

const pulse: StylePreset = {
  id: 'pulse',
  name: 'Pulse',
  genre: 'Melodic house',
  tagline: 'Four on the floor, breathing pads and a hook that will not leave.',
  palette: ['#00f5d4', '#7b2ff7', '#051937'],
  meter: '4/4',
  tempo: [120, 126],
  modes: [['aeolian', 1], ['dorian', 0.9], ['minorPent', 0.7], ['ionian', 0.65], ['lydian', 0.55], ['mixolydian', 0.55]],
  sync: 0.5,
  chordExt: 'add9',
  padVoice: 'pluck',
  reverb: { size: 2.8, damp: 0.5, wet: 0.28, predelay: 0.02 },
  tilt: { low: 2, high: 1.5 },
  delay: { beats: 0.75, fb: 0.4, mix: 0.26 },
  humanize: 0.15,
  pump: 0.6,
  fx: { big: [['crash', 0.7], ['subDrop', 0.6], ['impact', 0.5]], hit: [['crash', 0.5]], drop: [['subDrop', 0.6]], roll: 'snare', riser: true },
  titles: {
    a: ['Pulse', 'Tidal', 'Solar', 'Violet', 'Afterglow', 'Lumen', 'Higher', 'Open'],
    b: ['State', 'Bloom', 'Motion', 'Hours', 'Signal', 'Air', 'Skies', 'Current'],
    join: '',
  },
  form(len) {
    const L = lv(len);
    const beat = (v: number, full: boolean): DrumLayer =>
      drums(
        {
          kick: 'X... X... X... X...',
          hat: '..x. ..x. ..x. ..x.',
          ...(full ? { clap: '.... X... .... X...', shaker: 'g.gg g.gg g.gg g.gg', hatOpen: '..x. ..x. ..x. ..x.' } : {}),
        },
        { vel: v, fill: { kick: 'X... X... X... ....', clap: '.... X... .... X.xx', hat: '..x. ..x. ..x. ..x.' } },
      );
    return [
      sec('Low Tide', 'intro', 8, 0.3, [
        mel('pluck', 'loop', { vel: 0.5, cresc: [0.5, 1.1] }),
        pad('warmPad', { reg: 57, n: 4, vel: 0.3, from: 4, art: 1 }),
        bass('sub', '0--- ---- ---- ----', { reg: 36, vel: 0.5, from: 4 }),
        drums({ kick: 'X... X... X... X...' }, { vel: 0.74 }),
        drums({ hat: '..x. ..x. ..x. ..x.' }, { from: 4, vel: 0.56 }),
      ], { say: 'A kick drum and your motif on a filtered pluck, looping.' }),

      sec('Current', 'theme', 8, 0.6, [
        mel('pluck', 'loop', { vel: 0.7 }),
        pad('warmPad', { reg: 57, n: 4, vel: 0.36 }),
        bass('synBass', '..0. ..0. ..0. ..01', { reg: 36, vel: 0.66 }),
        bass('sub', '0--- ---- ---- ----', { reg: 36, vel: 0.46 }),
        beat(0.8, true),
      ], { say: 'The bass answers on every off-beat and the whole mix starts to breathe with the kick.' }),

      ...when(L >= 2, sec('Undertow', 'theme', 8, 0.66, [
        mel('pluck', 'call', { vel: 0.7 }),
        mel('lead', 'response', { vel: 0.56 }),
        pad('warmPad', { reg: 57, n: 4, vel: 0.36 }),
        ost('arp', '0.23 .2.3 0.23 .2.4', { reg: 60, vel: 0.3 }),
        bass('synBass', '..0. ..0. ..0. ..01', { reg: 36, vel: 0.66 }),
        bass('sub', '0--- ---- ---- ----', { reg: 36, vel: 0.46 }),
        beat(0.82, true),
      ], { prog: 'B' })),

      sec('Weightless', 'break', 8, 0.25, [
        mel('piano', 'theme', { vel: 0.66 }),
        pad('warmPad', { reg: 57, n: 4, vel: 0.4, art: 1 }),
        pad('strings', { reg: 60, n: 4, vel: 0.3, from: 4, cresc: [0.6, 1.3], art: 1 }),
        pad('choirOo', { bus: 'choir', reg: 60, n: 3, vel: 0.3, from: 4 }),
        drums({ snare: '.... .... .... .... | .... .... .... .... | x... x... x... x... | x.x. x.x. xxxx xxxx', clap: '.... X... .... X...' }, { from: 4, vel: 0.6, cresc: [0.5, 1.1] }),
      ], { exit: ['riser', 'cut'], say: 'The kick lets go. A piano plays the whole theme and the room opens up.' }),

      sec('Pulse', 'climax', L === 0 ? 8 : 16, 1, [
        mel('lead', 'theme', { vel: 0.84, dbl: [{ inst: 'pluck', oct: 1, vel: 0.46 }] }),
        pad('superSaw', { reg: 57, n: 4, vel: 0.46 }),
        pad('superSaw', { reg: 60, n: 3, vel: 0.36, pat: 'X..X ..X. ..X. .X..', x: true }),
        ost('arp', '0.23 .2.3 0.23 .2.4', { reg: 60, vel: 0.32 }),
        bass('synBass', '..0. ..0. ..0. ..01', { reg: 36, vel: 0.7 }),
        bass('sub', '0--- ---- ---- ----', { reg: 36, vel: 0.5 }),
        pad('choirOo', { bus: 'choir', reg: 60, n: 3, vel: 0.3, from: L === 0 ? 4 : 8 }),
        beat(0.9, true),
      ], { prog: L === 0 ? 'A' : 'final', say: 'The drop. Supersaw chords ducking under every kick, your theme on top.' }),

      ...when(L >= 2, sec('Hold', 'break', 4, 0.3, [
        mel('piano', 'statement', { vel: 0.62 }),
        pad('warmPad', { reg: 57, n: 4, vel: 0.4, art: 1 }),
        drums({ clap: '.... X... .... X...', snare: '.... .... .... .... | .... .... .... .... | x... x... x... x... | x.x. x.x. xxxx xxxx' }, { vel: 0.6, cresc: [0.5, 1.1] }),
      ], { exit: ['riser', 'cut'], say: 'One more breath.' })),

      ...when(L >= 2, sec('Afterglow', 'finale', 16, 1, [
        mel('lead', 'theme', { oct: 1, vel: 0.84, dbl: [{ inst: 'pluck', oct: 0, vel: 0.5 }, { inst: 'piano', oct: 0, vel: 0.5 }] }),
        pad('superSaw', { reg: 57, n: 4, vel: 0.48 }),
        pad('superSaw', { reg: 60, n: 3, vel: 0.36, pat: 'X..X ..X. ..X. .X..' }),
        pad('choirOo', { bus: 'choir', reg: 60, n: 3, vel: 0.32 }),
        ost('arp', '0.23 .2.3 0.23 .2.4', { reg: 60, vel: 0.34 }),
        bass('synBass', '..0. ..0. ..0. ..01', { reg: 36, vel: 0.7 }),
        bass('sub', '0--- ---- ---- ----', { reg: 36, vel: 0.5 }),
        beat(0.92, true),
      ], { prog: 'final', lift: 2, say: 'The last drop, a whole step up, everything in.' })),

      sec('Ebb', 'outro', L === 0 ? 4 : 8, 0.3, [
        mel('pluck', 'loop', { vel: 0.56, cresc: [1, 0.4] }),
        pad('warmPad', { reg: 57, n: 4, vel: 0.34, art: 4 }),
        bass('sub', '0--- ---- ---- ----', { reg: 36, vel: 0.46 }),
        drums({ kick: 'X... X... X... X...', hat: '..x. ..x. ..x. ..x.' }, { vel: 0.7, to: L === 0 ? 2 : 6 }),
      ], { lift: L >= 2 ? 2 : 0, say: 'Layers leave one by one until only the hook is left.' }),
    ];
  },
};

// ═════════════════════════════ AETHER — ambient ═════════════════════════════

const aether: StylePreset = {
  id: 'aether',
  name: 'Aether',
  genre: 'Ambient · space',
  tagline: 'No drums. Slow light, long reverb, and room to think.',
  palette: ['#a0e9ff', '#c8b6ff', '#0b132b'],
  meter: '4/4',
  tempo: [54, 64],
  modes: [['lydian', 1], ['majorPent', 0.85], ['ionian', 0.8], ['dorian', 0.8], ['aeolian', 0.7], ['mixolydian', 0.6]],
  sync: 0.1,
  chordExt: 'ninth',
  padVoice: 'celesta',
  reverb: { size: 6.5, damp: 0.42, wet: 0.5, predelay: 0.05 },
  tilt: { low: 0.5, high: 0.5 },
  delay: { beats: 1.5, fb: 0.45, mix: 0.24 },
  humanize: 1.2,
  fx: { big: [], hit: [], drop: [], roll: 'timpani', gliss: 'harp' },
  titles: {
    a: ['Aether', 'Parallax', 'Perihelion', 'Halo', 'Drift', 'Lagrange', 'Zenith', 'Voyager'],
    b: ['at Rest', 'in Blue', 'Rising', 'Station', 'Light', 'Fields', 'Lullaby', 'Bloom'],
    join: '',
  },
  form(len) {
    const L = lv(len);
    return [
      sec('Drift', 'intro', 4, 0.15, [
        pad('warmPad', { pedal: true, reg: 48, n: 3, vel: 0.4, art: 1 }),
        ost('celesta', '?... ..?. .?.. ?...', { reg: 72, vel: 0.36, bus: 'color' }),
        pad('choirOo', { bus: 'choir', pedal: true, reg: 60, n: 2, vel: 0.22, from: 2, art: 1 }),
      ], { prog: 'pedal', say: 'A slow tide of pads. Sparks from your key, at random.' }),

      sec('Signal', 'theme', 8, 0.35, [
        mel('felt', 'augmented', { vel: 0.6 }),
        pad('warmPad', { reg: 55, n: 4, vel: 0.4, art: 1 }),
        pad('choirOo', { bus: 'choir', reg: 60, n: 3, vel: 0.26, from: 4, art: 1 }),
        ost('glock', '.... ?... .... ..?.', { reg: 74, vel: 0.26, bus: 'color' }),
        bass('sub', '0--- ---- ---- ----', { reg: 36, vel: 0.4 }),
      ], { rate: 2, say: 'Your motif at half speed on a felt piano, each note given time to dissolve.' }),

      ...when(L >= 1, sec('Orbit', 'theme', 8, 0.5, [
        mel('flute', 'theme', { vel: 0.56 }),
        counter('cello', { reg: 52, vel: 0.46 }),
        pad('strings', { reg: 57, n: 4, vel: 0.34, art: 1 }),
        pad('warmPad', { reg: 55, n: 4, vel: 0.34 }),
        ost('harp', '0... 2... 4... 2...', { reg: 55, vel: 0.36, bus: 'color' }),
        bass('sub', '0--- ---- ---- ----', { reg: 36, vel: 0.42 }),
      ], { exit: ['swell'], say: 'A flute carries the theme; a cello moves against it in slow contrary motion.' })),

      ...when(L >= 1, sec('Deep Field', 'climax', 8, 0.6, [
        mel('soprano', 'augmented', { vel: 0.6, dbl: [{ inst: 'strings', oct: 1, vel: 0.56 }] }),
        pad('choirAh', { bus: 'choir', reg: 60, n: 4, vel: 0.4, art: 1 }),
        pad('strings', { reg: 57, n: 5, vel: 0.4, art: 1 }),
        pad('warmPad', { reg: 55, n: 4, vel: 0.34 }),
        ost('celesta', '?.?. ..?. ?... ?.?.', { reg: 72, vel: 0.32, bus: 'color' }),
        ost('bell', '0... .... .... ....', { every: 2, reg: 55, vel: 0.36, bus: 'color' }),
        bass('sub', '0--- ---- ---- ----', { reg: 36, vel: 0.5 }),
      ], { rate: 2, prog: 'B', exit: ['gliss'], say: 'The widest moment: a voice far above, strings and choir as one slow breath.' })),

      ...when(L >= 2, sec('Parallax', 'break', 8, 0.3, [
        mel('bamboo', 'inverted', { vel: 0.5 }),
        pad('warmPad', { reg: 55, n: 4, vel: 0.4, art: 1 }),
        ost('harp', '0... 2... 4... 2...', { reg: 55, vel: 0.32, bus: 'color' }),
        bass('sub', '0--- ---- ---- ----', { reg: 36, vel: 0.4 }),
      ], { say: 'The same shape, seen from the other side.' })),

      sec('Return', 'outro', 4, 0.12, [
        mel('felt', 'statement', { vel: 0.5, to: 2 }),
        pad('warmPad', { pedal: true, reg: 48, n: 3, vel: 0.4, art: 4 }),
        ost('celesta', '?... .... ..?. ....', { reg: 72, vel: 0.3, bus: 'color' }),
      ], { prog: 'pedal', say: 'Your notes, once more, and then the dark between stars.' }),
    ];
  },
};

// ═════════════════════════════ SILK & THUNDER — pentatonic cinematic ═════════════════════════════

const silk: StylePreset = {
  id: 'silk',
  name: 'Silk & Thunder',
  genre: 'Pentatonic cinematic',
  tagline: 'Plucked zither, bamboo flute and war drums across a mountain pass.',
  palette: ['#ff6b6b', '#ffd93d', '#1a1423'],
  meter: '4/4',
  tempo: [86, 102],
  modes: [['minorPent', 1], ['majorPent', 0.9], ['hirajoshi', 0.85], ['dorian', 0.5], ['aeolian', 0.5]],
  sync: 0.3,
  chordExt: 'power',
  padVoice: 'zither',
  reverb: { size: 3.0, damp: 0.45, wet: 0.3, predelay: 0.026 },
  tilt: { low: 2, high: 1.5 },
  humanize: 1,
  fx: {
    big: [['gong', 0.9], ['boom', 0.95], ['crash', 0.5], ['taikoLo', 1]],
    hit: [['taikoLo', 0.9], ['gong', 0.4]],
    drop: [['gong', 0.6]],
    roll: 'taikoMid', run: 'zither', gliss: 'zither',
  },
  titles: {
    a: ['Blade', 'River', 'Crane', 'Lotus', 'Jade', 'Storm', 'Ember', 'Moon'],
    b: ['Nine Mountains', 'the Bamboo Sea', 'the Silent Pass', 'Falling Petals', 'the Iron Gate', 'the Wandering Sword', 'a Thousand Lanterns'],
    join: 'over',
  },
  form(len) {
    const L = lv(len);
    const up = L >= 1 ? 2 : 0;
    const war = (v: number): DrumLayer =>
      drums(
        {
          boom: 'X... .... .... ....',
          taikoLo: 'X..x ..x. X.x. ..x.',
          taikoMid: '..x. xx.. ..x. xx.x',
          taikoHi: '.... ..x. .x.. ...x',
          stick: 'x.x. x.x. x.x. x.x.',
        },
        { vel: v, fill: { taikoLo: 'X.X. X.X. XXXX XXXX', taikoMid: '.x.x .x.x xxxx xxxx', taikoHi: '..x. ..x. x.x. xxxx' } },
      );
    return [
      sec('Mist', 'intro', 4, 0.15, [
        mel('bamboo', 'statement', { vel: 0.6 }),
        pad('strings', { pedal: true, reg: 43, n: 3, vel: 0.3, art: 4 }),
        ost('zither', '0... .... .... 2...', { reg: 55, vel: 0.36, bus: 'color', every: 2 }),
      ], { prog: 'pedal', enter: 'drop', say: 'A gong, then a bamboo flute alone in the mist with your motif.' }),

      sec('The Wanderer', 'theme', 8, 0.42, [
        mel('zither', 'theme', { vel: 0.8, orn: true, detached: true }),
        pad('strings', { reg: 57, n: 4, vel: 0.34, art: 1, ext: 'triad' }),
        bass('pizz', '0... .... 5... ....', { reg: 40, vel: 0.56 }),
        ost('zither', '0.2. 3.2. 0.2. 3.2.', { reg: 50, vel: 0.26, bus: 'color', from: 4 }),
        drums({ taikoLo: 'X... .... .... x...', stick: '.... ..x. .... ..xx' }, { from: 4, vel: 0.45 }),
      ], { say: 'The zither plays your theme with grace notes leaning into the strong beats.' }),

      ...when(L >= 2, sec('River Crossing', 'theme', 8, 0.52, [
        mel('bamboo', 'theme', { oct: 1, vel: 0.66 }),
        counter('cello', { reg: 52, vel: 0.56 }),
        pad('strings', { reg: 57, n: 4, vel: 0.36, ext: 'triad' }),
        ost('zither', '0.2. 3.2. 4.2. 3.2.', { reg: 50, vel: 0.36, bus: 'color' }),
        bass('pizz', '0... 5... 0... 5...', { reg: 40, vel: 0.56 }),
        drums({ taikoLo: 'X... .... x... ....', stick: '..x. ..x. ..x. ..xx' }, { vel: 0.5 }),
      ], { prog: 'B', say: 'Flute over a walking pizzicato, cello in counterpoint.' })),

      sec('War Drums', 'build', L === 0 ? 4 : 8, 0.66, [
        mel('bamboo', 'fragment', { vel: 0.66, cresc: [0.7, 1.15] }),
        ost('zither', '0000 2000 3000 2000', { reg: 55, shape: true, acc: 'X.o. x.o. X.o. x.o.', vel: 0.44, cresc: [0.6, 1.15] }),
        pad('tremolo', { reg: 62, n: 4, vel: 0.3, cresc: [0.5, 1.3], ext: 'triad' }),
        bass('strings', '0... 0... 0... 0...', { reg: 38, vel: 0.55 }),
        drums({ taikoLo: 'X..x ..x. X.x. ..x.', taikoMid: '..x. xx.. ..x. xx.x', stick: 'x.x. x.x. x.x. x.x.' }, { vel: 0.7, cresc: [0.5, 1.1] }),
      ], { exit: ['swell', 'roll', 'run', 'cut'], say: 'The drums arrive from over the ridge. Tremolo zither, rising flute.' }),

      sec('Thunder', 'climax', 8, 1, [
        mel('strings', 'theme', { oct: 1, vel: 0.9, dbl: [{ inst: 'bamboo', oct: 1, vel: 0.6 }, { inst: 'horns', oct: -1, vel: 0.8, bus: 'brass' }] }),
        counter('strings', { reg: 60, vel: 0.5 }),
        pad('choirAh', { bus: 'choir', reg: 60, n: 4, vel: 0.5, ext: 'triad' }),
        ost('zither', '0204 0304 0204 0305', { reg: 55, vel: 0.5, bus: 'color' }),
        bass('lowBrass', '0--- ---- 0--- 5---', { reg: 38, vel: 0.7, bus: 'brass' }),
        bass('strings', '0.0. 0.0. 0.0. 0.0.', { reg: 38, vel: 0.56, acc: 'X.o. x.o. X.o. x.o.' }),
        bass('sub', '0--- ---- ---- ----', { reg: 36, vel: 0.56 }),
        war(0.9),
      ], { say: 'Full strings and horns take the theme while the taiko ensemble drives underneath.' }),

      ...when(L >= 1, sec('Still Water', 'break', L >= 2 ? 8 : 4, 0.2, [
        mel('zither', 'inverted', { vel: 0.66, orn: true, detached: true }),
        pad('strings', { reg: 57, n: 4, vel: 0.28, art: 1, ext: 'triad' }),
        bass('pizz', '0... .... .... ....', { reg: 40, vel: 0.5 }),
      ], { exit: ['swell', 'roll', 'gliss'], say: 'One zither by the water, your motif inverted.' })),

      ...when(L >= 1, sec('Heaven and Earth', 'finale', 8, 1, [
        mel('strings', 'theme', { oct: 1, vel: 0.95, dbl: [{ inst: 'trumpets', oct: 0, vel: 0.66, bus: 'brass' }, { inst: 'bamboo', oct: 1, vel: 0.6 }] }),
        mel('horns', 'augmented', { oct: -1, vel: 0.8, bus: 'brass' }),
        pad('choirAh', { bus: 'choir', reg: 62, n: 5, vel: 0.56, ext: 'triad' }),
        ost('zither', '0204 0304 0204 0305', { reg: 55, vel: 0.5, bus: 'color' }),
        bass('strings', '0.0. 0.0. 0.0. 0.0.', { reg: 38, vel: 0.56, acc: 'X.o. x.o. X.o. x.o.' }),
        bass('sub', '0--- ---- ---- ----', { reg: 36, vel: 0.6 }),
        war(0.94),
      ], { prog: 'final', lift: up, say: 'A step higher, with the theme at half speed in the horns below.' })),

      sec('Dusk', 'outro', 4, 0.12, [
        mel('bamboo', 'statement', { vel: 0.56, to: 2 }),
        pad('strings', { pedal: true, reg: 43, n: 3, vel: 0.3, art: 4 }),
        ost('zither', '0... .... 2... ....', { reg: 55, vel: 0.36, bus: 'color', to: 2 }),
      ], { prog: 'pedal', lift: up, enter: 'drop', say: 'The flute again. The road goes on.' }),
    ];
  },
};

// ═════════════════════════════ BREAKNECK — drum & bass ═════════════════════════════

const breakneck: StylePreset = {
  id: 'breakneck',
  name: 'Breakneck',
  genre: 'Cinematic drum & bass',
  tagline: 'Breakbeats at 172, a growling reese, and your theme soaring over it.',
  palette: ['#39ff14', '#00b4d8', '#03071e'],
  meter: '4/4',
  tempo: [168, 176],
  modes: [['aeolian', 1], ['dorian', 0.9], ['minorPent', 0.7], ['phrygian', 0.55], ['ionian', 0.45]],
  sync: 0.5,
  chordExt: 'seventh',
  padVoice: 'ePiano',
  reverb: { size: 2.6, damp: 0.5, wet: 0.26, predelay: 0.018 },
  tilt: { low: 2.5, high: 2 },
  delay: { beats: 1.5, fb: 0.35, mix: 0.2 },
  humanize: 0.2,
  pump: 0.25,
  fx: { big: [['crash', 0.75], ['subDrop', 0.8], ['impact', 0.6]], hit: [['crash', 0.5]], drop: [['subDrop', 0.7]], roll: 'snare', riser: true },
  titles: {
    a: ['Breakneck', 'Terminal', 'Hyper', 'Red', 'Static', 'Kinetic', 'Zero', 'Liquid'],
    b: ['Velocity', 'Run', 'Circuit', 'Shift', 'Vector', 'Sprint', 'Skyway', 'Fall'],
    join: '',
  },
  form(len) {
    const L = lv(len);
    const up = L >= 1 ? 2 : 0;
    const brk = (v: number, busy: boolean): DrumLayer =>
      drums(
        {
          kick: 'X... .... ..X. .... | X... .... ..X. ..x.',
          snare: '.... X... .... X...',
          rim: '.... ..g. .g.. ...g | .... ...g .g.. ..g.',
          hat: busy ? 'x.xx x.xx x.xx x.xx' : 'x.x. x.x. x.x. x.x.',
          ...(busy ? { hatOpen: '.... .... .... ..x.' } : {}),
        },
        { vel: v, fill: { kick: 'X... .... ..X. ....', snare: '.... X... x.x. xxxx', hat: 'x.x. x.x. x.x. x.x.' } },
      );
    return [
      sec('Standby', 'intro', L === 0 ? 8 : 16, 0.3, [
        mel('piano', 'broad', { vel: 0.66 }),
        pad('warmPad', { reg: 57, n: 4, vel: 0.4, art: 1 }),
        pad('strings', { reg: 60, n: 4, vel: 0.26, from: L === 0 ? 4 : 8, art: 1, ext: 'triad' }),
        bass('sub', '0--- ---- ---- ----', { reg: 36, vel: 0.5, from: L === 0 ? 4 : 8 }),
        drums({ hat: 'x.x. x.x. x.x. x.x.', rim: '.... g... .... g...' }, { from: L === 0 ? 4 : 8, vel: 0.5 }),
      ], { rate: 2, say: 'A piano plays your theme at half speed while the hats hint at how fast this is about to get.' }),

      sec('Countdown', 'build', L === 0 ? 4 : 8, 0.6, [
        mel('pluck', 'fragment', { vel: 0.6, cresc: [0.6, 1.1] }),
        pad('warmPad', { reg: 57, n: 4, vel: 0.4, cresc: [0.6, 1.2] }),
        bass('reese', '0--- ---- ---- ----', { reg: 36, vel: 0.5, cresc: [0.4, 1.1] }),
        drums(
          L === 0
            ? { snare: 'x... x... x... x... | x.x. x.x. x.x. x.x. | x.x. x.x. xxxx xxxx | xxxx xxxx xxxx xxxx', kick: 'X... .... X... ....' }
            : { snare: '.... x... .... x... | .... x... .... x... | x... x... x... x... | x... x... x... x... | x.x. x.x. x.x. x.x. | x.x. x.x. x.x. x.x. | x.x. x.x. xxxx xxxx | xxxx xxxx xxxx xxxx', kick: 'X... .... X... ....' },
          { vel: 0.66, cresc: [0.5, 1.1] },
        ),
      ], { rate: 2, exit: ['riser', 'cut'], say: 'The reese bass growls awake under a long snare build.' }),

      sec('Breakneck', 'climax', 16, 1, [
        mel('lead', 'broad', { oct: 1, vel: 0.8, dbl: [{ inst: 'piano', oct: 0, vel: 0.6 }] }),
        pad('ePiano', { reg: 57, n: 4, vel: 0.44, pat: 'X--- ---- ..x- ---- | ..x- ---- x--- ----' }),
        pad('strings', { reg: 60, n: 4, vel: 0.36, ext: 'triad' }),
        bass('reese', '0--- ---- ..0- ---- | 0--- --0- ---- 5-1-', { reg: 36, vel: 0.74 }),
        bass('sub', '0--- ---- ---- ---- | 0--- ---- ---- ----', { reg: 36, vel: 0.56 }),
        ost('arp', '0.2. 3.2. 4.2. 3.2.', { reg: 62, vel: 0.26, x: true }),
        brk(0.86, false),
      ], { rate: 2, say: 'Drop. Breakbeat at full tilt, your melody stretched out wide over the top.' }),

      ...when(L >= 2, sec('Afterburn', 'climax', 16, 0.9, [
        mel('pluck', 'broad', { oct: 1, vel: 0.7 }),
        counter('lead', { reg: 60, vel: 0.44 }),
        pad('ePiano', { reg: 57, n: 4, vel: 0.44, pat: 'X--- ---- ..x- ---- | ..x- ---- x--- ----' }),
        pad('strings', { reg: 60, n: 4, vel: 0.34, ext: 'triad' }),
        bass('reese', '0--- --0- ---- 0--- | 0--- ---- 5--- 1---', { reg: 36, vel: 0.74 }),
        bass('sub', '0--- ---- ---- ---- | 0--- ---- ---- ----', { reg: 36, vel: 0.56 }),
        brk(0.86, true),
      ], { rate: 2, prog: 'B', enter: 'hit', say: 'Same speed, new chords — the pluck takes the tune and the lead answers below it.' })),

      ...when(L >= 1, sec('Slipstream', 'break', 8, 0.25, [
        mel('piano', 'broad', { vel: 0.62 }),
        pad('warmPad', { reg: 57, n: 4, vel: 0.4, art: 1 }),
        pad('choirOo', { bus: 'choir', reg: 60, n: 3, vel: 0.3, from: 4 }),
        bass('sub', '0--- ---- ---- ----', { reg: 36, vel: 0.46 }),
        drums({ snare: '.... .... .... .... | .... .... .... .... | x... x... x... x... | x.x. x.x. xxxx xxxx' }, { from: 4, vel: 0.6, cresc: [0.5, 1.1] }),
      ], { rate: 2, exit: ['riser', 'cut'], say: 'Air. Piano and pads, drums gone.' })),

      ...when(L >= 1, sec('Terminal Velocity', 'finale', 16, 1, [
        mel('lead', 'broad', { oct: 1, vel: 0.84, dbl: [{ inst: 'strings', oct: 1, vel: 0.6 }, { inst: 'piano', oct: 0, vel: 0.6 }] }),
        pad('ePiano', { reg: 57, n: 4, vel: 0.44, pat: 'X--- ---- ..x- ---- | ..x- ---- x--- ----' }),
        pad('strings', { reg: 60, n: 4, vel: 0.4, ext: 'triad' }),
        pad('choirAh', { bus: 'choir', reg: 60, n: 4, vel: 0.36, from: 8, ext: 'triad' }),
        bass('reese', '0--- ---- ..0- ---- | 0--- --0- ---- 5-1-', { reg: 36, vel: 0.78 }),
        bass('sub', '0--- ---- ---- ---- | 0--- ---- ---- ----', { reg: 36, vel: 0.58 }),
        ost('arp', '0.2. 3.2. 4.2. 3.2.', { reg: 62, vel: 0.3 }),
        brk(0.9, true),
      ], { rate: 2, lift: up, say: 'Second drop, busier hats, strings and choir joining the lead.' })),

      sec('Cooldown', 'outro', 8, 0.2, [
        mel('piano', 'broad', { vel: 0.56, to: 4 }),
        pad('warmPad', { reg: 57, n: 4, vel: 0.4, art: 4 }),
        bass('sub', '0--- ---- ---- ----', { reg: 36, vel: 0.44, to: 4 }),
        drums({ hat: 'x.x. x.x. x.x. x.x.' }, { vel: 0.44, to: 4, cresc: [1, 0.3] }),
      ], { prog: 'pedal', lift: up, enter: 'drop', say: 'Engines off. The piano, alone again.' }),
    ];
  },
};

// ═════════════════════════════ BAILE VOLTAGE — Brazilian phonk ═════════════════════════════

const baile: StylePreset = {
  id: 'baile',
  name: 'Baile Voltage',
  genre: 'Brazilian phonk',
  tagline: 'A clipped cowbell hook, a blown-out 808 and a baile beat that will not sit still.',
  palette: ['#c6ff3d', '#ff2bd6', '#12062b'],
  meter: '4/4',
  tempo: [126, 136],
  modes: [['phrygian', 1], ['aeolian', 0.95], ['harmonic', 0.85], ['minorPent', 0.8]],
  sync: 0.7,
  chordExt: 'triad',
  padVoice: 'cowbell',
  reverb: { size: 1.6, damp: 0.55, wet: 0.16, predelay: 0.012 },
  tilt: { low: 3.5, high: 1.5 },
  delay: { beats: 0.75, fb: 0.22, mix: 0.1 },
  mix: { bass: 1.12, drums: 1.08 },
  humanize: 0.08,
  pump: 0.34,
  fx: { big: [['subDrop', 0.85], ['crash', 0.5], ['impact', 0.6]], hit: [['crash', 0.4]], drop: [['subDrop', 0.7]], roll: 'snare', riser: true },
  titles: {
    a: ['Montagem', 'Baile', 'Ritmo', 'Noite', 'Fúria', 'Turbo', 'Sombra', 'Vertigem'],
    b: ['Elétrica', 'Proibida', 'Infinita', 'do Abismo', 'Neon', 'Fantasma', 'Brutal', 'da Meia-Noite'],
    join: '',
  },
  form(len) {
    const L = lv(len);
    const up = L >= 1 ? 1 : 0;
    // the baile beat: a kick that leans on the "and", claps on two and four, rattling hats
    const beat = (v: number, busy: boolean): DrumLayer =>
      drums(
        {
          kickDeep: 'X..x ..X. ..x. X... | X..x ..X. ..x. X.x.',
          clap: '.... X... .... X...',
          snare: busy ? '..g. .... g.x. ..g. | ..g. .... g.x. .xxx' : '.... .... ..x. ....',
          rim: '..x. ..x. x... ..x.',
          hat: busy ? 'x.xx x.xx x.xx xrxx' : 'x.x. x.x. x.x. x.xx',
          hatOpen: '.... .... .... ..x.',
        },
        { vel: v, fill: { kickDeep: 'X..x ..X. X.X. X.X.', snare: '.... .... x.x. xxxx', clap: '.... X... .... X...', hat: 'x.xx x.xx rrrr rrrr' } },
      );
    const sub = (v: number) => bass('b808', '0--0 ..0- ..0- 0--- | 0--0 ..0- ..5- 0-1-', { reg: 34, vel: v });
    return [
      sec('Estática', 'intro', 4, 0.25, [
        mel('cowbell', 'loop', { vel: 0.56, cresc: [0.6, 1] }),
        pad('choirOo', { bus: 'choir', reg: 55, n: 3, vel: 0.3, art: 1 }),
        drums({ hat: 'x.x. x.x. x.x. x.xx', rim: '..x. ..x. x... ..x.' }, { vel: 0.5, from: 2 }),
      ], { rate: 2, exit: ['riser', 'cut'], say: 'Your notes become a cowbell hook, alone in the dark with a hi-hat.' }),

      sec('Montagem', 'theme', L === 0 ? 8 : 16, 0.8, [
        mel('cowbell', 'loop', { vel: 0.8 }),
        sub(0.92),
        pad('choirStac', { bus: 'choir', reg: 57, n: 3, vel: 0.4, pat: '.... .... ..x. .... | .... ..x. .... x...' }),
        beat(0.86, false),
      ], { rate: 2, enter: 'big', say: 'The drop. A distorted 808 follows the kick, and the cowbell will not stop.' }),

      sec('Pressão', 'build', 4, 0.55, [
        mel('cowbell', 'fragment', { vel: 0.66, cresc: [0.7, 1.15] }),
        pad('sawPad', { reg: 57, n: 3, vel: 0.3, cresc: [0.5, 1.3] }),
        drums({ clap: 'X... X... X... X... | X... X... X.X. X.X. | X.X. X.X. X.X. X.X. | XXXX XXXX XXXX XXXX', hat: 'x.x. x.x. x.x. x.x.' }, { vel: 0.6, cresc: [0.5, 1.1] }),
      ], { rate: 2, exit: ['riser', 'cut'], say: 'Bass out. The hook climbs a step every two bars while the claps double.' }),

      sec('Voltagem', 'climax', L === 0 ? 8 : 16, 1, [
        mel('cowbell', 'loop', { vel: 0.86, dbl: [{ inst: 'lead', oct: 0, vel: 0.42 }] }),
        counter('cowbell', { reg: 79, vel: 0.44, bus: 'color', x: true }),
        sub(1),
        bass('reese', '0--- ---- ---- ---- | 0--- ---- ---- ----', { reg: 34, vel: 0.5 }),
        pad('choirStac', { bus: 'choir', reg: 57, n: 4, vel: 0.46, pat: '..x. .... ..x. ..x. | ..x. .... x.x. x...' }),
        pad('lowBrass', { bus: 'brass', reg: 45, n: 2, vel: 0.5, pat: 'X--- .... .... .... | .... .... X--- ....', art: 2 }),
        beat(0.94, true),
      ], { rate: 2, enter: 'big', say: 'Everything at once: a second cowbell on top, choir shouts, brass stabs, the 808 wide open.' }),

      ...when(L >= 2, sec('Madrugada', 'theme', 16, 0.72, [
        mel('pluck', 'loop', { vel: 0.66 }),
        counter('cowbell', { reg: 72, vel: 0.5, bus: 'color' }),
        sub(0.9),
        pad('strings', { reg: 57, n: 3, vel: 0.32, pat: 'x... .... x... .... | x... .... x.x. ....' }),
        beat(0.84, false),
      ], { rate: 2, prog: 'B', say: 'New chords. A synth takes the hook and the cowbell answers it.' })),

      ...when(L >= 1, sec('Respira', 'break', 8, 0.25, [
        mel('piano', 'broad', { vel: 0.58 }),
        pad('warmPad', { reg: 55, n: 4, vel: 0.36 }),
        pad('choirOo', { bus: 'choir', reg: 57, n: 3, vel: 0.28, from: 4 }),
        drums({ rim: '..x. ..x. x... ..x.' }, { vel: 0.4, from: 4 }),
      ], { rate: 2, exit: ['riser', 'roll', 'cut'], say: 'Everything stops for a piano. Your melody at half speed, then the roll back in.' })),

      ...when(L >= 1, sec('Fúria', 'finale', 16, 1, [
        mel('cowbell', 'loop', { vel: 0.88, dbl: [{ inst: 'lead', oct: 0, vel: 0.46 }, { inst: 'superSaw', oct: 0, vel: 0.3 }] }),
        counter('cowbell', { reg: 79, vel: 0.46, bus: 'color' }),
        sub(1),
        bass('reese', '0--- ---- ---- ---- | 0--- ---- ---- ----', { reg: 34, vel: 0.52 }),
        pad('choirStac', { bus: 'choir', reg: 57, n: 4, vel: 0.48, pat: '..x. .... ..x. ..x. | ..x. .... x.x. x...' }),
        pad('lowBrass', { bus: 'brass', reg: 45, n: 2, vel: 0.54, pat: 'X--- .... .... .... | .... .... X--- ....', art: 2 }),
        beat(0.96, true),
      ], { rate: 2, lift: up, enter: 'big', say: 'The last drop, a semitone higher and louder than is reasonable.' })),

      sec('Desliga', 'outro', 4, 0.15, [
        mel('cowbell', 'sparse', { vel: 0.5 }),
        pad('choirOo', { bus: 'choir', reg: 55, n: 3, vel: 0.26, art: 4 }),
        drums({ hat: 'x.x. x.x. x.x. x.x.' }, { vel: 0.4, to: 2, cresc: [1, 0.3] }),
      ], { prog: 'pedal', lift: up, enter: 'drop', say: 'Power cut. One cowbell left ringing.' }),
    ];
  },
};

// ═════════════════════════════ REQUIEM — classical choir & orchestra in wrath ═════════════════════════════

const requiem: StylePreset = {
  id: 'requiem',
  name: 'Requiem',
  genre: 'Sacred wrath · choir & orchestra',
  tagline: 'A classical mass at full fury: racing strings, a chorus in block chords, trumpets and timpani.',
  palette: ['#f0e6cf', '#c21f3a', '#1a0710'],
  meter: '4/4',
  tempo: [136, 150],
  modes: [['harmonic', 1], ['aeolian', 0.9], ['phrygian', 0.5], ['dorian', 0.4]],
  sync: 0.05,
  chordExt: 'triad',
  padVoice: 'choirAh',
  reverb: { size: 3.6, damp: 0.42, wet: 0.36, predelay: 0.03 },
  tilt: { low: 1, high: 0.5 },
  mix: { choir: 1.15 },
  humanize: 0.7,
  fx: { big: [['timpani', 0.9], ['crash', 0.5], ['boom', 0.6]], hit: [['timpani', 0.7]], drop: [['gong', 0.4]], roll: 'timpani', run: 'strings' },
  titles: {
    a: ['Kyrie', 'Lacrimosa', 'Confutatis', 'Sanctus', 'Libera', 'Rex', 'Agnus', 'Tuba'],
    b: ['Tremendae', 'Aeterna', 'Irae', 'Ignis', 'Mortis', 'in Tenebris', 'Ultima', 'Favilla'],
    join: '',
  },
  form(len) {
    const L = lv(len);
    const up = L >= 1 ? 1 : 0;
    // the engine of the style: strings sawing sixteenths under everything
    const saw = (v: number, reg = 55) => ost('spiccato', '0000 2222 0000 3333 | 0000 2222 4444 2222', { reg, vel: v, acc: 'X.o. x.o. X.o. x.o.' });
    // the chorus declaims in block chords: long, short-short, long
    const chant = (v: number, o: O<PadLayer> = {}) => pad('choirAh', { bus: 'choir', reg: 58, n: 4, vel: v, pat: 'X--- ---- x--- x--- | X--- ---- ---- ....', ...o });
    const timp = (v: number): DrumLayer => drums({ timpani: 'X... .... x... ..o. | X... ..o. x.o. x...' }, { vel: v, fill: { timpani: 'X.o. x.o. x.xx xxxx' } });
    return [
      sec('Introitus', 'intro', 4, 0.3, [
        saw(0.5, 50),
        bass('cello', '0--- ---- ---- ---- | 0--- ---- ---- ----', { reg: 38, vel: 0.5 }),
        pad('organ', { pedal: true, reg: 43, n: 2, vel: 0.26 }),
        drums({ timpani: 'X... .... .... ....' }, { vel: 0.5, every: 2 }),
      ], { exit: ['roll'], say: 'No overture. The low strings are already running when the doors open.' }),

      sec('Dies', 'theme', 8, 0.8, [
        mel('choirAh', 'theme', { vel: 0.86, bus: 'choir', dbl: [{ inst: 'trumpets', oct: 0, vel: 0.5, bus: 'brass' }, { inst: 'strings', oct: 1, vel: 0.56 }] }),
        chant(0.5, { reg: 52, n: 3 }),
        saw(0.62),
        ost('tremolo', '0--- ---- 2--- ---- | 3--- ---- 2--- ----', { reg: 67, vel: 0.36 }),
        bass('strings', '0.0. 0.0. 0.0. 0.0.', { reg: 38, vel: 0.62, acc: 'X.o. x.o. X.o. x.o.' }),
        bass('lowBrass', '0--- ---- ---- ---- | 0--- ---- ---- ----', { reg: 38, vel: 0.5, bus: 'brass' }),
        timp(0.72),
      ], { enter: 'big', say: 'The whole chorus sings your theme at once, in block chords, with trumpets on top.' }),

      ...when(L >= 1, sec('Tuba Mirum', 'theme', 8, 0.5, [
        mel('lowBrass', 'call', { vel: 0.76, bus: 'brass' }),
        mel('soprano', 'response', { vel: 0.66 }),
        pad('strings', { reg: 57, n: 4, vel: 0.34, art: 1 }),
        pad('organ', { reg: 48, n: 3, vel: 0.22 }),
        bass('cello', '0--- ---- 5--- ---- | 0--- ---- ---- ----', { reg: 38, vel: 0.5 }),
      ], { prog: 'B', say: 'A single trombone calls across the hall. A soprano answers it.' })),

      sec('Confutatis', 'build', 4, 0.66, [
        mel('choirStac', 'fragment', { vel: 0.74, bus: 'choir', cresc: [0.7, 1.15], dbl: [{ inst: 'lowBrass', oct: -1, vel: 0.5, bus: 'brass' }] }),
        ost('spiccato', '0000 0000 0000 0000', { reg: 50, vel: 0.56, cresc: [0.6, 1.2], acc: 'X.o. x.o. X.o. x.o.' }),
        ost('tremolo', '0--- ---- ---- ---- | 2--- ---- ---- ----', { reg: 69, vel: 0.36, cresc: [0.5, 1.3] }),
        bass('strings', '0.0. 0.0. 0.0. 0.0.', { reg: 38, vel: 0.58, cresc: [0.7, 1.2] }),
        drums({ timpani: 'X... x... X... x... | X... x... X.x. x.x. | X.x. x.x. X.x. x.x. | xxxx xxxx xxxx xxxx' }, { vel: 0.6, cresc: [0.5, 1.15] }),
      ], { exit: ['roll', 'run'], say: 'The men spit your first three notes, a step higher each time. The timpani closes in.' }),

      sec('Rex Tremendae', 'climax', 8, 1, [
        mel('choirAh', 'theme', { oct: 1, vel: 0.94, bus: 'choir', dbl: [{ inst: 'trumpets', oct: 1, vel: 0.62, bus: 'brass' }, { inst: 'strings', oct: 1, vel: 0.7 }, { inst: 'horns', oct: 0, vel: 0.56, bus: 'brass' }] }),
        chant(0.62),
        counter('lowBrass', { reg: 48, vel: 0.6, bus: 'brass' }),
        saw(0.7, 57),
        pad('organ', { reg: 48, n: 4, vel: 0.34 }),
        ost('tremolo', '0--- ---- 2--- ---- | 3--- ---- 4--- ----', { reg: 72, vel: 0.4 }),
        bass('strings', '0.0. 0.0. 0.0. 0.0.', { reg: 38, vel: 0.7, acc: 'X.o. x.o. X.o. x.o.' }),
        bass('lowBrass', '0--- ---- ---- ---- | 0--- ---- 5--- ----', { reg: 36, vel: 0.6, bus: 'brass' }),
        drums({ timpani: 'X... ..o. x... ..o. | X... ..o. x.o. x.xx', crash: 'X... .... .... .... | .... .... .... ....', boom: 'X... .... .... .... | .... .... .... ....' }, { vel: 0.86, fill: { timpani: 'X.o. x.o. x.xx xxxx' } }),
      ], { enter: 'big', say: 'Judgement: sopranos an octave up, the organ under everything, the full brass in unison.' }),

      ...when(L >= 2, sec('Recordare', 'theme', 8, 0.45, [
        mel('violin', 'theme', { vel: 0.74 }),
        counter('cello', { reg: 52, vel: 0.58 }),
        pad('choirOo', { bus: 'choir', reg: 58, n: 4, vel: 0.34, art: 1 }),
        pad('strings', { reg: 55, n: 4, vel: 0.32, art: 1 }),
        ost('pizz', '0... 2... 3... 2...', { reg: 55, vel: 0.36, bus: 'color' }),
        bass('cello', '0--- ---- ---- ---- | 0--- ---- 5--- ----', { reg: 38, vel: 0.46 }),
      ], { prog: 'B', say: 'A plea, quietly: one violin, a cello under it, the chorus humming.' })),

      ...when(L >= 1, sec('Lacrimosa', 'break', 8, 0.25, [
        mel('soprano', 'broad', { vel: 0.58 }),
        pad('choirOo', { bus: 'choir', reg: 57, n: 4, vel: 0.24, art: 4 }),
        pad('strings', { reg: 55, n: 3, vel: 0.28, art: 4 }),
        ost('pizz', '0... .... 2... .... | 3... .... 2... ....', { reg: 52, vel: 0.3, bus: 'color' }),
        bass('cello', '0--- ---- ---- ---- | 0--- ---- ---- ----', { reg: 38, vel: 0.4 }),
      ], { rate: 2, exit: ['roll', 'run'], say: 'Everything falls away. Your theme at half speed, as a lament.' })),

      ...when(L >= 1, sec('Lux Aeterna', 'finale', 8, 1, [
        mel('choirAh', 'theme', { oct: 1, vel: 0.96, bus: 'choir', dbl: [{ inst: 'trumpets', oct: 1, vel: 0.66, bus: 'brass' }, { inst: 'strings', oct: 1, vel: 0.72 }, { inst: 'horns', oct: 0, vel: 0.6, bus: 'brass' }, { inst: 'bell', oct: 0, vel: 0.4, bus: 'color' }] }),
        chant(0.66),
        counter('lowBrass', { reg: 48, vel: 0.62, bus: 'brass' }),
        saw(0.72, 57),
        pad('organ', { reg: 48, n: 4, vel: 0.38 }),
        bass('strings', '0.0. 0.0. 0.0. 0.0.', { reg: 38, vel: 0.72, acc: 'X.o. x.o. X.o. x.o.' }),
        bass('lowBrass', '0--- ---- ---- ---- | 0--- ---- 5--- ----', { reg: 36, vel: 0.62, bus: 'brass' }),
        drums({ timpani: 'X... ..o. x... ..o. | X... ..o. x.o. x.xx', crash: 'X... .... .... .... | .... .... .... ....', boom: 'X... .... .... .... | .... .... .... ....' }, { vel: 0.9, fill: { timpani: 'X.o. x.o. x.xx xxxx' } }),
      ], { prog: 'final', lift: up, enter: 'big', say: 'The return, a semitone higher, with the cathedral bell tolling your notes.' })),

      sec('Amen', 'outro', 4, 0.2, [
        pad('choirAh', { bus: 'choir', pedal: true, reg: 55, n: 4, vel: 0.44, art: 4 }),
        pad('organ', { pedal: true, reg: 43, n: 3, vel: 0.3, art: 4 }),
        mel('bell', 'sparse', { vel: 0.46, bus: 'color', to: 3 }),
        drums({ timpani: 'X... .... .... ....' }, { vel: 0.6, to: 1 }),
      ], { prog: 'pedal', lift: up, say: 'One held chord from the chorus and the organ. Amen.' }),
    ];
  },
};

// ═════════════════════════════ HELLFORGE — industrial metal ═════════════════════════════

const hellforge: StylePreset = {
  id: 'hellforge',
  name: 'Hellforge',
  genre: 'Industrial metal',
  tagline: 'Down-tuned guitars chugging in lockstep with a double kick, a choir screaming over the top.',
  palette: ['#ff3b1f', '#ff9d2e', '#140304'],
  meter: '4/4',
  tempo: [104, 118],
  modes: [['phrygian', 1], ['aeolian', 0.9], ['harmonic', 0.8], ['minorPent', 0.6]],
  sync: 0.45,
  chordExt: 'power',
  padVoice: 'guitar',
  reverb: { size: 1.8, damp: 0.5, wet: 0.18, predelay: 0.012 },
  tilt: { low: 1, high: 2 },
  mix: { bass: 1.1, drums: 1.1 },
  humanize: 0.15,
  pump: 0.12,
  fx: { big: [['impact', 0.9], ['crash', 0.7], ['subDrop', 0.7]], hit: [['crash', 0.5], ['kick', 0.8]], drop: [['subDrop', 0.8]], roll: 'snare', riser: true },
  titles: {
    a: ['Hellforge', 'Rust', 'Slag', 'Furnace', 'Chainsaw', 'Brimstone', 'Molten', 'Voltaic'],
    b: ['Protocol', 'Engine', 'Sermon', 'Cathedral', 'Grinder', 'Overdrive', 'Reactor', 'Ascendant'],
    join: '',
  },
  form(len) {
    const L = lv(len);
    const up = L >= 1 ? 1 : 0;
    // the riff: palm-muted sixteenths with holes in them, and a kick drum glued to every one
    const RIFF = '0.00 .00. 0.00 .0.0 | 0.00 .00. 00.0 5-1-';
    const KICK = 'X.xx .xx. X.xx .x.x | X.xx .xx. xx.x x.x.';
    const riff = (v: number) => bass('guitar', RIFF, { reg: 33, vel: v, acc: 'X.xo .xo. X.xo .x.o | X.xo .xo. Xo.x X.X.' });
    const low = (v: number) => bass('synBass', RIFF, { reg: 33, vel: v });
    const kitOf = (v: number, blast: boolean): DrumLayer =>
      drums(
        {
          kick: blast ? 'XxXx XxXx XxXx XxXx' : KICK,
          snare: blast ? '.... X... .... X... | .... X... .... X.xx' : '.... .... X... .... | .... .... X... ..g.',
          hat: 'x.x. x.x. x.x. x.x.',
          crash: 'X... .... .... .... | .... .... .... ....',
          anvil: '.... .... .... .... | .... .... .... x...',
        },
        { vel: v, fill: { kick: 'X.xx X.xx XxXx XxXx', snare: '.... X... x.x. xxxx', crash: '.... .... .... ....' } },
      );
    return [
      sec('Ignition', 'intro', 4, 0.35, [
        bass('synBass', '0--- ---- ---- ---- | 0--- ---- ---- ----', { reg: 33, vel: 0.6 }),
        bass('guitar', '0... .... .... .... | 0... .... .... 0.0.', { reg: 33, vel: 0.7, from: 2 }),
        pad('choirOo', { bus: 'choir', pedal: true, reg: 50, n: 3, vel: 0.3 }),
        drums({ anvil: 'x... .... .... .... | .... .... x... ....', kick: '.... .... .... .... | .... .... .... x.xx' }, { vel: 0.6 }),
      ], { exit: ['riser', 'cut'], say: 'A machine hum, an anvil, and one guitar testing the lowest string.' }),

      sec('The Riff', 'theme', 8, 0.82, [
        riff(0.86),
        low(0.6),
        mel('lead', 'theme', { vel: 0.6, dbl: [{ inst: 'guitar', oct: 0, vel: 0.5, bus: 'melody' }] }),
        pad('choirOo', { bus: 'choir', reg: 55, n: 3, vel: 0.32 }),
        kitOf(0.86, false),
      ], { enter: 'big', say: 'Guitars and kick drum move as one. Your theme rides over the riff on a lead.' }),

      sec('Overheat', 'build', 4, 0.62, [
        mel('guitar', 'fragment', { vel: 0.66, cresc: [0.7, 1.15] }),
        bass('guitar', '0000 0000 0000 0000', { reg: 33, vel: 0.6, cresc: [0.6, 1.2], acc: 'X.o. x.o. X.o. x.o.' }),
        pad('choirAh', { bus: 'choir', reg: 57, n: 4, vel: 0.36, cresc: [0.5, 1.3] }),
        drums({ kick: 'X... X... X... X... | X... X... X.X. X.X. | X.X. X.X. X.X. X.X. | XxXx XxXx XxXx XxXx', snare: '.... .... .... .... | .... .... .... .... | .... x... .... x... | x.x. x.x. xxxx xxxx' }, { vel: 0.74, cresc: [0.6, 1.15] }),
      ], { exit: ['riser', 'cut'], say: 'Straight sixteenths. Your first notes climb while the drums double, then double again.' }),

      sec('Slaughter Line', 'climax', 8, 1, [
        mel('choirAh', 'theme', { oct: 1, vel: 0.84, bus: 'choir', dbl: [{ inst: 'guitar', oct: 0, vel: 0.56, bus: 'melody' }, { inst: 'lead', oct: 1, vel: 0.46 }] }),
        riff(0.96),
        low(0.7),
        bass('sub', '0--- ---- ---- ---- | 0--- ---- ---- ----', { reg: 33, vel: 0.5 }),
        pad('lowBrass', { bus: 'brass', reg: 45, n: 2, vel: 0.56, pat: 'X--- ---- .... .... | .... .... X--- ----', art: 2 }),
        ost('choirStac', '0... .... 0.0. .... | 0... .... 2.0. ....', { reg: 55, vel: 0.5, bus: 'choir', x: true }),
        kitOf(0.98, true),
      ], { enter: 'big', say: 'Blast beats. The choir takes your theme in octaves and the guitars play it with them.' }),

      ...when(L >= 2, sec('Second Furnace', 'theme', 8, 0.8, [
        mel('guitar', 'theme', { oct: 1, vel: 0.7, dbl: [{ inst: 'lead', oct: 1, vel: 0.4 }] }),
        bass('guitar', '0.0. 00.0 .0.0 00.. | 0.0. 00.0 5.5. 1.1.', { reg: 33, vel: 0.9 }),
        low(0.62),
        pad('choirOo', { bus: 'choir', reg: 55, n: 3, vel: 0.34 }),
        drums({ kick: 'X.x. xx.x .x.x xx.. | X.x. xx.x x.x. x.x.', snare: '.... X... .... X...', hat: 'x.x. x.x. x.x. x.x.', crash: 'X... .... .... .... | .... .... .... ....' }, { vel: 0.9 }),
      ], { prog: 'B', say: 'A second riff on new chords, snare on two and four, the guitar singing the melody itself.' })),

      ...when(L >= 1, sec('Coolant', 'break', 4, 0.25, [
        mel('piano', 'statement', { oct: -1, vel: 0.56 }),
        pad('choirOo', { bus: 'choir', reg: 55, n: 4, vel: 0.36, art: 4 }),
        pad('warmPad', { reg: 50, n: 3, vel: 0.3 }),
        bass('synBass', '0--- ---- ---- ---- | 0--- ---- ---- ----', { reg: 33, vel: 0.44 }),
      ], { exit: ['riser', 'roll', 'cut'], say: 'The engine idles. A low piano, the choir, nothing else.' })),

      ...when(L >= 1, sec('Annihilation', 'finale', 8, 1, [
        mel('choirAh', 'theme', { oct: 1, vel: 0.88, bus: 'choir', dbl: [{ inst: 'guitar', oct: 0, vel: 0.6, bus: 'melody' }, { inst: 'lead', oct: 1, vel: 0.5 }, { inst: 'trumpets', oct: 0, vel: 0.44, bus: 'brass' }] }),
        riff(1),
        low(0.72),
        bass('sub', '0--- ---- ---- ---- | 0--- ---- ---- ----', { reg: 33, vel: 0.52 }),
        pad('lowBrass', { bus: 'brass', reg: 45, n: 2, vel: 0.6, pat: 'X--- ---- .... .... | .... .... X--- ----', art: 2 }),
        ost('choirStac', '0... .... 0.0. .... | 0... .... 2.0. ....', { reg: 55, vel: 0.52, bus: 'choir' }),
        kitOf(1, true),
      ], { prog: 'final', lift: up, enter: 'big', say: 'Once more, a semitone higher, with everything the amplifier has left.' })),

      sec('Shutdown', 'outro', 4, 0.2, [
        bass('guitar', '0--- ---- ---- ---- | ---- ---- ---- ----', { reg: 33, vel: 0.8, to: 2 }),
        bass('synBass', '0--- ---- ---- ---- | 0--- ---- ---- ----', { reg: 33, vel: 0.5, cresc: [1, 0.3] }),
        pad('choirOo', { bus: 'choir', pedal: true, reg: 50, n: 3, vel: 0.3, art: 4 }),
        drums({ crash: 'X... .... .... ....', kick: 'X... .... .... ....' }, { vel: 0.8, to: 1 }),
      ], { prog: 'pedal', lift: up, say: 'One last chord left to feed back, and the hum underneath it.' }),
    ];
  },
};

// ═════════════════════════════ IRON COLUMN — war march ═════════════════════════════

const column: StylePreset = {
  id: 'column',
  name: 'Iron Column',
  genre: 'War march · industrial rock',
  tagline: 'Boots in step, a field snare, guitars grinding one chord and a regiment shouting on the beat.',
  palette: ['#e0263c', '#c7b56a', '#0e0d12'],
  meter: '4/4',
  tempo: [110, 120],
  modes: [['aeolian', 1], ['phrygian', 0.9], ['harmonic', 0.8], ['dorian', 0.5]],
  sync: 0.15,
  chordExt: 'power',
  padVoice: 'trumpets',
  reverb: { size: 2.6, damp: 0.5, wet: 0.24, predelay: 0.02 },
  tilt: { low: 2.5, high: 1 },
  mix: { drums: 1.1 },
  humanize: 0.3,
  fx: { big: [['impact', 0.8], ['crash', 0.6], ['boom', 0.8]], hit: [['boom', 0.7], ['crash', 0.4]], drop: [['boom', 0.6]], roll: 'snareOrch', riser: true },
  titles: {
    a: ['Iron', 'Red', 'Steel', 'Black', 'Ninth', 'Last', 'Winter', 'Burning'],
    b: ['Column', 'Advance', 'Regiment', 'Offensive', 'Banner', 'Front', 'Parade', 'Division'],
    join: '',
  },
  form(len) {
    const L = lv(len);
    const up = L >= 1 ? 2 : 0;
    // left, right, left, right
    const boots = (v: number, o: O<DrumLayer> = {}): DrumLayer => drums({ boom: 'X... x... X... x...', stick: 'x... x... x... x...' }, { vel: v, ...o });
    const field = (v: number, o: O<DrumLayer> = {}): DrumLayer =>
      drums({ snareOrch: 'x.gg x.gg x.gg x.xx | x.gg x.gg x.xx xxxx' }, { vel: v, fill: { snareOrch: 'x.xx x.xx xxxx xxxx' }, ...o });
    const grind = (v: number) => bass('guitar', '0.0. 0.0. 0.0. 0.00 | 0.0. 0.0. 0.00 5.1.', { reg: 33, vel: v, acc: 'X.o. x.o. X.o. x.oo' });
    const shout = (v: number) => pad('choirStac', { bus: 'choir', reg: 52, n: 3, vel: v, pat: 'X... .... X... .... | X... .... X... x...' });
    return [
      sec('Assembly', 'intro', 4, 0.3, [
        boots(0.46),
        field(0.46, { from: 2 }),
        pad('choirOo', { bus: 'choir', pedal: true, reg: 48, n: 3, vel: 0.28, from: 2 }),
      ], { say: 'Before any music: boots on gravel, in step. Then the field snare.' }),

      sec('Advance', 'theme', 8, 0.7, [
        grind(0.8),
        bass('synBass', '0... 0... 0... 0...', { reg: 33, vel: 0.56 }),
        mel('lowBrass', 'theme', { vel: 0.78, bus: 'brass', detached: true }),
        shout(0.44),
        boots(0.84),
        field(0.6),
        drums({ kick: 'X... X... X... X...' }, { vel: 0.7 }),
      ], { enter: 'hit', say: 'The guitars grind one chord in eighths and the low brass plays your theme like an order.' }),

      ...when(L >= 1, sec('Banners', 'theme', 8, 0.8, [
        mel('trumpets', 'theme', { vel: 0.8, bus: 'brass', dbl: [{ inst: 'horns', oct: -1, vel: 0.56, bus: 'brass' }] }),
        counter('lowBrass', { reg: 45, vel: 0.56, bus: 'brass' }),
        grind(0.84),
        bass('synBass', '0... 0... 0... 0...', { reg: 33, vel: 0.58 }),
        shout(0.5),
        pad('strings', { reg: 55, n: 3, vel: 0.34, pat: 'x.x. x.x. x.x. x.x.' }),
        boots(0.86),
        field(0.66),
        drums({ kick: 'X... X... X... X...', anvil: '.... x... .... x...' }, { vel: 0.72 }),
      ], { prog: 'B', say: 'Trumpets take the theme up an octave. An anvil rings on two and four.' })),

      sec('Mobilise', 'build', 4, 0.6, [
        mel('guitar', 'fragment', { vel: 0.66, cresc: [0.7, 1.15] }),
        ost('spiccato', '0000 0000 0000 0000', { reg: 50, vel: 0.5, cresc: [0.6, 1.2], acc: 'X.o. x.o. X.o. x.o.' }),
        shout(0.46),
        boots(0.8),
        drums({ snareOrch: 'x.gg x.gg x.gg x.xx | x.xx x.xx x.xx x.xx | xxxx xxxx xxxx xxxx | xxxx xxxx xxxx xxxx' }, { vel: 0.6, cresc: [0.5, 1.15] }),
      ], { exit: ['riser', 'roll'], say: 'The snare tightens into a roll. The guitar pushes your first notes up the scale.' }),

      sec('Offensive', 'climax', 8, 1, [
        mel('trumpets', 'theme', { oct: 1, vel: 0.9, bus: 'brass', dbl: [{ inst: 'choirAh', oct: 0, vel: 0.7, bus: 'choir' }, { inst: 'guitar', oct: 0, vel: 0.5, bus: 'melody' }, { inst: 'strings', oct: 1, vel: 0.56 }] }),
        counter('horns', { reg: 55, vel: 0.62, bus: 'brass' }),
        grind(0.94),
        bass('guitar', '0--- ---- ---- ---- | 0--- ---- ---- ----', { reg: 45, vel: 0.56 }),
        bass('synBass', '0... 0... 0... 0...', { reg: 33, vel: 0.64 }),
        bass('sub', '0--- ---- ---- ---- | 0--- ---- ---- ----', { reg: 33, vel: 0.46 }),
        shout(0.6),
        ost('spiccato', '0.0. 2.0. 0.0. 3.2.', { reg: 57, vel: 0.44, x: true }),
        boots(0.96),
        field(0.76),
        drums({ kick: 'X... X... X... X.x.', snare: '.... X... .... X...', crash: 'X... .... .... .... | .... .... .... ....', anvil: '.... x... .... x...' }, { vel: 0.88, fill: { kick: 'X.x. X.x. XxXx XxXx', snare: '.... X... x.x. xxxx' } }),
      ], { enter: 'big', say: 'Full advance: trumpets and a men’s chorus on your theme, guitars, strings, every drum in the column.' }),

      ...when(L >= 2, sec('No Man’s Land', 'break', 8, 0.25, [
        mel('cello', 'theme', { vel: 0.7 }),
        pad('choirOo', { bus: 'choir', reg: 55, n: 4, vel: 0.34, art: 4 }),
        pad('strings', { reg: 52, n: 3, vel: 0.28, art: 4 }),
        drums({ snareOrch: 'g... .... g.g. ....' }, { vel: 0.4 }),
        drums({ boom: 'x... .... .... ....' }, { vel: 0.5, every: 2 }),
      ], { prog: 'B', exit: ['roll'], say: 'The column halts. One cello, a distant snare, a hummed hymn.' })),

      ...when(L >= 1, sec('Victory Parade', 'finale', 8, 1, [
        mel('trumpets', 'theme', { oct: 1, vel: 0.94, bus: 'brass', dbl: [{ inst: 'choirAh', oct: 0, vel: 0.74, bus: 'choir' }, { inst: 'guitar', oct: 0, vel: 0.54, bus: 'melody' }, { inst: 'strings', oct: 1, vel: 0.6 }] }),
        counter('horns', { reg: 55, vel: 0.64, bus: 'brass' }),
        grind(0.98),
        bass('guitar', '0--- ---- ---- ---- | 0--- ---- ---- ----', { reg: 45, vel: 0.58 }),
        bass('synBass', '0... 0... 0... 0...', { reg: 33, vel: 0.66 }),
        bass('sub', '0--- ---- ---- ---- | 0--- ---- ---- ----', { reg: 33, vel: 0.48 }),
        shout(0.64),
        ost('spiccato', '0.0. 2.0. 0.0. 3.2.', { reg: 57, vel: 0.46 }),
        boots(0.98),
        field(0.8),
        drums({ kick: 'X... X... X... X.x.', snare: '.... X... .... X...', crash: 'X... .... .... .... | .... .... .... ....', anvil: '.... x... .... x...' }, { vel: 0.9, fill: { kick: 'X.x. X.x. XxXx XxXx', snare: '.... X... x.x. xxxx' } }),
      ], { prog: 'final', lift: up, enter: 'big', say: 'A whole step up for the last march past.' })),

      sec('Dismissed', 'outro', 4, 0.2, [
        boots(0.7, { cresc: [1, 0.25] }),
        field(0.4, { to: 2, cresc: [1, 0.3] }),
        pad('lowBrass', { bus: 'brass', pedal: true, reg: 41, n: 2, vel: 0.4, art: 4, to: 2 }),
      ], { prog: 'pedal', lift: up, say: 'The music stops first. The boots keep going, down the road.' }),
    ];
  },
};

// ═════════════════════════════ CAROUSEL — whimsical romantic waltz ═════════════════════════════

const carousel: StylePreset = {
  id: 'carousel',
  name: 'Carousel',
  genre: 'Whimsical waltz',
  tagline: 'A storybook waltz: a piano that sounds like remembering, then the whole orchestra spinning.',
  palette: ['#8fd6ff', '#ffb8dc', '#1a2458'],
  meter: '3/4',
  tempo: [132, 148],
  modes: [['harmonic', 1], ['aeolian', 0.95], ['dorian', 0.7], ['ionian', 0.6]],
  sync: 0.1,
  chordExt: 'seventh',
  padVoice: 'piano',
  reverb: { size: 3, damp: 0.45, wet: 0.3, predelay: 0.025 },
  tilt: { low: 0, high: 0.5 },
  humanize: 0.9,
  fx: { big: [['crash', 0.45], ['timpani', 0.7]], hit: [['timpani', 0.5]], drop: [['gong', 0.25]], roll: 'timpani', gliss: 'harp', run: 'strings' },
  titles: {
    a: ['Carousel', 'Waltz', 'Promenade', 'Lullaby', 'Serenade', 'Flight', 'Letters', 'A Dance'],
    b: ['the Weathervane', 'Paper Lanterns', 'a Borrowed Sky', 'the Clockmaker', 'Falling Stars', 'the Flower Field', 'Open Windows', 'the Tin Moon'],
    join: 'of',
  },
  form(len) {
    const L = lv(len);
    const up = L >= 1 ? 2 : 0;
    // oom — pah — pah
    const oom = (inst: Inst, v: number, reg = 40) => bass(inst, '0--. .... .... | 5--. .... ....', { reg, vel: v });
    const pah = (inst: Inst, v: number, reg = 58) => pad(inst, { reg, n: 3, vel: v, pat: '.... x-.. x-..' });
    return [
      sec('Music Box', 'intro', 8, 0.18, [
        mel('celesta', 'broad', { oct: 1, vel: 0.56, bus: 'color' }),
        oom('felt', 0.4, 45),
        pah('felt', 0.3),
      ], { rate: 2, say: 'A music box is wound up, and plays your notes as a waltz.' }),

      sec('The Waltz', 'theme', 16, 0.42, [
        mel('piano', 'broad', { vel: 0.7, orn: true }),
        oom('pizz', 0.5),
        oom('piano', 0.36),
        pah('piano', 0.28),
        pad('strings', { reg: 57, n: 3, vel: 0.24, from: 8, art: 1 }),
      ], { rate: 2, say: 'A piano takes the tune, the left hand going oom-pah-pah. It sounds like something half remembered.' }),

      ...when(L >= 1, sec('Promenade', 'theme', 16, 0.58, [
        mel('violin', 'broad', { vel: 0.78, dbl: [{ inst: 'flute', oct: 1, vel: 0.44, bus: 'color' }] }),
        counter('cello', { reg: 52, vel: 0.56 }),
        oom('pizz', 0.62),
        oom('cello', 0.4),
        pah('strings', 0.38),
        ost('harp', '0.2. 3.2. 4.2. | 0.2. 4.3. 2.3.', { reg: 60, vel: 0.3, bus: 'color' }),
        ost('glock', '.... .... ..?. | .... .... ....', { reg: 84, vel: 0.26, bus: 'color', x: true }),
      ], { rate: 2, prog: 'B', say: 'A violin and a flute take a turn around the floor, the cello in step beneath them.' })),

      sec('Wind Rising', 'build', 8, 0.62, [
        mel('flute', 'fragment', { vel: 0.66, cresc: [0.7, 1.1], bus: 'color' }),
        pad('strings', { reg: 57, n: 4, vel: 0.36, cresc: [0.5, 1.3], art: 1 }),
        ost('tremolo', '0--- ---- ---- | 2--- ---- ----', { reg: 67, vel: 0.3, cresc: [0.5, 1.3] }),
        oom('pizz', 0.6),
        pah('horns', 0.3, 53),
        drums({ timpani: '.... .... .... | .... .... .... | .... .... .... | .... x... x...' }, { vel: 0.5, cresc: [0.6, 1.1] }),
      ], { rate: 2, exit: ['roll', 'run', 'gliss'], say: 'The flute skips ahead with your first notes. The strings gather like weather.' }),

      sec('Full Spin', 'climax', 16, 0.95, [
        mel('strings', 'broad', { oct: 1, vel: 0.92, dbl: [{ inst: 'horns', oct: 0, vel: 0.56, bus: 'brass' }, { inst: 'flute', oct: 1, vel: 0.4, bus: 'color' }] }),
        counter('cello', { reg: 55, vel: 0.62 }),
        oom('strings', 0.66, 38),
        oom('lowBrass', 0.46, 38),
        pah('strings', 0.44),
        pah('horns', 0.36, 53),
        ost('harp', '0.2. 3.2. 4.2. | 0.2. 4.3. 2.3.', { reg: 60, vel: 0.36, bus: 'color' }),
        ost('glock', '0... .... 2... | .... 3... ....', { reg: 84, vel: 0.3, bus: 'color' }),
        ost('piano', '0.2. 4.5. 4.2.', { reg: 62, vel: 0.36, bus: 'color', x: true }),
        drums({ timpani: 'X... .... .... | x... .... x...', crash: 'X... .... .... | .... .... .... | .... .... .... | .... .... ....', stick: '.... x... x...' }, { vel: 0.66 }),
      ], { rate: 2, enter: 'big', say: 'And the whole orchestra spins: violins soaring on your theme, horns and harp, timpani on the downbeat.' }),

      ...when(L >= 2, sec('Paper Lanterns', 'theme', 16, 0.5, [
        mel('flute', 'call', { vel: 0.7, bus: 'color' }),
        mel('violin', 'response', { vel: 0.72 }),
        oom('pizz', 0.58),
        pah('felt', 0.34),
        pad('choirOo', { bus: 'choir', reg: 60, n: 3, vel: 0.28, art: 1 }),
        ost('celesta', '0.2. 3.2. 4.2.', { reg: 72, vel: 0.28, bus: 'color' }),
      ], { prog: 'B', say: 'Lighter now. The flute asks, the violin answers, a celesta ticking between them.' })),

      ...when(L >= 1, sec('A Quiet Room', 'break', 8, 0.2, [
        mel('felt', 'broad', { vel: 0.62 }),
        pad('strings', { reg: 57, n: 3, vel: 0.24, art: 4 }),
        bass('felt', '0--- ---- ----', { reg: 43, vel: 0.36 }),
      ], { rate: 2, exit: ['gliss', 'run'], say: 'The dancers stop. Just the piano, slower, as if alone in the house.' })),

      ...when(L >= 1, sec('Above the Clouds', 'finale', 16, 1, [
        mel('strings', 'broad', { oct: 1, vel: 0.96, dbl: [{ inst: 'horns', oct: 0, vel: 0.6, bus: 'brass' }, { inst: 'trumpets', oct: 0, vel: 0.42, bus: 'brass' }, { inst: 'flute', oct: 1, vel: 0.42, bus: 'color' }] }),
        counter('cello', { reg: 55, vel: 0.64 }),
        oom('strings', 0.7, 38),
        oom('lowBrass', 0.5, 38),
        pah('strings', 0.46),
        pah('horns', 0.4, 53),
        pad('choirAh', { bus: 'choir', reg: 60, n: 4, vel: 0.4, art: 1 }),
        ost('harp', '0.2. 3.2. 4.2. | 0.2. 4.3. 2.3.', { reg: 60, vel: 0.38, bus: 'color' }),
        ost('glock', '0... .... 2... | .... 3... ....', { reg: 84, vel: 0.32, bus: 'color' }),
        ost('piano', '0.2. 4.5. 4.2.', { reg: 62, vel: 0.38, bus: 'color' }),
        drums({ timpani: 'X... .... .... | x... .... x...', crash: 'X... .... .... | .... .... .... | .... .... .... | .... .... ....', stick: '.... x... x...' }, { vel: 0.7 }),
      ], { rate: 2, prog: 'final', lift: up, enter: 'big', exit: ['gliss'], say: 'A whole step higher, a choir joining in, the waltz as big as it will ever be.' })),

      sec('Winding Down', 'outro', 8, 0.12, [
        mel('celesta', 'broad', { oct: 1, vel: 0.48, bus: 'color', to: 6 }),
        oom('felt', 0.34, 45),
        pah('felt', 0.26),
        pad('strings', { pedal: true, reg: 50, n: 3, vel: 0.22, art: 4 }),
      ], { rate: 2, prog: 'pedal', lift: up, say: 'The music box again, running down, one note at a time.' }),
    ];
  },
};

// ═════════════════════════════ TWIN CHOIRS — high and low voices ═════════════════════════════

const choirs: StylePreset = {
  id: 'choirs',
  name: 'Twin Choirs',
  genre: 'High & low voices',
  tagline: 'Two choirs across a dark nave: the men low and slow, the sopranos high above, answering, then singing as one.',
  palette: ['#c9d6ff', '#8a7bff', '#0b0a24'],
  meter: '4/4',
  tempo: [66, 80],
  modes: [['aeolian', 1], ['dorian', 0.85], ['harmonic', 0.7], ['phrygian', 0.5], ['ionian', 0.35]],
  sync: 0.05,
  chordExt: 'triad',
  padVoice: 'choirAh',
  padLow: { below: 60, inst: 'choirLo' },
  reverb: { size: 4.2, damp: 0.4, wet: 0.4, predelay: 0.035 },
  tilt: { low: 2.5, high: 1.5 },
  mix: { choir: 1.05 },
  humanize: 0.6,
  fx: { big: [['timpani', 0.7], ['boom', 0.5], ['crash', 0.3]], hit: [['timpani', 0.5]], drop: [['gong', 0.35]], roll: 'timpani', gliss: 'harp' },
  titles: {
    a: ['Canticle', 'Vigil', 'Psalm', 'Antiphon', 'Hymn', 'Litany', 'Vespers', 'Chorale'],
    b: ['the Deep', 'Two Choirs', 'Ash', 'Stone', 'the Nave', 'the Lost', 'Dusk', 'Embers'],
    join: 'of',
  },
  form(len) {
    const L = lv(len);
    const up = L >= 1 ? 2 : 0;
    // the men breathe together on long chords; the sopranos float above in their own time
    const men = (v: number, o: O<PadLayer> = {}) => pad('choirLo', { bus: 'choir', reg: 45, n: 3, vel: v, ...o });
    const high = (v: number, o: O<PadLayer> = {}) => pad('choirAh', { bus: 'choir', reg: 65, n: 3, vel: v, ...o });
    return [
      sec('Low Chant', 'intro', 4, 0.2, [
        mel('choirLo', 'statement', { oct: -1, vel: 0.7, bus: 'choir' }),
        men(0.36, { pedal: true, n: 2, reg: 40 }),
        pad('organ', { pedal: true, reg: 36, n: 2, vel: 0.16 }),
      ], { rate: 2, say: 'The men begin alone, low and slow, your notes as a chant.' }),

      sec('Call and Answer', 'theme', 8, 0.42, [
        mel('choirLo', 'call', { oct: -1, vel: 0.74, bus: 'choir' }),
        mel('choirAh', 'response', { oct: 1, vel: 0.7, bus: 'choir' }),
        men(0.3, { art: 1 }),
        pad('strings', { reg: 50, n: 3, vel: 0.2, art: 4 }),
        bass('cello', '0--- ---- ---- ---- | 0--- ---- ---- ----', { reg: 36, vel: 0.38 }),
      ], { rate: 2, say: 'The low choir asks with your theme; the sopranos answer from high above.' }),

      ...when(L >= 1, sec('Antiphon', 'theme', 8, 0.5, [
        mel('choirAh', 'theme', { oct: 1, vel: 0.78, bus: 'choir' }),
        counter('choirLo', { reg: 45, vel: 0.6, bus: 'choir' }),
        pad('choirOo', { bus: 'choir', reg: 57, n: 3, vel: 0.24, art: 1 }),
        pad('organ', { reg: 43, n: 3, vel: 0.16 }),
        mel('bell', 'sparse', { vel: 0.3, bus: 'color' }),
      ], { prog: 'B', rate: 2, say: 'Now the sopranos carry the theme and the men walk a line of their own beneath it.' })),

      sec('Ascent', 'build', 4, 0.6, [
        mel('choirStac', 'fragment', { vel: 0.66, bus: 'choir', cresc: [0.6, 1.15] }),
        men(0.4, { pat: 'X--- ---- X--- ---- | X--- X--- X-X- X-X-', cresc: [0.6, 1.2] }),
        high(0.3, { cresc: [0.4, 1.2] }),
        pad('strings', { reg: 52, n: 4, vel: 0.3, cresc: [0.5, 1.2] }),
        drums({ timpani: '.... .... .... .... | X... .... X... .... | X... X... X... X... | X.X. X.X. XXXX XXXX' }, { vel: 0.5, cresc: [0.5, 1.15] }),
      ], { exit: ['roll', 'swell'], say: 'Both choirs climb your first notes, closer together with every bar.' }),

      sec('Both Choirs', 'climax', 8, 0.95, [
        mel('choirAh', 'theme', { oct: 1, vel: 0.92, bus: 'choir', dbl: [{ inst: 'choirLo', oct: -1, vel: 0.74, bus: 'choir' }, { inst: 'strings', oct: 1, vel: 0.5 }] }),
        men(0.5, { pat: 'X--- ---- ---- ---- | X--- ---- X--- ----' }),
        high(0.36),
        pad('organ', { reg: 43, n: 4, vel: 0.28 }),
        bass('lowBrass', '0--- ---- ---- ---- | 0--- ---- 5--- ----', { reg: 36, vel: 0.5, bus: 'brass' }),
        bass('cello', '0--- ---- ---- ---- | 0--- ---- ---- ----', { reg: 36, vel: 0.5 }),
        drums({ timpani: 'X... .... .... .... | X... .... x... x...', boom: 'X... .... .... .... | .... .... .... ....', crash: 'X... .... .... .... | .... .... .... ....' }, { vel: 0.74 }),
      ], { enter: 'big', say: 'Two choirs become one: the sopranos on top, the men an octave and more below, the organ underneath.' }),

      ...when(L >= 1, sec('One Voice', 'break', 8, 0.22, [
        mel('soprano', 'broad', { vel: 0.6 }),
        pad('choirOo', { bus: 'choir', reg: 57, n: 3, vel: 0.22, art: 4 }),
        men(0.26, { pedal: true, n: 2, reg: 40, art: 4 }),
      ], { rate: 2, exit: ['swell'], say: 'Everyone falls silent but one soprano, with the men humming a single low note.' })),

      ...when(L >= 1, sec('Gloria', 'finale', 8, 1, [
        mel('choirAh', 'theme', { oct: 1, vel: 0.96, bus: 'choir', dbl: [{ inst: 'choirLo', oct: -1, vel: 0.78, bus: 'choir' }, { inst: 'strings', oct: 1, vel: 0.56 }, { inst: 'horns', oct: 0, vel: 0.42, bus: 'brass' }] }),
        men(0.54, { pat: 'X--- ---- ---- ---- | X--- ---- X--- ----' }),
        high(0.4),
        pad('organ', { reg: 43, n: 4, vel: 0.32 }),
        mel('bell', 'sparse', { vel: 0.38, bus: 'color' }),
        bass('lowBrass', '0--- ---- ---- ---- | 0--- ---- 5--- ----', { reg: 36, vel: 0.54, bus: 'brass' }),
        bass('cello', '0--- ---- ---- ---- | 0--- ---- ---- ----', { reg: 36, vel: 0.52 }),
        drums({ timpani: 'X... .... .... .... | X... .... x... x...', boom: 'X... .... .... .... | .... .... .... ....', crash: 'X... .... .... .... | .... .... .... ....' }, { vel: 0.8 }),
      ], { prog: 'final', lift: up, enter: 'big', say: 'A whole step higher, with a bell tolling between the phrases.' })),

      sec('Amen', 'outro', 4, 0.15, [
        men(0.4, { pedal: true, n: 3, art: 4 }),
        high(0.3, { pedal: true, art: 4 }),
        pad('organ', { pedal: true, reg: 36, n: 2, vel: 0.2, art: 4 }),
      ], { prog: 'pedal', lift: up, say: 'One last chord from both choirs, high and low, left to ring in the stone.' }),
    ];
  },
};

// ═════════════════════════════ DARK CELLO — noir strings ═════════════════════════════

const darkcello: StylePreset = {
  id: 'darkcello',
  name: 'Dark Cello',
  genre: 'Cello section · noir',
  tagline: 'Cellos in the dark: a slow lament that gathers into a storm of low strings and drums.',
  palette: ['#d98f5c', '#8c2f39', '#120708'],
  meter: '4/4',
  tempo: [68, 84],
  modes: [['harmonic', 1], ['aeolian', 0.95], ['phrygian', 0.7], ['dorian', 0.4]],
  sync: 0.15,
  chordExt: 'seventh',
  padVoice: 'cello',
  reverb: { size: 3.2, damp: 0.5, wet: 0.3, predelay: 0.025 },
  tilt: { low: -0.5, high: 1.5 },
  humanize: 0.75,
  fx: { big: [['timpani', 0.8], ['boom', 0.7], ['crash', 0.35]], hit: [['timpani', 0.6]], drop: [['gong', 0.35]], roll: 'timpani', run: 'strings' },
  titles: {
    a: ['Black', 'Hollow', 'Drowned', 'Silent', 'Last', 'Cold', 'Weeping', 'Ashen'],
    b: ['Elegy', 'Nocturne', 'Lament', 'Waters', 'Hour', 'Vigil', 'Threnody', 'Requiem'],
    join: '',
  },
  form(len) {
    const L = lv(len);
    const up = L >= 1 ? 1 : 0;
    const drone = (v: number, o: O<PadLayer> = {}) => pad('strings', { pedal: true, reg: 55, n: 2, vel: v * 0.8, art: 4, ...o });
    const pulse = (v: number, o: O<OstLayer> = {}) => ost('spiccato', '0.0. 0.0. 0.0. 0.00 | 0.0. 0.0. 0.00 2.1.', { reg: 52, vel: v, acc: 'X.o. x.o. X.o. x.oo', ...o });
    return [
      sec('Alone', 'intro', 4, 0.2, [
        mel('cello', 'statement', { vel: 0.68 }),
        drone(0.26),
        mel('felt', 'sparse', { oct: 1, vel: 0.3, bus: 'color' }),
      ], { rate: 2, say: 'One section of cellos, alone in the dark, playing your notes slowly.' }),

      sec('Lament', 'theme', 8, 0.4, [
        mel('cello', 'theme', { vel: 0.76 }),
        pad('strings', { reg: 62, n: 3, vel: 0.22, art: 1 }),
        ost('pizz', '0... .... 2... .... | 3... .... 2... ....', { reg: 50, vel: 0.36, bus: 'color' }),
        bass('cello', '0--- ---- ---- ---- | 0--- ---- ---- ----', { reg: 36, vel: 0.42 }),
      ], { rate: 2, say: 'The cellos sing your theme as a lament, plucked basses walking under them.' }),

      ...when(L >= 1, sec('Shadows', 'theme', 8, 0.5, [
        mel('cello', 'inverted', { vel: 0.74 }),
        ost('tremolo', '0--- ---- ---- ---- | 2--- ---- ---- ----', { reg: 62, vel: 0.26 }),
        pad('choirOo', { bus: 'choir', reg: 64, n: 3, vel: 0.2, art: 1 }),
        bass('cello', '0--- ---- 5--- ---- | 0--- ---- ---- ----', { reg: 36, vel: 0.44 }),
        drums({ timpani: 'X... .... .... .... | .... .... .... ....' }, { vel: 0.4, every: 2 }),
      ], { prog: 'B', rate: 2, say: 'The theme turned upside down, trembling violins far above and a hidden choir.' })),

      sec('Gathering', 'build', 4, 0.62, [
        mel('cello', 'fragment', { vel: 0.72, cresc: [0.7, 1.15] }),
        pulse(0.5, { cresc: [0.6, 1.2] }),
        pad('strings', { reg: 62, n: 3, vel: 0.28, cresc: [0.5, 1.25] }),
        drums({ taikoLo: 'X... .... X... .... | X... .... X... X...', timpani: '.... .... .... .... | .... .... .... .... | X... X... X... X... | X.X. X.X. XXXX XXXX' }, { vel: 0.56, cresc: [0.5, 1.15] }),
      ], { exit: ['roll', 'run'], say: 'The cellos dig into your first notes, the basses start to drive, and the drums close in.' }),

      sec('Black Waters', 'climax', 8, 0.95, [
        mel('cello', 'theme', { vel: 0.92, dbl: [{ inst: 'strings', oct: 1, vel: 0.6 }, { inst: 'horns', oct: 0, vel: 0.44, bus: 'brass' }] }),
        pulse(0.6),
        pad('choirLo', { bus: 'choir', reg: 52, n: 2, vel: 0.32 }),
        bass('lowBrass', '0--- ---- ---- ---- | 0--- ---- 5--- ----', { reg: 33, vel: 0.46, bus: 'brass' }),
        drums({ taikoLo: 'X... ..x. X... .... | X... ..x. X.x. x...', boom: 'X... .... .... .... | .... .... .... ....', timpani: 'X... .... x... .... | X... .... x.x. x...', crash: 'X... .... .... .... | .... .... .... ....' }, { vel: 0.8, fill: { taikoLo: 'X.x. X.x. XxXx XxXx', timpani: 'X.o. x.o. x.xx xxxx' } }),
      ], { enter: 'big', say: 'The storm breaks: the cellos roar your theme with the whole string section an octave above and horns inside it.' }),

      ...when(L >= 1, sec('Embers', 'break', 8, 0.2, [
        mel('cello', 'broad', { vel: 0.62 }),
        mel('felt', 'sparse', { oct: 1, vel: 0.32, bus: 'color' }),
        drone(0.22),
      ], { rate: 2, exit: ['swell'], say: 'Only the cellos again, slower, with a piano dropping single notes like rain.' })),

      ...when(L >= 1, sec('Last Light', 'finale', 8, 1, [
        mel('cello', 'theme', { vel: 0.95, dbl: [{ inst: 'strings', oct: 1, vel: 0.64 }, { inst: 'horns', oct: 0, vel: 0.5, bus: 'brass' }, { inst: 'choirAh', oct: 1, vel: 0.36, bus: 'choir' }] }),
        pulse(0.64),
        pad('choirLo', { bus: 'choir', reg: 52, n: 2, vel: 0.36 }),
        bass('lowBrass', '0--- ---- ---- ---- | 0--- ---- 5--- ----', { reg: 33, vel: 0.5, bus: 'brass' }),
        drums({ taikoLo: 'X... ..x. X... .... | X... ..x. X.x. x...', boom: 'X... .... .... .... | .... .... .... ....', timpani: 'X... .... x... .... | X... .... x.x. x...', crash: 'X... .... .... .... | .... .... .... ....' }, { vel: 0.86, fill: { taikoLo: 'X.x. X.x. XxXx XxXx', timpani: 'X.o. x.o. x.xx xxxx' } }),
      ], { prog: 'final', lift: up, enter: 'big', say: 'One last time, a semitone higher, a choir joining the cellos at the top.' })),

      sec('Fade', 'outro', 4, 0.12, [
        mel('cello', 'sparse', { vel: 0.56, to: 3 }),
        drone(0.24, { art: 4 }),
      ], { prog: 'pedal', lift: up, say: 'The cellos let the last note go into the dark.' }),
    ];
  },
};

// ═════════════════════════════ FALLEN GOD — final boss, death & despair ═════════════════════════════
// A last battle against something that was once holy: a lone voice over tolling booms, then a choir in
// full wrath over racing strings, braams and a death-blow on every bar; a broken lament; a final phase.
const fallen: StylePreset = {
  id: 'fallen',
  name: 'Fallen God',
  genre: 'Final boss · death & despair',
  tagline: 'The last battle: a lone voice over tolling booms, then a choir in wrath, braams and a death-blow on every bar.',
  palette: ['#e8d9b0', '#9e1b1b', '#0b0606'],
  meter: '4/4',
  tempo: [128, 144],
  modes: [['phrygian', 1], ['harmonic', 0.9], ['aeolian', 0.6]],
  sync: 0.05,
  chordExt: 'triad',
  padVoice: 'choirAh',
  reverb: { size: 4, damp: 0.45, wet: 0.38, predelay: 0.035 },
  tilt: { low: 2, high: 0 },
  mix: { choir: 1.15, drums: 1.1 },
  humanize: 0.6,
  fx: {
    big: [['braam', 1], ['boom', 1], ['impact', 0.9], ['gong', 0.6], ['crash', 0.5]],
    hit: [['boom', 0.9], ['anvil', 0.4]],
    drop: [['subDrop', 0.8], ['gong', 0.5]],
    roll: 'timpani',
    run: 'strings',
  },
  titles: {
    a: ['Fallen', 'Hollow', 'Shattered', 'Ashen', 'Accursed', 'Forsaken', 'Last', 'Dying'],
    b: ['God', 'Crown', 'Throne', 'Lord', 'Star', 'Order', 'Oath', 'Ruin'],
    join: '',
  },
  form(len) {
    const L = lv(len);
    const up = L >= 1 ? 1 : 0;
    // strings racing underneath, the battle's heartbeat
    const race = (v: number, reg = 50) => ost('spiccato', '0000 1111 0000 1111 | 0000 1111 3333 2222', { reg, vel: v, acc: 'X.o. x.o. X.o. x.o.' });
    // the chorus hurls chords: long, short-short, long
    const wrath = (v: number, o: O<PadLayer> = {}) => pad('choirAh', { bus: 'choir', reg: 55, n: 4, vel: v, pat: 'X--- ---- x--- x--- | X--- ---- x.x. x...', ...o });
    // the death-blows: a boom on every bar, a braam every two, taiko and timpani driving
    const doom = (v: number): DrumLayer => drums({
      boom: 'X... .... .... .... | X... .... .... ....',
      braam: 'X... .... .... .... | .... .... .... ....',
      taikoLo: 'X... ..x. X... ..x. | X... ..x. X.x. X...',
      timpani: 'X... .... x... .... | X... .... x.x. x.xx',
      anvil: '.... .... X... .... | .... .... X... ....',
      crash: 'X... .... .... .... | .... .... .... ....',
    }, { vel: v, fill: { taikoLo: 'X.x. X.x. XxXx XXXX', timpani: 'X.o. x.o. x.xx xxxx', boom: 'X... .... X... X...' } });
    return [
      sec('The Last Throne', 'intro', 4, 0.22, [
        mel('soprano', 'statement', { vel: 0.6 }),
        pad('choirLo', { bus: 'choir', pedal: true, reg: 43, n: 2, vel: 0.3, art: 4 }),
        pad('organ', { pedal: true, reg: 36, n: 2, vel: 0.22, art: 4 }),
        drums({ boom: 'X... .... .... ....', gong: '.... .... .... .... | X... .... .... ....' }, { vel: 0.8, every: 2 }),
      ], { rate: 2, exit: ['roll'], say: 'Silence after the long road. One voice sings your notes, and far below a boom tolls like a bell for the dead.' }),

      sec('Godfall', 'theme', 8, 0.85, [
        mel('choirAh', 'theme', { vel: 0.88, bus: 'choir', dbl: [{ inst: 'lowBrass', oct: -1, vel: 0.6, bus: 'brass' }, { inst: 'strings', oct: 1, vel: 0.56 }] }),
        wrath(0.5, { reg: 50, n: 3 }),
        race(0.62),
        bass('strings', '0.0. 0.0. 0.0. 0.0.', { reg: 33, vel: 0.62, acc: 'X.o. x.o. X.o. x.o.' }),
        bass('lowBrass', '0--- ---- ---- ---- | 1--- ---- 0--- ----', { reg: 33, vel: 0.56, bus: 'brass' }),
        doom(0.8),
      ], { enter: 'big', say: 'It rises. The whole choir hurls your theme, the trombones an octave beneath it, and every bar lands with a death-blow.' }),

      ...when(L >= 1, sec('Phase of Despair', 'theme', 8, 0.6, [
        mel('lowBrass', 'call', { vel: 0.8, bus: 'brass' }),
        mel('choirStac', 'response', { vel: 0.7, bus: 'choir' }),
        ost('tremolo', '0--- ---- 1--- ---- | 0--- ---- 3--- ----', { reg: 62, vel: 0.36 }),
        race(0.5, 48),
        bass('cello', '0--- ---- 1--- ---- | 0--- ---- ---- ----', { reg: 33, vel: 0.5 }),
        drums({ boom: 'X... .... .... .... | .... .... .... ....', taikoLo: 'X... ..x. .... x... | X... ..x. x.x. ....', timpani: 'X... .... .... .... | X... .... x... ....' }, { vel: 0.66 }),
      ], { prog: 'B', say: 'The brass calls out the theme like a curse, and the chorus spits it back in short, broken syllables.' })),

      sec('No Escape', 'build', 4, 0.7, [
        mel('choirStac', 'fragment', { vel: 0.76, bus: 'choir', cresc: [0.7, 1.15], dbl: [{ inst: 'lowBrass', oct: -1, vel: 0.5, bus: 'brass' }] }),
        ost('spiccato', '0000 0000 0000 0000', { reg: 48, vel: 0.56, cresc: [0.6, 1.2], acc: 'X.o. x.o. X.o. x.o.' }),
        ost('tremolo', '0--- ---- ---- ---- | 1--- ---- ---- ----', { reg: 67, vel: 0.36, cresc: [0.5, 1.3] }),
        drums({
          boom: 'X... .... .... .... | X... .... .... .... | X... .... X... .... | X... X... X... X...',
          timpani: 'X... x... X... x... | X... x... X.x. x.x. | X.x. x.x. X.x. x.x. | xxxx xxxx xxxx xxxx',
        }, { vel: 0.62, cresc: [0.5, 1.15] }),
      ], { exit: ['roll', 'run'], say: 'Your first notes again and again, a step higher each time, while the booms come faster and faster.' }),

      sec('Death Blow', 'climax', 8, 1, [
        mel('choirAh', 'theme', { oct: 1, vel: 0.95, bus: 'choir', dbl: [{ inst: 'trumpets', oct: 0, vel: 0.6, bus: 'brass' }, { inst: 'strings', oct: 1, vel: 0.7 }, { inst: 'lowBrass', oct: -1, vel: 0.62, bus: 'brass' }] }),
        wrath(0.62),
        counter('horns', { reg: 52, vel: 0.56, bus: 'brass' }),
        race(0.7, 52),
        pad('organ', { reg: 43, n: 4, vel: 0.34 }),
        bass('strings', '0.0. 0.0. 0.0. 0.0.', { reg: 33, vel: 0.7, acc: 'X.o. x.o. X.o. x.o.' }),
        bass('sub', '0--- ---- ---- ---- | 0--- ---- ---- ----', { reg: 28, vel: 0.5 }),
        doom(0.92),
      ], { enter: 'big', say: 'The full weight: sopranos an octave up, organ and brass beneath, a braam and a boom tearing open every bar.' }),

      ...when(L >= 1, sec('Requiem for a God', 'break', 8, 0.22, [
        mel('soprano', 'broad', { vel: 0.58 }),
        pad('choirOo', { bus: 'choir', reg: 55, n: 4, vel: 0.26, art: 4 }),
        pad('strings', { reg: 52, n: 3, vel: 0.26, art: 4 }),
        mel('bell', 'sparse', { vel: 0.34, bus: 'color' }),
        drums({ boom: 'X... .... .... .... | .... .... .... ....' }, { vel: 0.6, every: 2 }),
      ], { rate: 2, exit: ['roll', 'run'], say: 'It falls. For a moment only a voice, a bell and the slow toll of the boom: a lament for what it used to be.' })),

      ...when(L >= 2, sec('Second Phase', 'theme', 8, 0.8, [
        mel('strings', 'inverted', { vel: 0.82, dbl: [{ inst: 'horns', oct: -1, vel: 0.5, bus: 'brass' }] }),
        wrath(0.52, { reg: 52 }),
        race(0.64),
        bass('lowBrass', '0--- ---- 1--- ---- | 0--- ---- ---- ----', { reg: 33, vel: 0.56, bus: 'brass' }),
        doom(0.82),
      ], { prog: 'B', enter: 'big', say: 'It gets back up. Your theme turned upside down, faster and more desperate than before.' })),

      ...when(L >= 1, sec('The Final Phase', 'finale', 8, 1, [
        mel('choirAh', 'theme', { oct: 1, vel: 0.97, bus: 'choir', dbl: [{ inst: 'trumpets', oct: 0, vel: 0.64, bus: 'brass' }, { inst: 'strings', oct: 1, vel: 0.72 }, { inst: 'lowBrass', oct: -1, vel: 0.64, bus: 'brass' }, { inst: 'bell', oct: 0, vel: 0.36, bus: 'color' }] }),
        wrath(0.66),
        counter('horns', { reg: 52, vel: 0.58, bus: 'brass' }),
        race(0.72, 52),
        pad('organ', { reg: 43, n: 4, vel: 0.38 }),
        bass('strings', '0.0. 0.0. 0.0. 0.0.', { reg: 33, vel: 0.72, acc: 'X.o. x.o. X.o. x.o.' }),
        bass('sub', '0--- ---- ---- ---- | 0--- ---- ---- ----', { reg: 28, vel: 0.54 }),
        doom(0.96),
      ], { prog: 'final', lift: up, enter: 'big', say: 'The final phase, a semitone higher: everything at once, the bell tolling inside the choir.' })),

      sec('Ashes', 'outro', 4, 0.15, [
        pad('choirLo', { bus: 'choir', pedal: true, reg: 43, n: 3, vel: 0.4, art: 4 }),
        pad('organ', { pedal: true, reg: 36, n: 2, vel: 0.28, art: 4 }),
        mel('soprano', 'sparse', { vel: 0.46, to: 3 }),
        drums({ boom: 'X... .... .... ....', gong: 'X... .... .... ....' }, { vel: 0.85, to: 1 }),
      ], { prog: 'pedal', lift: up, say: 'One last boom, a gong, and the low choir holding a single chord over the ashes.' }),
    ];
  },
};

// ═════════════════════════════ AMPLIFY — your own song, made epic ═════════════════════════════
// The music here is the imported recording itself; the layer under it is written by backing.ts,
// not by a form. The form is only a placeholder for the pads before a song is imported.
const amplify: StylePreset = {
  id: 'amplify',
  name: 'Amplify',
  genre: 'Your song, made epic',
  tagline: 'Plays your imported song exactly as it is and lays drums, a drone and impacts under it.',
  palette: ['#ffd36e', '#ff7a45', '#2b1a4f'],
  meter: '4/4',
  tempo: [60, 180],
  modes: [['aeolian', 1], ['ionian', 0.8]],
  sync: 0,
  chordExt: 'triad',
  padVoice: 'strings',
  reverb: { size: 3.2, damp: 0.45, wet: 0.3, predelay: 0.025 },
  tilt: { low: 1.5, high: 0.5 },
  humanize: 0,
  fx: {
    big: [['impact', 1], ['boom', 1], ['crash', 0.7], ['subDrop', 0.6]],
    hit: [['boom', 0.85], ['crash', 0.4]],
    drop: [['subDrop', 0.6]],
    roll: 'timpani',
  },
  titles: { a: ['Amplified'], b: ['Song'], join: 'of' },
  form() {
    return [sec('Undercurrent', 'theme', 4, 0.3, [pad('strings', { pedal: true, reg: 43, n: 2, vel: 0.4, art: 1 })])];
  },
};

export const STYLE_LIST: StylePreset[] = [amplify, titan, fallen, eldritch, requiem, choirs, darkcello, valor, baile, hellforge, column, carousel, ashen, cataclysm, silk, neon, pulse, phantom, breakneck, tape, aether];
export const STYLES: Record<string, StylePreset> = Object.fromEntries(STYLE_LIST.map((s) => [s.id, s]));
