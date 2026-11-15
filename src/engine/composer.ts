/**
 * The composer: any handful of notes in, a fully arranged score out.
 *
 *   notes → key → motif (degrees + rhythm) → four-phrase theme → harmony chosen to fit
 *         → sections orchestrated layer by layer → transitions → a flat, time-sorted event list.
 *
 * Pure and deterministic. The same event list drives live playback and the offline MP3 render.
 */
import { makeRng, type Rng } from './rng';
import {
  MODES, PROGS, PC_NAMES, parseProg, parseRoman, chordPcs, chordLabel, chordIntervals, prettyRoman,
  degToMidi, midiToDeg, detectKey, voiceChord, chordStack, nearestPc, pcOf, triadOf,
  type Chord, type ModeId,
} from './theory';
import {
  METERS, INST_LABEL,
  type ComposeInput, type Score, type NoteEv, type Section, type SectionSpec, type StylePreset, type Layer,
  type MelLayer, type CounterLayer, type PadLayer, type BassLayer, type OstLayer, type DrumLayer, type MelForm,
  type Inst, type Bus, type ChordAt, type DnaStrand, type Insight, type MelodyNote, type EnterFx, type ExitFx,
} from './types';
import { STYLES } from './styles';

interface MelNote {
  /** eighth-note slots from the phrase start */
  pos: number;
  len: number;
  deg: number;
  /** one of the user's own notes — never bent while it sits over the chord it was harmonised with */
  raw?: boolean;
  /** index into the A progression of that chord */
  hc?: number;
}
type Phrase = MelNote[];

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;

const HIT_VEL: Record<string, number> = { X: 1, x: 0.78, o: 0.55, g: 0.3, r: 0.7 };
const ACC_VEL: Record<string, number> = { X: 1, x: 0.84, o: 0.66, g: 0.4, '.': 0.56 };

const RANGE: Partial<Record<Inst, [number, number]>> = {
  cello: [36, 69], violin: [55, 93], horns: [41, 74], trumpets: [55, 82], lowBrass: [29, 60], soprano: [58, 84],
  flute: [60, 93], bamboo: [60, 91], piano: [33, 96], felt: [40, 91], choirAh: [43, 81], choirOo: [43, 79],
  lead: [52, 93], bell: [48, 84], glock: [72, 100], celesta: [60, 96], harp: [40, 93], zither: [48, 88],
  strings: [36, 93], pluck: [52, 93], organ: [36, 84], ePiano: [45, 88], superSaw: [48, 88], guitar: [28, 79], cowbell: [55, 91],
};
const GLIDERS = new Set<Inst>(['cello', 'violin', 'soprano', 'lead', 'flute', 'bamboo']);
const HEAVY = new Set<Inst>(['boom', 'impact', 'taikoLo', 'kick', 'kickDeep', 'kickSoft', 'timpani', 'gong', 'braam']);
const LIGHT = new Set<Inst>(['snareOrch', 'snare', 'clap', 'taikoMid', 'taikoHi', 'snareLofi', 'anvil', 'crash']);
const PITCHED_PERC = new Set<Inst>(['timpani', 'braam', 'riser', 'subDrop']);
const FX_BUS = new Set<Inst>(['impact', 'braam', 'subDrop', 'riser', 'swell']);

/** curated contours (scale degrees) for the "Inspire me" button */
const SEEDS = [
  [0, 2, 4, 3, 1], [0, 4, 3, 2, 0], [4, 3, 0, 2, 1], [0, 1, 2, 4, 3, 1], [0, -1, 0, 2, 1], [4, 5, 4, 2, 0],
  [0, 2, 1, 4, 2], [0, 4, 5, 4, 2], [2, 1, 0, 4, 3], [0, 0, 2, 4, 5, 4], [4, 2, 3, 1, 0], [0, 3, 2, 4, 1, 0],
  [-3, 0, 2, 1, 0], [0, 4, 7, 6, 4], [2, 4, 5, 2, 1, 0], [0, 2, 4, 7, 5, 4, 2],
];

export function inspire(seed: number, tonicPc: number, modeId: ModeId): number[] {
  const rng = makeRng(seed);
  const mode = MODES[modeId];
  const shape = rng.pick(SEEDS);
  const tonic = nearestPc(tonicPc, 62);
  // contours are written against a seven-note scale; map through the parent so they keep their shape
  return shape.map((d) => {
    const m = degToMidi(d, tonic, mode.parent);
    return degToMidi(midiToDeg(m, tonic, mode.scale), tonic, mode.scale);
  });
}

