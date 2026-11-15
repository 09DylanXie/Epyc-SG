// Melody extraction against songs whose melody is known: a lead line over chords, bass and drums.
//   npx tsx scripts/test-listen.ts
import { listen } from '../src/engine/listen';

const SR = 16000;
let failures = 0;
const fail = (m: string) => {
  failures++;
  console.log('  ✗', m);
};
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

interface Opts {
  name: string;
  leadDb: number;
  harmonics: number;
  vibrato: number;
  accomp: boolean;
  drums: boolean;
  reverb?: boolean;
  /** seconds of portamento between notes */
  glide?: number;
  /** ± seconds of timing looseness */
  jitter?: number;
  /** whole-song tuning offset in cents */
  detune?: number;
  breath?: number;
  voice?: boolean;
}

// a hook (A), a second idea (B), the hook again, a variation; quarter = 0.42 s
const A = [[69, 1], [72, 1], [74, 1], [76, 2], [74, 1], [72, 1], [69, 3]];
const B = [[67, 1], [69, 1], [71, 1], [72, 1], [74, 2], [71, 2], [67, 4]];
const C = [[76, 1], [77, 1], [76, 1], [74, 1], [72, 2], [74, 1], [69, 3]];
const TUNE = [...A, ...B, ...A, ...C, ...A];
const Q = 0.42;

function song(o: Opts) {
  const total = TUNE.reduce((a, [, d]) => a + d, 0) * Q + 2.5;
  const n = Math.floor(total * SR);
  const out = new Float32Array(n);
  const lead = Math.pow(10, o.leadDb / 20);
  // the melody, as one continuous voice so it can slide between notes like a singer
  const jit = o.jitter ?? 0;
  const det = (o.detune ?? 0) / 100;
  const truth: { midi: number; t: number; d: number }[] = [];
  {
    let t = 1;
    for (const [m, d] of TUNE) {
      const dur = d * Q;
      const start = truth.length ? t + (rnd() * 2 - 1) * jit : t;
      truth.push({ midi: m, t: start, d: dur });
      t += dur;
    }
  }
  {
    let k = 0;
    let ph = 0;
    let cur = hz(truth[0].midi + det);
    let gate = 0;
    let since = 0;
    const glide = o.glide ? 1 - Math.exp(-1 / (o.glide * SR)) : 1;
    const gk = 1 - Math.exp(-1 / (0.012 * SR));
    // vowel-ish: the 2nd–4th harmonics carry most of a sung "ah"
    const amp = Array.from({ length: o.harmonics }, (_, h) => (o.voice ? [0.6, 1, 0.8, 0.55, 0.3, 0.2, 0.15, 0.1, 0.08, 0.06][h] ?? 0.05 : 1 / (h + 1)));
    const t0 = Math.floor(truth[0].t * SR);
    for (let i = t0; i < n; i++) {
      const t = i / SR;
      while (k + 1 < truth.length && t >= truth[k + 1].t) {
        k++;
        since = 0;
      }
      const note = truth[k];
      const on = t < note.t + note.d * (o.glide ? 0.99 : 0.92);
      gate += ((on ? 1 : 0) - gate) * gk;
      if (gate < 1e-4 && !on) continue;
      since += 1 / SR;
      const target = hz(note.midi + det);
      cur += (target - cur) * glide;
      const vib = 1 + (o.vibrato / 1200) * Math.log(2) * Math.sin(2 * Math.PI * 5.5 * t) * Math.min(1, since / 0.25);
      ph += (2 * Math.PI * cur * vib) / SR;
      let v = 0;
      for (let h = 1; h <= o.harmonics; h++) v += amp[h - 1] * Math.sin(h * ph);
      if (o.breath) v += o.breath * (rnd() * 2 - 1);
      out[i] += lead * 0.25 * gate * v;
    }
  }
  if (o.accomp) {
    // chords one per bar (4 quarters), voiced around C3–C4, plus a bass line
    const chords = [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 55, 59]];
    const bar = 4 * Q;
    for (let b = 0; b * bar < total - 1; b++) {
      const ch = chords[b % 4];
      const s0 = Math.floor(b * bar * SR);
      const len = Math.min(n - s0, Math.floor(bar * SR));
      for (const m of [...ch, ch[0] - 12 - 12 + 12]) {
        const isBass = m < 50;
        const f = hz(isBass ? ch[0] - 24 : m);
        let ph = 0;
        for (let i = 0; i < len; i++) {
          ph += (2 * Math.PI * f) / SR;
          const env = Math.min(1, i / (0.02 * SR)) * Math.min(1, (len - i) / (0.02 * SR));
          let v = 0;
          const hs = isBass ? 8 : 5;
          for (let h = 1; h <= hs; h++) v += Math.sin(h * ph) / (h * h * 0.6 + 0.4);
          out[s0 + i] += (isBass ? 0.2 : 0.12) * env * v;
        }
      }
    }
  }
  if (o.drums) {
    for (let k = 0; k * Q < total; k++) {
      const s0 = Math.floor(k * Q * SR);
      for (let i = 0; i < 0.12 * SR && s0 + i < n; i++) {
        const env = Math.exp(-i / (0.03 * SR));
        out[s0 + i] += (k % 2 ? 0.25 * (rnd() * 2 - 1) : 0.5 * Math.sin(2 * Math.PI * (55 + 80 * Math.exp(-i / 400)) * (i / SR))) * env;
      }
      // hats on the off-beats
      const s1 = Math.floor((k + 0.5) * Q * SR);
      for (let i = 0; i < 0.04 * SR && s1 + i < n; i++) out[s1 + i] += 0.08 * (rnd() * 2 - 1) * Math.exp(-i / (0.008 * SR));
    }
  }
  if (o.reverb) {
    // a cheap tail: feedback combs
    for (const [dl, g] of [[0.031, 0.6], [0.037, 0.55], [0.043, 0.5]] as const) {
      const D = Math.floor(dl * SR);
      for (let i = D; i < n; i++) out[i] += g * 0.4 * out[i - D];
    }
  }
  return { pcm: out, truth };
}

