/** Deterministic, forkable PRNG. Same seed + same notes + same style = same piece. */

export interface Rng {
  next(): number;
  int(lo: number, hi: number): number;
  range(lo: number, hi: number): number;
  pick<T>(a: readonly T[]): T;
  weighted<T>(a: readonly T[], w: readonly number[]): T;
  chance(p: number): boolean;
  gauss(): number;
  fork(label: string): Rng;
}

export function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 15;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  return h >>> 0;
}

export function makeRng(seed: number | string): Rng {
  let a = (typeof seed === 'string' ? hashStr(seed) : seed >>> 0) || 0x9e3779b9;
  const base = a;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng: Rng = {
    next,
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    range: (lo, hi) => lo + next() * (hi - lo),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    weighted: (arr, w) => {
      let total = 0;
      for (const x of w) total += Math.max(0, x);
      let r = next() * total;
      for (let i = 0; i < arr.length; i++) {
        r -= Math.max(0, w[i]);
        if (r <= 0) return arr[i];
      }
      return arr[arr.length - 1];
    },
    chance: (p) => next() < p,
    gauss: () => {
      // sum of uniforms: cheap, bounded, close enough to normal for humanisation
      return (next() + next() + next() + next() - 2) * 1.2247;
    },
    fork: (label) => makeRng((base ^ hashStr(label)) >>> 0),
  };
  return rng;
}