export function compose(input: ComposeInput): Score {
  const style: StylePreset = STYLES[input.styleId] ?? STYLES.titan;
  const meter = METERS[style.meter];
  const E = meter.eighths;
  const SPAN = 2 * E;
  const rng = makeRng(`${input.seed}|${style.id}|${input.notes.join('.')}`);
  const I = clamp(input.intensity ?? 0.8, 0, 1);
  const insights: Insight[] = [];

  // ── 1. the notes ────────────────────────────────────────────────
  let played = input.notes.filter((n) => Number.isFinite(n)).slice(0, 16);
  if (!played.length) played = [62, 65, 69, 67, 64];

  // ── 2. the key ──────────────────────────────────────────────────
  const guess = detectKey(played, style.modes);
  const tonicPc = input.key ? input.key.tonicPc : guess.tonicPc;
  const modeId: ModeId = input.key ? input.key.mode : guess.mode;
  const mode = MODES[modeId];
  const scale = mode.scale;
  const N = scale.length;
  const keyName = `${PC_NAMES[tonicPc]} ${mode.name}`;
  const bent = played.filter((m) => !scale.includes(pcOf(m - tonicPc))).length;
  const names = [...new Set(played.map((m) => PC_NAMES[pcOf(m)]))];
  insights.push({
    title: `Key · ${keyName}`,
    body:
      bent === 0
        ? `${names.join(', ')} — every note you played already lives inside ${keyName}, so ${PC_NAMES[tonicPc]} becomes home. This mode reads as ${mode.mood}.`
        : `${played.length - bent} of your ${played.length} notes sit inside ${keyName}; the other ${bent} ${bent === 1 ? 'was' : 'were'} bent a semitone to join them. This mode reads as ${mode.mood}.`,
  });

  // ── 3. the motif as scale degrees ───────────────────────────────
  const sorted = [...played].sort((a, b) => a - b);
  const median = sorted[Math.floor((sorted.length - 1) / 2)];
  const refTonic = median - pcOf(median - tonicPc);
  let degs = played.map((m) => midiToDeg(m, refTonic, scale));
  degs = degs.map((d) => {
    while (d > N + 3) d -= N;
    while (d < -N + 1) d += N;
    return d;
  });
  const givenCount = degs.length;
  if (degs.length === 1) degs = [degs[0], degs[0] + 2, degs[0] + 1, degs[0] + 4];
  else if (degs.length === 2) degs = [degs[0], degs[1], degs[1] + (degs[1] >= degs[0] ? 1 : -1), degs[0]];

  const two = degs.length > 8;
  const half = two ? Math.ceil(degs.length / 2) : degs.length;
  const dA = degs.slice(0, half);
  const dB = two ? degs.slice(half) : null;

  // register: aim the motif's centre near G4
  const meanDeg = dA.reduce((a, b) => a + b, 0) / dA.length;
  let baseTonic = nearestPc(tonicPc, 62);
  {
    let best = Infinity;
    for (const cand of [baseTonic - 12, baseTonic, baseTonic + 12]) {
      const c = degToMidi(Math.round(meanDeg), cand, scale);
      if (Math.abs(c - 67) < best) {
        best = Math.abs(c - 67);
        baseTonic = cand;
      }
    }
  }

  const bpm = clamp(Math.round(input.tempo ?? rng.fork('tempo').range(style.tempo[0], style.tempo[1])), 40, 220);

  // ── 4. rhythm ───────────────────────────────────────────────────
  const weightAt = (slot: number) => meter.weights[((Math.round(slot) % E) + E) % E];

  function makeRhythm(n: number, r: Rng): { pos: number; len: number }[] {
    if (n <= 1) return [{ pos: 0, len: SPAN - 2 }];
    let L = E;
    if (n - 1 > L) {
      L = -1;
      for (let s = E + 1; s < SPAN - 1; s++) {
        if (s >= n - 1 && weightAt(s) >= 0.5) {
          L = s;
          break;
        }
      }
      if (L < 0) L = Math.min(SPAN - 2, n - 1);
    }
    const pool: number[] = [];
    const weights: number[] = [];
    for (let s = 1; s < L; s++) {
      const mw = weightAt(s);
      let w = mw >= 0.5 ? 1 : mw >= 0.3 ? 0.55 : 0.1 + 0.8 * style.sync;
      if (s >= L - 2) w *= 1.5;
      pool.push(s);
      weights.push(w);
    }
    const chosen = new Set<number>([0, L]);
    for (let k = 0; k < n - 2 && pool.length; k++) {
      const s = r.weighted(pool, weights);
      const idx = pool.indexOf(s);
      pool.splice(idx, 1);
      weights.splice(idx, 1);
      chosen.add(s);
    }
    const on = [...chosen].sort((a, b) => a - b);
    return on.map((pos, i) => ({ pos, len: i < on.length - 1 ? on[i + 1] - pos : Math.max(2, SPAN - pos - 1) }));
  }

  const toPhrase = (ds: number[], r: Rng, hc0: number): Phrase => {
    const rh = makeRhythm(ds.length, r);
    return rh.map((x, i) => ({ ...x, deg: ds[Math.min(i, ds.length - 1)], raw: true, hc: hc0 + Math.min(1, Math.floor(x.pos / E)) }));
  };

  const P1 = toPhrase(dA, rng.fork('rhythmA'), 0);
  const userB = dB ? toPhrase(dB, rng.fork('rhythmB'), 2) : null;

  insights.push({
    title: `Rhythm · ${meter.label} at ${bpm} BPM`,
    body:
      givenCount < 3
        ? `You gave me ${givenCount === 1 ? 'a single note' : 'two notes'}, so I answered with a few of my own, then spread the phrase over two bars — the last note lands on a downbeat and rings.`
        : two
          ? `Sixteen notes is two ideas: your first ${dA.length} notes became the call, the remaining ${dB!.length} the response — two bars each.`
          : `Your ${dA.length} notes were stretched across two bars of ${meter.label}. Strong beats got the anchors, the last note lands on a downbeat and is left to ring.`,
  });

  // ── 5. harmony that fits ────────────────────────────────────────
  const pcOfDeg = (deg: number) => pcOf(degToMidi(deg, tonicPc, scale));

  function isAvoid(pc: number, ch: Chord, tPc: number): boolean {
    const pcs = chordPcs(ch, tPc);
    if (pcs.includes(pc)) return false;
    for (const c of pcs) if (pcOf(pc - c) === 1) return true;
    return ch.q === 'maj' && pcOf(pc - (tPc + ch.root)) === 3;
  }

  function phraseFit(ph: Phrase, chs: Chord[]): number {
    let s = 0;
    for (const n of ph) {
      const ch = chs[Math.min(chs.length - 1, Math.floor(n.pos / E))];
      const pc = pcOfDeg(n.deg);
      const w = n.len * (weightAt(n.pos) + 0.3);
      if (chordPcs(ch, tonicPc).includes(pc)) s += w;
      else if (isAvoid(pc, ch, tonicPc)) s -= w;
      else s += 0.15 * w;
    }
    return s;
  }

  const pool = style.progs?.[mode.pool] ?? PROGS[mode.pool];
  const progRng = rng.fork('prog');
  let A: Chord[] = [];
  {
    let bs = -Infinity;
    for (const sym of pool.A) {
      const chs = parseProg(sym);
      const norm = P1.reduce((a, n) => a + n.len, 0) || 1;
      let s = phraseFit(P1, chs.slice(0, 2)) / norm;
      if (userB) s += phraseFit(userB, chs.slice(2, 4)) / (userB.reduce((a, n) => a + n.len, 0) || 1);
      s += progRng.next() * 0.45;
      if (s > bs) {
        bs = s;
        A = chs;
      }
    }
  }
  const B = parseProg(progRng.pick(pool.B));
  const cadence = parseProg(pool.cadence);
  const tonicChord = parseRoman(pool.tonic);
  const progression = A.map((c) => prettyRoman(c.roman)).join(' – ');
  insights.push({
    title: `Harmony · ${progression}`,
    body: `${A.map((c) => chordLabel(c, tonicPc)).join(' → ')}. I auditioned ${pool.A.length} progressions in ${mode.name} against your motif and kept the one where your longest, strongest notes are chord tones — the chords were chosen for your melody, not the other way round.`,
  });

  // ── 6. the theme: statement, answer, decorated return, cadence ──
  const themeRng = rng.fork('theme');

  function answerPhrase(): { ph: Phrase; how: string } {
    const chs = A.slice(2, 4);
    let best: Phrase = P1;
    let bs = -Infinity;
    let how = '';
    for (const s of [-2, -1, 1, 2, -3]) {
      const cand = P1.map((n) => ({ ...n, deg: n.deg + s, raw: false }));
      let sc = phraseFit(cand, chs);
      const last = cand[cand.length - 1];
      if (chordPcs(chs[1], tonicPc).includes(pcOfDeg(last.deg))) sc += 1.5;
      sc -= Math.abs(s) * 0.2;
      const hi = Math.max(...cand.map((n) => n.deg));
      const lo = Math.min(...cand.map((n) => n.deg));
      if (hi > N + 4 || lo < -N) sc -= 3;
      sc += themeRng.next() * 0.6;
      if (sc > bs) {
        bs = sc;
        best = cand;
        const steps = Math.abs(s);
        how = `the same shape ${steps === 1 ? 'one step' : steps === 2 ? 'a third' : 'a fourth'} ${s > 0 ? 'higher' : 'lower'}`;
      }
    }
    return { ph: best, how };
  }

  function decorate(ph: Phrase): Phrase {
    const out: Phrase = [];
    let added = 0;
    for (let i = 0; i < ph.length; i++) {
      const a = ph[i];
      const b = ph[i + 1];
      if (b && added < 2 && Math.abs(b.deg - a.deg) >= 2 && a.len >= 2) {
        const sign = Math.sign(b.deg - a.deg);
        const passing = Math.abs(b.deg - a.deg) === 2 ? a.deg + sign : b.deg - sign;
        out.push({ ...a, len: a.len - 1 });
        out.push({ pos: a.pos + a.len - 1, len: 1, deg: passing });
        added++;
      } else out.push({ ...a });
    }
    return out;
  }

  function invert(ph: Phrase): Phrase {
    const d0 = ph[0].deg;
    let inv = ph.map((n) => ({ ...n, deg: 2 * d0 - n.deg, raw: false }));
    const lo = Math.min(...inv.map((n) => n.deg));
    const hi = Math.max(...inv.map((n) => n.deg));
    if (lo < -N + 1) inv = inv.map((n) => ({ ...n, deg: n.deg + N }));
    else if (hi > N + 4) inv = inv.map((n) => ({ ...n, deg: n.deg - N }));
    return inv;
  }

  function cadencePhrase(src: Phrase, flip: boolean): Phrase {
    const ph = flip ? invert(src) : src.map((n) => ({ ...n, raw: false }));
    const last = ph.length - 1;
    const prev = ph[last - 1]?.deg ?? ph[0].deg;
    const home = Math.round(prev / N) * N;
    ph[last].deg = home;
    if (ph.length >= 3 && ph[last - 1].deg === home) ph[last - 1].deg = home + (ph[last - 2].deg > home ? 1 : -1);
    return ph;
  }

  const ans = userB ? { ph: userB, how: 'your own second idea' } : answerPhrase();
  const P2 = ans.ph;
  const P3 = decorate(P1);
  const P4 = userB ? cadencePhrase(userB, false) : cadencePhrase(P1, true);
  const theme = [P1, P2, P3, P4];
  const decorated = P3.length > P1.length;

  insights.push({
    title: 'Theme · four phrases, eight bars',
    body: `① Your motif, untouched. ② An answer — ${ans.how}. ③ Your motif again${decorated ? ', with passing notes filling its leaps' : ''}. ④ ${userB ? 'Your second idea, bent so its last note falls home to ' : 'Your motif turned upside-down so it falls home to '}${PC_NAMES[tonicPc]}.`,
  });

  // one-bar head used to build tension
  const headN = Math.min(3, P1.length);
  let head: Phrase = P1.slice(0, headN).map((n) => ({ ...n, raw: false }));
  if (head[headN - 1].pos > E - 2) {
    const step = Math.max(1, Math.floor((E - 1) / headN));
    head = head.map((n, i) => ({ ...n, pos: i * step }));
  }
  head = head.map((n, i) => ({ ...n, len: i < headN - 1 ? head[i + 1].pos - n.pos : Math.max(1, Math.min(3, E - n.pos - 1)) }));

  // contour ranks 0..3, used to shape ostinati
  const dMin = Math.min(...dA);
  const dMax = Math.max(...dA);
  const ranks = dA.map((d) => (dMax === dMin ? 0 : Math.round((3 * (d - dMin)) / (dMax - dMin))));

  // ── 7. sections ─────────────────────────────────────────────────
  const specs = style.form(input.length);
  interface SecCtx extends Section {
    chordsByBar: Chord[];
    tonicPc: number;
    spec: SectionSpec;
  }
  const secs: SecCtx[] = [];
  {
    let bar = 0;
    specs.forEach((spec, i) => {
      const lift = spec.lift ?? 0;
      const rate = spec.rate ?? 1;
      const prog = spec.prog ?? 'A';
      const chs: Chord[] = [];
      for (let b = 0; b < spec.bars; b++) {
        if (prog === 'pedal') chs.push(tonicChord);
        else {
          const seq = prog === 'B' ? B : A;
          chs.push(seq[Math.floor(b / rate) % seq.length]);
        }
      }
      if (prog === 'final' && spec.bars >= 4 * rate) {
        for (let k = 0; k < rate; k++) {
          chs[spec.bars - 2 * rate + k] = cadence[0];
          chs[spec.bars - rate + k] = cadence[1];
        }
      }
      // pivot: the bar before a key change becomes the dominant of the new key
      const next = specs[i + 1];
      if (next && (next.lift ?? 0) !== lift && prog !== 'pedal' && spec.bars >= 2) {
        const root = pcOf((next.lift ?? 0) - lift + 7);
        chs[spec.bars - 1] = { root, q: 'maj', roman: 'V→' };
      }
      const voices = [...new Set(spec.layers.filter((l) => !(l.x && I < 0.5)).map((l) => (l.k === 'drums' ? 'percussion' : INST_LABEL[l.inst])))];
      secs.push({
        name: spec.name,
        kind: spec.kind,
        startBar: bar,
        bars: spec.bars,
        startBeat: bar * meter.beats,
        beats: spec.bars * meter.beats,
        energy: spec.energy,
        lift,
        keyName: `${PC_NAMES[pcOf(tonicPc + lift)]} ${mode.name}`,
        say: [],
        voices,
        chordsByBar: chs,
        tonicPc: pcOf(tonicPc + lift),
        spec,
      });
      bar += spec.bars;
    });
  }
  const totalBars = secs.reduce((a, s) => a + s.bars, 0);
  const totalBeats = totalBars * meter.beats;

  // ── 8. orchestration ────────────────────────────────────────────
  const events: NoteEv[] = [];
  const iScale = (bus: Bus) => (bus === 'drums' || bus === 'brass' || bus === 'choir' || bus === 'fx' ? 0.62 + 0.48 * I : 0.88 + 0.15 * I);
  const emit = (e: NoteEv) => {
    if (!(e.d > 0) || !Number.isFinite(e.t) || !Number.isFinite(e.m)) return;
    e.v = clamp(e.v * iScale(e.b), 0.02, 1.15);
    events.push(e);
  };
  const secMel: (MelodyNote[] | null)[] = secs.map(() => null);
  const spanOf = (L: Layer, sec: SecCtx) => ({ from: clamp(L.from ?? 0, 0, sec.bars), to: clamp(L.to ?? sec.bars, 0, sec.bars) });
  const velOf = (L: Layer, bar: number, from: number, to: number, dflt = 0.7) => {
    let v = L.vel ?? dflt;
    if (L.cresc) v *= lerp(L.cresc[0], L.cresc[1], clamp((bar - from) / Math.max(1, to - from), 0, 1));
    return v;
  };

  function formNotes(form: MelForm, bars: number): MelNote[] {
    const out: MelNote[] = [];
    const pairs = Math.ceil(bars / 2);
    const put = (ph: Phrase, pair: number) => {
      for (const n of ph) out.push({ ...n, pos: pair * SPAN + n.pos });
    };
    switch (form) {
      case 'theme': {
        const seq = bars <= 4 ? [P1, P4] : theme;
        for (let p = 0; p < pairs; p++) put(seq[p % seq.length], p);
        break;
      }
      case 'statement':
        put(P1, 0);
        if (bars >= 4) put(P2, 1);
        break;
      case 'call':
        for (let p = 0; p < pairs; p += 2) put(P1, p);
        break;
      case 'response':
        for (let p = 1; p < pairs; p += 2) put(p % 4 === 1 ? P2 : P4, p);
        break;
      case 'loop':
        for (let p = 0; p < pairs; p++) put(p === pairs - 1 && pairs >= 4 ? P4 : p % 2 ? P3 : P1, p);
        break;
      case 'inverted': {
        const inv = invert(P1);
        for (let p = 0; p < pairs; p++) put(p % 2 ? P4 : inv, p);
        break;
      }
      case 'augmented':
        for (let q = 0; q * 4 < bars; q++) {
          const ph = q % 2 ? P4 : P1;
          for (const n of ph) out.push({ ...n, pos: q * 2 * SPAN + n.pos * 2, len: n.len * 2 });
        }
        break;
      case 'broad': {
        const seq = bars <= 8 ? [P1, P4] : theme;
        for (let q = 0; q * 4 < bars; q++) {
          for (const n of seq[q % seq.length]) out.push({ ...n, pos: q * 2 * SPAN + n.pos * 2, len: n.len * 2 });
        }
        break;
      }
      case 'fragment':
        for (let b = 0; b < bars; b++) {
          const shift = Math.floor(b / 2);
          if (b === bars - 1 && bars >= 4) {
            out.push({ pos: b * E, len: E - 1, deg: Math.max(...head.map((n) => n.deg)) + shift + 1 });
            break;
          }
          for (const n of head) out.push({ pos: b * E + n.pos, len: n.len, deg: n.deg + shift });
        }
        break;
      case 'sparse':
        for (let b = 0; b < bars; b++) out.push({ pos: b * E, len: E - 1, deg: dA[b % dA.length] });
        break;
    }
    return out.filter((n) => n.pos < bars * E).map((n) => ({ ...n, len: Math.min(n.len, bars * E - n.pos) }));
  }

  function fitMidi(m: number, ch: Chord, tPc: number, strong: boolean, long: boolean): number {
    if (!isAvoid(pcOf(m), ch, tPc) || !(strong || long)) return m;
    const pcs = chordPcs(ch, tPc);
    for (const d of [-1, 1, -2, 2]) if (pcs.includes(pcOf(m + d))) return m + d;
    return m;
  }

  function placeMel(form: MelForm, sec: SecCtx, from: number, to: number, oct: number, inst: Inst) {
    const tonic = baseTonic + sec.lift + 12 * oct;
    const prog = sec.spec.prog ?? 'A';
    let notes = formNotes(form, to - from).map((n) => {
      const slot = from * E + n.pos;
      const bar = Math.min(sec.bars - 1, Math.floor(slot / E));
      let m = degToMidi(n.deg, tonic, scale);
      const keep = !!n.raw && (prog === 'pedal' || sec.chordsByBar[bar] === A[n.hc ?? 0]);
      if (!keep) m = fitMidi(m, sec.chordsByBar[bar], sec.tonicPc, weightAt(slot) >= 0.5, n.len >= 2);
      return { slot, len: n.len, m };
    });
    const range = RANGE[inst] ?? [36, 96];
    if (notes.length) {
      const lo = Math.min(...notes.map((n) => n.m));
      const hi = Math.max(...notes.map((n) => n.m));
      let shift = 0;
      while (hi + shift > range[1]) shift -= 12;
      while (lo + shift < range[0] && hi + shift + 12 <= range[1]) shift += 12;
      // a line wider than the instrument folds its outliers back in by octaves
      notes = notes.map((n) => {
        let m = n.m + shift;
        while (m > range[1]) m -= 12;
        while (m < range[0]) m += 12;
        return { ...n, m };
      });
    }
    return notes;
  }

  function genMel(L: MelLayer, si: number) {
    const sec = secs[si];
    const { from, to } = spanOf(L, sec);
    if (to <= from) return;
    const voices: { inst: Inst; oct: number; vel: number; bus: Bus; primary: boolean }[] = [
      { inst: L.inst, oct: L.oct ?? 0, vel: 1, bus: L.bus ?? 'melody', primary: true },
      ...(L.dbl ?? []).map((d) => ({ inst: d.inst, oct: d.oct, vel: d.vel ?? 0.6, bus: d.bus ?? L.bus ?? ('melody' as Bus), primary: false })),
    ];
    for (const vc of voices) {
      const notes = placeMel(L.form, sec, from, to, vc.oct, vc.inst);
      if (!notes.length) continue;
      const lo = Math.min(...notes.map((n) => n.m));
      const hi = Math.max(...notes.map((n) => n.m));
      const glide = GLIDERS.has(vc.inst);
      const line: MelodyNote[] = [];
      notes.forEach((n, i) => {
        const prev = notes[i - 1];
        const next = notes[i + 1];
        const joined = !!next && Math.abs(next.slot - (n.slot + n.len)) < 0.01;
        const t = sec.startBeat + n.slot * 0.5;
        const d = n.len * 0.5 * (L.detached ? 0.92 : joined ? 1.04 : 0.95);
        const bar = n.slot / E;
        const height = hi === lo ? 0.5 : (n.m - lo) / (hi - lo);
        const v = velOf(L, bar, from, to, 0.75) * vc.vel * (0.9 + 0.1 * weightAt(n.slot)) * (0.92 + 0.14 * height);
        const ev: NoteEv = { t, d, i: vc.inst, m: n.m, v, b: vc.bus, s: si };
        if (glide && prev && Math.abs(prev.slot + prev.len - n.slot) < 0.01 && Math.abs(prev.m - n.m) <= 7 && prev.m !== n.m) ev.from = prev.m;
        if (!next && n.len >= E / 2 && !L.detached) ev.a = undefined;
        emit(ev);
        if (L.orn && vc.primary && n.len >= 2 && weightAt(n.slot) >= 0.5 && i > 0) {
          const tonic = baseTonic + sec.lift;
          const g = degToMidi(midiToDeg(n.m, tonic, scale) + 1, tonic, scale);
          emit({ t: t - 0.13, d: 0.12, i: vc.inst, m: g, v: v * 0.6, b: vc.bus, s: si });
        }
        line.push({ t, d: n.len * 0.5, m: n.m });
      });
      if (vc.primary && !secMel[si]) secMel[si] = line;
    }
  }

  function melodyAt(line: MelodyNote[], t: number): number {
    let m = 0;
    for (const n of line) {
      if (n.t <= t + 1e-6) m = n.m;
      else break;
    }
    return m;
  }

  function genCounter(L: CounterLayer, si: number) {
    const sec = secs[si];
    const line = secMel[si];
    if (!line?.length) return;
    const { from, to } = spanOf(L, sec);
    const reg = L.reg ?? 58;
    const cell = meter.beats / 2;
    let prev = -1;
    for (let bar = from; bar < to; bar++) {
      const pcs = chordPcs(sec.chordsByBar[bar], sec.tonicPc);
      for (let h = 0; h < 2; h++) {
        const t0 = sec.startBeat + bar * meter.beats + h * cell;
        const now = melodyAt(line, t0);
        const nxt = melodyAt(line, t0 + cell);
        const dir = nxt > now ? -1 : nxt < now ? 1 : 0;
        let pick = -1;
        let bs = -Infinity;
        for (let c = reg - 8; c <= reg + 9; c++) {
          if (!pcs.includes(pcOf(c))) continue;
          let s = -Math.abs(c - (prev < 0 ? reg : prev)) * 0.25;
          const iv = now ? pcOf(now - c) : -1;
          if (iv === 3 || iv === 4 || iv === 8 || iv === 9) s += 1.4;
          if (iv === 0) s -= 0.8;
          if (prev >= 0 && dir !== 0 && Math.sign(c - prev) === dir) s += 0.8;
          if (c === prev) s -= 0.5;
          if (now && c >= now) s -= 3;
          if (s > bs) {
            bs = s;
            pick = c;
          }
        }
        if (pick < 0) continue;
        const ev: NoteEv = { t: t0, d: cell * 1.03, i: L.inst, m: pick, v: velOf(L, bar, from, to, 0.6), b: L.bus ?? 'melody', s: si, p: 0.25 };
        if (prev >= 0 && prev !== pick && GLIDERS.has(L.inst)) ev.from = prev;
        emit(ev);
        prev = pick;
      }
    }
  }

  const beatOf = (sec: SecCtx, bar: number, step = 0) => sec.startBeat + bar * meter.beats + step * 0.25;

  function genPad(L: PadLayer, si: number) {
    const sec = secs[si];
    const { from, to } = spanOf(L, sec);
    const n = L.n ?? 4;
    const reg = L.reg ?? 60;
    const bus = L.bus ?? 'pad';
    const ext = L.ext ?? style.chordExt;
    const panOf = (idx: number, count: number) => (count <= 1 ? 0 : -0.55 * ((idx / (count - 1)) * 2 - 1));
    if (L.pedal) {
      const t0 = nearestPc(sec.tonicPc, reg);
      const notes = [t0, t0 + 7, t0 + 12, t0 + 19].slice(0, n);
      for (let b = from; b < to; b += 4) {
        const bars = Math.min(4, to - b);
        notes.forEach((m, idx) => emit({ t: beatOf(sec, b), d: bars * meter.beats, i: L.inst, m, v: velOf(L, b, from, to, 0.4), b: bus, s: si, a: L.art, p: panOf(idx, notes.length) }));
      }
      return;
    }
    let prev: number[] | undefined;
    let b = from;
    while (b < to) {
      if (L.every && (b - from) % L.every !== 0) {
        b++;
        continue;
      }
      const ch = sec.chordsByBar[b];
      let e = b + 1;
      if (!L.pat && !L.every) while (e < to && e - b < 2 && sec.chordsByBar[e] === ch) e++;
      const pcs = chordIntervals(ch, ext, mode.parent).map((iv) => pcOf(sec.tonicPc + ch.root + iv));
      const voicing = voiceChord(pcs, reg, n, prev);
      prev = voicing;
      if (!L.pat) {
        voicing.forEach((m, idx) => emit({ t: beatOf(sec, b), d: (e - b) * meter.beats * 1.01, i: L.inst, m, v: velOf(L, b, from, to, 0.5), b: bus, s: si, a: L.art, p: panOf(idx, n) }));
      } else {
        for (let st = 0; st < meter.steps; st++) {
          const at = ((b - from) * meter.steps + st) % L.pat.length;
          const c = L.pat[at];
          const hv = HIT_VEL[c];
          if (!hv) continue;
          let len = 1;
          while (st + len < meter.steps && L.pat[(at + len) % L.pat.length] === '-') len++;
          voicing.forEach((m, idx) =>
            emit({ t: beatOf(sec, b, st), d: len * 0.25 * 0.96, i: L.inst, m, v: velOf(L, b + st / meter.steps, from, to, 0.5) * hv, b: bus, s: si, a: L.art, p: panOf(idx, n) }),
          );
        }
      }
      b = e;
    }
  }

  function genBass(L: BassLayer, si: number) {
    const sec = secs[si];
    const { from, to } = spanOf(L, sec);
    const reg = L.reg ?? 36;
    for (let bar = from; bar < to; bar++) {
      if (L.every && (bar - from) % L.every !== 0) continue;
      const ch = sec.chordsByBar[bar];
      const root = nearestPc(pcOf(sec.tonicPc + ch.root), reg);
      const fifth = triadOf(ch)[triadOf(ch).length - 1];
      for (let st = 0; st < meter.steps; st++) {
        const at = ((bar - from) * meter.steps + st) % L.pat.length;
        const c = L.pat[at];
        if (c === '.' || c === '-') continue;
        let len = 1;
        while (st + len < meter.steps && L.pat[(at + len) % L.pat.length] === '-') len++;
        const m = c === '1' ? root + 12 : c === '5' ? root + fifth : c === '7' ? root + 10 : root;
        const acc = L.acc ? ACC_VEL[L.acc[at % L.acc.length]] ?? 0.56 : 1;
        emit({ t: beatOf(sec, bar, st), d: len * 0.25 * (len > 1 ? 0.99 : 0.9), i: L.inst, m, v: velOf(L, bar + st / meter.steps, from, to, 0.6) * acc, b: L.bus ?? 'bass', s: si, a: L.art });
      }
    }
  }

  function genOst(L: OstLayer, si: number) {
    const sec = secs[si];
    const { from, to } = spanOf(L, sec);
    const reg = L.reg ?? 55;
    const r = rng.fork(`ost${si}${L.inst}${L.pat}`);
    let k = 0;
    for (let bar = from; bar < to; bar++) {
      if (L.every && (bar - from) % L.every !== 0) continue;
      const ch = sec.chordsByBar[bar];
      const pcs = chordPcs(ch, sec.tonicPc);
      const stack = chordStack(pcs, reg, 8);
      if (!stack.length) continue;
      for (let st = 0; st < meter.steps; st++) {
        const at = ((bar - from) * meter.steps + st) % L.pat.length;
        const c = L.pat[at];
        if (c === '.' || c === '-') continue;
        let idx: number;
        if (c === '?') {
          if (!r.chance(0.5)) continue;
          idx = r.int(1, Math.min(5, stack.length - 1));
        } else {
          idx = parseInt(c, 10);
          if (Number.isNaN(idx)) continue;
          if (L.shape && idx > 0) idx = 1 + ranks[k++ % ranks.length];
        }
        let len = 1;
        while (st + len < meter.steps && L.pat[(at + len) % L.pat.length] === '-') len++;
        const acc = L.acc ? ACC_VEL[L.acc[at % L.acc.length]] ?? 0.56 : 0.8;
        const m = stack[Math.min(idx, stack.length - 1)];
        emit({
          t: beatOf(sec, bar, st), d: len * 0.25 * (len > 1 ? 0.99 : 0.92), i: L.inst, m,
          v: velOf(L, bar + st / meter.steps, from, to, 0.5) * acc, b: L.bus ?? 'ost', s: si, a: L.art,
        });
      }
    }
  }

  const visOf = (inst: Inst, v: number): 1 | 2 | undefined => (HEAVY.has(inst) ? (v >= 0.6 ? 2 : 1) : LIGHT.has(inst) && v >= 0.5 ? 1 : undefined);

  function genDrums(L: DrumLayer, si: number) {
    const sec = secs[si];
    const { from, to } = spanOf(L, sec);
    const fillBars = L.fillBars ?? 1;
    const fillStart = to - fillBars;
    const swing = style.swing ?? 0;
    for (let bar = from; bar < to; bar++) {
      if (L.every && (bar - from) % L.every !== 0) continue;
      const useFill = !!L.fill && bar >= fillStart && to === sec.bars;
      const g = useFill ? L.fill! : L.g;
      const rel = useFill ? bar - fillStart : bar - from;
      for (const [inst, pat] of Object.entries(g) as [Inst, string][]) {
        if (inst === 'vinyl') {
          if (rel === 0) emit({ t: beatOf(sec, bar), d: (to - bar) * meter.beats, i: 'vinyl', m: 60, v: L.vel ?? 0.5, b: 'fx', s: si });
          continue;
        }
        for (let st = 0; st < meter.steps; st++) {
          const c = pat[(rel * meter.steps + st) % pat.length];
          const hv = HIT_VEL[c];
          if (!hv) continue;
          let t = beatOf(sec, bar, st);
          if (swing && st % 2 === 1) t += swing * 0.25;
          const fv = useFill ? 0.5 + 0.6 * ((bar - fillStart + st / meter.steps) / fillBars) : 1;
          const v = velOf(L, bar + st / meter.steps, from, to, 0.8) * hv * fv;
          const m = inst === 'timpani' ? nearestPc(pcOf(sec.tonicPc + sec.chordsByBar[bar].root), 45) : 36;
          emit({ t, d: 0.25, i: inst, m, v, b: 'drums', s: si, vis: visOf(inst, v) });
          if (c === 'r') emit({ t: t + 0.125, d: 0.12, i: inst, m, v: v * 0.8, b: 'drums', s: si });
        }
      }
    }
  }

  secs.forEach((sec, si) => {
    for (const L of sec.spec.layers) {
      if (L.x && I < 0.5) continue;
      if (L.k === 'mel') genMel(L, si);
    }
    for (const L of sec.spec.layers) {
      if (L.x && I < 0.5) continue;
      switch (L.k) {
        case 'counter': genCounter(L, si); break;
        case 'pad': genPad(L, si); break;
        case 'bass': genBass(L, si); break;
        case 'ost': genOst(L, si); break;
        case 'drums': genDrums(L, si); break;
      }
    }
  });

  // ── 9. transitions: how one section hands over to the next ──────
  const gaps: [number, number][] = [];
  const fx = style.fx;
  const calm = fx.big.length === 0;
  const lowTonic = (sec: SecCtx) => nearestPc(sec.tonicPc, 33);

  function enterFx(kind: EnterFx, sec: SecCtx, si: number) {
    const list = kind === 'big' ? fx.big : kind === 'hit' ? fx.hit : kind === 'drop' ? fx.drop : [];
    for (const [inst, v] of list) {
      emit({
        t: sec.startBeat, d: inst === 'braam' ? meter.beats * 2 : meter.beats, i: inst,
        m: PITCHED_PERC.has(inst) ? lowTonic(sec) + (inst === 'timpani' ? 12 : 0) : 36,
        v, b: FX_BUS.has(inst) ? 'fx' : 'drums', s: si, vis: 2,
      });
    }
  }

  secs.forEach((sec, si) => {
    const prev = secs[si - 1];
    const next = secs[si + 1];
    // entering
    let enter = sec.spec.enter;
    if (!enter) {
      const d = prev ? sec.energy - prev.energy : 0;
      enter = calm || !prev ? 'none' : sec.energy >= 0.85 ? 'big' : d >= 0.2 ? 'hit' : d <= -0.3 ? 'drop' : 'none';
    }
    enterFx(enter, sec, si);

    if (!next) return;
    // leaving
    let exit = sec.spec.exit;
    if (!exit) {
      const d = next.energy - sec.energy;
      const lead: ExitFx = fx.riser ? 'riser' : 'swell';
      exit = calm ? [] : d >= 0.25 ? (next.energy >= 0.9 ? [lead, 'roll', 'cut'] : [lead, 'roll']) : d > 0.05 ? ['swell'] : [];
    }
    const T = next.startBeat;
    const barBeats = meter.beats;
    const nextTonic = baseTonic + next.lift;
    for (const x of exit as ExitFx[]) {
      if (x === 'swell') {
        const d = Math.min(sec.beats, barBeats);
        emit({ t: T - d, d, i: 'swell', m: 60, v: 0.8, b: 'fx', s: si });
      } else if (x === 'riser') {
        const d = Math.min(sec.beats, barBeats * (sec.bars >= 4 ? 2 : 1));
        emit({ t: T - d, d, i: 'riser', m: nextTonic, v: 0.8, b: 'fx', s: si });
      } else if (x === 'roll') {
        const steps = meter.steps;
        const cut = exit.includes('cut') ? 4 : 0;
        for (let st = 0; st < steps - cut; st++) {
          const u = st / (steps - cut);
          const v = 0.25 + 0.8 * u * u;
          const t = T - barBeats + st * 0.25;
          const m = nearestPc(next.tonicPc, 45);
          emit({ t, d: 0.2, i: fx.roll, m, v, b: 'drums', s: si, vis: st % 4 === 0 ? 1 : undefined });
          if (u > 0.5 && bpm <= 132) emit({ t: t + 0.125, d: 0.12, i: fx.roll, m, v: v * 0.85, b: 'drums', s: si });
        }
      } else if (x === 'run' && fx.run) {
        const count = meter.steps === 12 ? 6 : 8;
        const cut = exit.includes('cut') ? 4 : 0;
        const target = midiToDeg(nextTonic + 12, nextTonic, scale);
        for (let k = 0; k < count; k++) {
          const t = T - cut * 0.25 - (count - k) * 0.25;
          emit({ t, d: 0.22, i: fx.run, m: degToMidi(target - (count - k), nextTonic, scale), v: 0.35 + 0.5 * (k / count), b: 'ost', s: si });
        }
      } else if (x === 'gliss' && fx.gliss) {
        const count = 14;
        for (let k = 0; k < count; k++) {
          emit({ t: T - 1 + k / count, d: 0.6, i: fx.gliss, m: degToMidi(k - 5, nextTonic, mode.parent), v: 0.3 + 0.4 * (k / count), b: 'color', s: si, p: -0.4 + (0.8 * k) / count });
        }
      } else if (x === 'cut') {
        gaps.push([T - 1, T]);
      }
    }
  });

  // the breath before the drop: silence everything but the risers
  let out = events;
  if (gaps.length) {
    out = [];
    for (const e of events) {
      if (e.b === 'fx') {
        out.push(e);
        continue;
      }
      let keep = true;
      for (const [g0, g1] of gaps) {
        if (e.t >= g0 - 1e-6 && e.t < g1 - 1e-6) {
          keep = false;
          break;
        }
        if (e.t < g0 && e.t + e.d > g0) e.d = g0 - e.t;
      }
      if (keep && e.d > 0.01) out.push(e);
    }
  }

  // ── 10. humanise, sort ──────────────────────────────────────────
  const hum = rng.fork('human');
  const secPerBeat = 60 / bpm;
  for (const e of out) {
    if (style.humanize > 0 && e.b !== 'fx') {
      const amt = e.b === 'drums' ? 0.004 : 0.009;
      e.t = Math.max(0, e.t + (hum.gauss() * amt * style.humanize) / secPerBeat);
      e.v = clamp(e.v * (1 + hum.gauss() * 0.05 * style.humanize), 0.02, 1.15);
    }
  }
  out.sort((a, b) => a.t - b.t);

  // ── 11. narration ───────────────────────────────────────────────
  const melSay: Record<MelForm, (inst: string) => string> = {
    statement: (i) => `The ${i} states your motif exactly as you played it.`,
    theme: (i) => `The full eight-bar theme in the ${i}: your motif, its answer, the return, the fall home.`,
    call: (i) => `The ${i} calls with your motif, then leaves room for a reply.`,
    response: (i) => `The ${i} replies with the answering phrase.`,
    fragment: (i) => `Only the first ${headN} notes of your motif in the ${i}, climbing a step every two bars to build pressure.`,
    broad: (i) => `The whole theme at half speed in the ${i}, so it floats over the rhythm instead of chasing it.`,
    augmented: (i) => `Your motif at half speed in the ${i} — every note twice as long, twice as heavy.`,
    inverted: (i) => `Your motif turned upside-down in the ${i}: every rise becomes a fall.`,
    loop: (i) => `Your motif loops as the hook in the ${i}.`,
    sparse: (i) => `Your notes, one per bar, left to hang in the ${i}.`,
  };
  secs.forEach((sec) => {
    if (sec.spec.say) sec.say.push(sec.spec.say);
    const mels = sec.spec.layers.filter((l): l is MelLayer => l.k === 'mel' && !(l.x && I < 0.5));
    mels.slice(0, 2).forEach((m) => sec.say.push(melSay[m.form](INST_LABEL[m.inst])));
    if (sec.spec.layers.some((l) => l.k === 'ost' && l.shape)) sec.say.push(`The ostinato underneath traces the contour of your motif.`);
    if (sec.lift && sec.lift !== (secs[secs.indexOf(sec) - 1]?.lift ?? 0)) sec.say.push(`Key change: everything lifts ${sec.lift} semitone${Math.abs(sec.lift) === 1 ? '' : 's'} to ${sec.keyName}.`);
  });

  // ── 12. everything the UI wants to show ─────────────────────────
  const chords: ChordAt[] = [];
  secs.forEach((sec) => {
    let b = 0;
    while (b < sec.bars) {
      const ch = sec.chordsByBar[b];
      let e = b + 1;
      while (e < sec.bars && sec.chordsByBar[e] === ch) e++;
      chords.push({
        bar: sec.startBar + b,
        beat: sec.startBeat + b * meter.beats,
        beats: (e - b) * meter.beats,
        name: chordLabel(ch, sec.tonicPc),
        roman: prettyRoman(ch.roman),
        pcs: chordPcs(ch, sec.tonicPc),
      });
      b = e;
    }
  });

  const strip = (ph: Phrase) => ph.map(({ pos, len, deg }) => ({ pos, len, deg }));
  const dna: DnaStrand[] = [
    { label: 'Your motif', hint: 'exactly what you played', span: SPAN, notes: strip(P1) },
    { label: 'Answer', hint: userB ? 'your second idea' : ans.how, span: SPAN, notes: strip(P2) },
    { label: 'Return', hint: decorated ? 'leaps filled with passing notes' : 'restated', span: SPAN, notes: strip(P3) },
    { label: 'Cadence', hint: userB ? 'bent to fall home' : 'inverted, falls home', span: SPAN, notes: strip(P4) },
    { label: 'Augmented', hint: 'half speed, for the summit', span: SPAN * 2, notes: P1.map((n) => ({ pos: n.pos * 2, len: n.len * 2, deg: n.deg })) },
    { label: 'Fragment', hint: `first ${headN} notes, the engine of the build`, span: E, notes: strip(head) },
  ];

  const melody: MelodyNote[] = [];
  secMel.forEach((line) => line && melody.push(...line));
  melody.sort((a, b) => a.t - b.t);

  const musicSec = totalBeats * secPerBeat;
  const durationSec = musicSec + style.reverb.size * 0.9 + 1.5;
  const peaks = secs.filter((s) => s.energy >= 0.9);
  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
  insights.push({
    title: `Form · ${secs.length} sections, ${totalBars} bars`,
    body:
      `${secs.map((s) => s.name).join(' → ')}. ` +
      (peaks.length
        ? `It peaks at bar ${peaks[0].startBar + 1}${peaks.length > 1 ? ` and again at bar ${peaks[peaks.length - 1].startBar + 1}${peaks[peaks.length - 1].lift ? `, lifted to ${peaks[peaks.length - 1].keyName}` : ''}` : ''}. `
        : '') +
      `Running time ${mmss(durationSec)}.`,
  });

  const tr = rng.fork('title');
  const title = `${tr.pick(style.titles.a)} ${style.titles.join} ${tr.pick(style.titles.b)}`.replace(/\s+/g, ' ').trim();

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- stripping internal working fields
  const sections: Section[] = secs.map(({ chordsByBar: _c, tonicPc: _t, spec: _s, ...rest }) => rest);

  return {
    title, styleId: style.id, seed: input.seed, bpm, meter, tonicPc, mode: modeId, keyName, totalBars, totalBeats,
    musicSec, durationSec, sections, chords, events: out, melody, dna, insights, input: played, baseTonic, progression,
  };
}