const cases: Opts[] = [
  { name: 'clean lead', leadDb: 0, harmonics: 8, vibrato: 25, accomp: false, drums: false },
  { name: 'lead over band', leadDb: 0, harmonics: 8, vibrato: 25, accomp: true, drums: true },
  { name: 'quiet lead (−6 dB) over band', leadDb: -6, harmonics: 8, vibrato: 30, accomp: true, drums: true },
  { name: 'flute-like lead (3 harmonics)', leadDb: 0, harmonics: 3, vibrato: 15, accomp: true, drums: true },
  { name: 'band in a wet room', leadDb: -2, harmonics: 6, vibrato: 25, accomp: true, drums: true, reverb: true },
  { name: 'singer: glides, wide vibrato, loose', leadDb: -3, harmonics: 10, vibrato: 80, accomp: true, drums: true, reverb: true, glide: 0.06, jitter: 0.04, breath: 0.06, voice: true },
  { name: 'singer, 40 cents sharp', leadDb: -3, harmonics: 10, vibrato: 70, accomp: true, drums: true, glide: 0.05, jitter: 0.03, detune: 40, breath: 0.05, voice: true },
  // known limit: a lead this far under the band loses to the chords; reported, not asserted
  { name: 'buried lead (−11 dB) [known limit]', leadDb: -11, harmonics: 8, vibrato: 30, accomp: true, drums: true },
];

const hookStr = A.map(([m]) => m % 12).join(',');
for (const c of cases) {
  const { pcm, truth } = song(c);
  const t0 = performance.now();
  const heard = listen(pcm, SR);
  const ms = performance.now() - t0;
  // note accuracy: each true note, is there a heard note of the same pitch overlapping its middle?
  let hit = 0;
  let octave = 0;
  for (const tn of truth) {
    const mid = tn.t + tn.d / 2;
    const h = heard.line.find((x) => x.t <= mid && x.t + x.d >= mid);
    if (h && h.midi === tn.midi) hit++;
    else if (h && (h.midi - tn.midi) % 12 === 0) octave++;
  }
  const acc = hit / truth.length;
  const best = heard.phrases[0];
  const bestPcs = best ? best.notes.map((m) => m % 12).join(',') : '';
  const tunePcs = TUNE.map(([m]) => m % 12).join(',');
  const inTune = best ? tunePcs.includes(bestPcs) : false;
  console.log(
    `${c.name.padEnd(32)} notes ${hit}/${truth.length} exact (+${octave} octave) · ${heard.line.length} heard · clear ${(heard.line.map((q) => q.clear).sort((a, b) => a - b)[heard.line.length >> 1] ?? 0).toFixed(2)} · ${ms.toFixed(0)} ms\n` +
      `${''.padEnd(32)} best phrase ${best ? best.notes.join(' ') : '—'} @${best?.from.toFixed(1)}s conf ${best?.conf.toFixed(2)} ${inTune ? '(part of the tune)' : '(NOT in the tune)'}${bestPcs === hookStr || hookStr.startsWith(bestPcs) || bestPcs.startsWith(hookStr.slice(0, 8)) ? ' · the hook' : ''}`,
  );
  if (c.name.includes('known limit')) continue;
  if (acc < (c.leadDb < -8 ? 0.5 : c.harmonics <= 3 || c.leadDb < -4 || c.voice ? 0.7 : 0.85)) fail(`${c.name}: only ${(acc * 100).toFixed(0)}% of notes right`);
  if (!inTune) fail(`${c.name}: best phrase is not a stretch of the melody`);
}

// silence and noise must not crash or invent a confident tune
{
  const quiet = listen(new Float32Array(SR * 5), SR);
  if (quiet.phrases.length) fail('silence produced a phrase');
  const noise = new Float32Array(SR * 5).map(() => (rnd() * 2 - 1) * 0.3);
  const nz = listen(noise, SR);
  console.log(`noise → ${nz.line.length} notes, ${nz.phrases.length} phrases`, nz.phrases.map((p) => p.conf.toFixed(2)).join(" "), "| line conf", (nz.line.reduce((a, x) => a + x.conf, 0) / Math.max(1, nz.line.length)).toFixed(2));
  if (nz.phrases.length) fail("noise produced a phrase");
  // the last-resort reading needs only two clear notes, so give noise many more chances: long clips,
  // several seeds, white and brown (rumbly) noise
  let worst = 0;
  for (let k = 0; k < 6; k++) {
    let b = 0;
    const brown = k % 2 === 1;
    const clip = new Float32Array(SR * 75).map(() => {
      const w = rnd() * 2 - 1;
      b = b * 0.98 + w * 0.2;
      return (brown ? b : w) * 0.3;
    });
    const h = listen(clip, SR);
    const clear = h.line.filter((n) => n.clear >= 2.7).length;
    worst = Math.max(worst, clear);
    if (h.phrases.length) fail(`75 s of ${brown ? 'brown' : 'white'} noise (seed ${k}) produced ${h.phrases.length} phrase(s): ${h.phrases[0].notes.join(' ')}`);
  }
  console.log(`6 × 75 s of noise → 0 phrases expected; most notes over the clarity gate in one clip: ${worst}`);
  const tiny = listen(new Float32Array(100), SR);
  if (tiny.phrases.length) fail('tiny input produced a phrase');
}

console.log(failures ? `\n${failures} FAILURES` : '\nALL OK');
process.exit(failures ? 1 : 0);
