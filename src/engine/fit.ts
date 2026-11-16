import type { PieceLength, SectionSpec } from './types';

/** running time each length aims for, including the reverb tail, in seconds */
export const LENGTH_TARGET = {
  short: { aim: 40, lo: 35, hi: 45 },
  extended: { aim: 210, lo: 185, hi: 240 },
} as const;

const isBig = (x: SectionSpec) => x.kind === 'climax' || (x.kind === 'finale' && x.energy >= 0.9);

/** the section the piece is built to arrive at */
function peakOf(specs: SectionSpec[]): number {
  // where Build & Drop lands first, then a marked climax, then simply the loudest; never a build
  const rank = (x: SectionSpec) => (x.kind === 'build' ? -9 : 0) + (x.drop ? 2 : 0) + (isBig(x) ? 1 : 0) + x.energy;
  let best = -1;
  specs.forEach((x, i) => {
    if (i === 0) return;
    if (best < 0 || rank(x) > rank(specs[best])) best = i;
  });
  return best < 0 ? specs.length - 1 : best;
}

/**
 * Fits a style's form to the chosen running time without touching what each section plays.
 * Short keeps the shape of a whole piece in about forty seconds: a short way in, the theme, the
 * arrival, and the ending. Long goes round the theme → climax cycle again (on the other set of
 * chords) before the finale. Standard is returned exactly as written. Deterministic: no dice.
 */
export function fitLength(specs: SectionSpec[], len: PieceLength, secPerBar: number, tail: number): SectionSpec[] {
  if (len === 'standard' || specs.length < 2) return specs;
  const T = LENGTH_TARGET[len];
  const secs = (xs: SectionSpec[]) => xs.reduce((a, x) => a + x.bars, 0) * secPerBar + tail;
  return len === 'short' ? fitShort(specs, T, secs) : fitLong(specs, T, secs, secPerBar);
}

type Target = (typeof LENGTH_TARGET)[keyof typeof LENGTH_TARGET];

function fitShort(src: SectionSpec[], T: Target, secs: (xs: SectionSpec[]) => number): SectionSpec[] {
  const specs = src.map((x) => ({ ...x }));
  const peak = peakOf(specs);
  const last = specs.length - 1;
  const end = last !== peak && ['outro', 'finale'].includes(specs[last].kind) ? last : -1;
  const theme = specs.findIndex((x, i) => i < peak && x.kind === 'theme');
  const intro = specs[0].kind === 'intro' ? 0 : -1;
  const pre = peak > 0 && specs[peak - 1].kind === 'build' ? peak - 1 : -1;
  // most important first; drop from the back of this list until it fits
  // a drop needs its build-up, so that goes with the arrival
  const keep = (specs[peak].drop ? [peak, pre, end, theme, intro] : [peak, end, theme, intro, pre]).filter((i, k, a) => i >= 0 && a.indexOf(i) === k);
  const pick = () => specs.filter((_, i) => keep.includes(i));
  while (keep.length > 1 && secs(pick()) > T.hi) {
    // trimming can still save the theme or the way in; only drop a section when trimming can't
    const trimmed = pick().map((x) => ({ ...x, bars: minBars(x) }));
    if (secs(trimmed) <= T.hi) break;
    keep.pop();
  }
  let out = pick();
  // then shorten, longest section first, in whole phrases
  for (let guard = 0; guard < 64 && secs(out) > T.hi; guard++) {
    let k = -1;
    out.forEach((x, i) => {
      if (x.bars > minBars(x) && (k < 0 || x.bars > out[k].bars)) k = i;
    });
    if (k < 0) break;
    const step = out[k].bars >= 8 ? 4 : 2;
    out = out.map((x, i) => (i === k ? { ...x, bars: Math.max(minBars(x), x.bars - step) } : x));
  }
  // a very fast style can come up short: give the arrival its length back
  for (let guard = 0; guard < 16 && secs(out) < T.lo; guard++) {
    const k = out.findIndex((x) => x === specs[peak] || x.name === specs[peak].name);
    const at = k >= 0 ? k : out.length - 1;
    const next = out.map((x, i) => (i === at ? { ...x, bars: x.bars + 2 } : x));
    if (secs(next) > T.hi) break;
    out = next;
  }
  return out;
}

/** how far a section can be shortened and still say what it is there to say */
function minBars(x: SectionSpec): number {
  // a build-up into a drop accelerates bar by bar; cutting it would cut off its last rush
  if (x.exit?.includes('cut')) return x.bars;
  if (x.kind === 'intro' || x.kind === 'outro' || x.kind === 'break') return 2;
  return 4;
}

function fitLong(src: SectionSpec[], T: Target, secs: (xs: SectionSpec[]) => number, secPerBar: number): SectionSpec[] {
  let out = src.map((x) => ({ ...x }));
  const peak = peakOf(out);
  let first = out.findIndex((x, i) => i > 0 && i <= peak && x.kind === 'theme');
  if (first < 0) first = Math.min(1, peak);
  const cycle = out.slice(first, peak + 1);
  if (!cycle.length) return out;
  const cycleSec = cycle.reduce((a, x) => a + x.bars, 0) * secPerBar;
  let at = peak + 1;
  const ROMAN = ['II', 'III', 'IV', 'V'];
  for (let round = 0; round < ROMAN.length && secs(out) < T.lo; round++) {
    // a whole extra cycle would overshoot: go round with just its first half
    const room = T.hi - secs(out);
    let take = cycle;
    if (cycleSec > room) {
      take = [];
      let s = 0;
      for (const x of cycle) {
        if (s + x.bars * secPerBar > room && take.length) break;
        take.push(x);
        s += x.bars * secPerBar;
      }
    }
    const again = take.map((x) => ({
      ...x,
      name: `${x.name} ${ROMAN[round]}`,
      // the same melody seen from the other set of chords, a little further on in energy
      prog: x.prog === 'pedal' || x.prog === 'final' ? x.prog : x.prog === 'B' ? ('A' as const) : ('B' as const),
      energy: Math.min(1, x.energy + 0.03 * (round + 1)),
    }));
    out = [...out.slice(0, at), ...again, ...out.slice(at)];
    at += again.length;
  }
  // still too long after the last round: shorten the repeats, never the original form
  const added = new Set(out.slice(peak + 1, at));
  for (let guard = 0; guard < 64 && secs(out) > T.hi; guard++) {
    let k = -1;
    out.forEach((x, i) => {
      if (added.has(x) && x.bars > minBars(x) && (k < 0 || x.bars > out[k].bars)) k = i;
    });
    if (k < 0) break;
    const shorter = { ...out[k], bars: Math.max(minBars(out[k]), out[k].bars - (out[k].bars >= 8 ? 4 : 2)) };
    added.add(shorter);
    out = out.map((x, i) => (i === k ? shorter : x));
  }
  return out;
}
