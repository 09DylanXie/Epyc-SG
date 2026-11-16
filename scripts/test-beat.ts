// Following a recording: tempo, beats, bars and key on band recordings whose answers are known.
//   npx tsx scripts/test-beat.ts
import { PULSE_MIN } from '../src/engine/backing';
import { mapSong } from '../src/engine/beat';

const SR = 16000;
let failures = 0;
const fail = (m: string) => {
  failures++;
  console.log('  ✗', m);
};
let seed = 11;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

interface Band {
  name: string;
  bpm: number;
  /** tempo at the end relative to the start (a band that rushes) */
  drift?: number;
  tonic: number;
  minor: boolean;
  bars: number;
  /** seconds before the first downbeat */
  pre?: number;
  drums?: boolean;
  /** cents off A440 */
  detune?: number;
  /** quiet first half, loud second half */
  dynamics?: boolean;
}

function band(o: Band) {
  const beats: number[] = [];
  let t = o.pre ?? 0.5;
  const nBeats = o.bars * 4;
  for (let i = 0; i < nBeats; i++) {
    beats.push(t);
    t += 60 / (o.bpm * (1 + ((o.drift ?? 0) * i) / nBeats));
  }
  const total = t + 1.5;
  const n = Math.floor(total * SR);
  const out = new Float32Array(n);
  const det = (o.detune ?? 0) / 100;
  // i – VI – III – VII in minor, I – V – vi – IV in major
  const prog = o.minor ? [[0, 3, 7], [8, 12, 15], [3, 7, 10], [10, 14, 17]] : [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12]];
  const tone = (start: number, dur: number, midi: number, amp: number, harm: number) => {
    const s0 = Math.floor(start * SR);
    const len = Math.min(n - s0, Math.floor(dur * SR));
    const f = hz(midi + det);
    for (let i = 0; i < len; i++) {
      const env = Math.min(1, i / (0.01 * SR)) * Math.min(1, (len - i) / (0.03 * SR)) * Math.exp(-i / (SR * 1.5));
      let v = 0;
      for (let h = 1; h <= harm; h++) v += Math.sin((2 * Math.PI * f * h * i) / SR) / h;
      out[s0 + i] += amp * env * v;
    }
  };
  for (let b = 0; b < o.bars; b++) {
    const t0 = beats[b * 4];
    const t1 = b * 4 + 4 < beats.length ? beats[b * 4 + 4] : t0 + 240 / o.bpm;
    const loud = o.dynamics ? (b < o.bars / 2 ? 0.35 : 1) : 1;
    const ch = prog[b % 4];
    for (const iv of ch) tone(t0, t1 - t0, 48 + o.tonic + iv, 0.05 * loud, 5);
    tone(t0, (t1 - t0) / 2, 36 + o.tonic + ch[0], 0.16 * loud, 6);
    tone((t0 + t1) / 2, (t1 - t0) / 2, 36 + o.tonic + ch[0], 0.12 * loud, 6);
    // a simple tune on the chord tones
    for (let k = 0; k < 4; k++) tone(beats[b * 4 + k], (t1 - t0) / 4, 60 + o.tonic + ch[(k + b) % 3] + (k === 3 ? 12 : 0), 0.05 * loud, 4);
  }
  if (o.drums !== false) {
    for (let i = 0; i < beats.length; i++) {
      const s0 = Math.floor(beats[i] * SR);
      const loud = o.dynamics ? (i < beats.length / 2 ? 0.35 : 1) : 1;
      for (let k = 0; k < 0.15 * SR && s0 + k < n; k++) {
        const env = Math.exp(-k / (0.035 * SR));
        // kick on 1 and 3 (the 1 harder), snare on 2 and 4
        const kick = (i % 4 === 0 ? 0.75 : 0.5) * Math.sin(2 * Math.PI * (50 + 90 * Math.exp(-k / 300)) * (k / SR));
        out[s0 + k] += loud * (i % 2 === 0 ? kick : 0.3 * (rnd() * 2 - 1)) * env;
      }
      const next = beats[i + 1] ?? beats[i] + 60 / o.bpm;
      const s1 = Math.floor(((beats[i] + next) / 2) * SR);
      for (let k = 0; k < 0.03 * SR && s1 + k < n; k++) out[s1 + k] += loud * 0.06 * (rnd() * 2 - 1) * Math.exp(-k / (0.006 * SR));
    }
  }
  return { pcm: out, beats };
}

const cases: Band[] = [
  { name: 'pop at 120', bpm: 120, tonic: 0, minor: false, bars: 24 },
  { name: 'rock at 132 in E minor', bpm: 132, tonic: 4, minor: true, bars: 28 },
  { name: 'ballad at 76 in Ab major', bpm: 76, tonic: 8, minor: false, bars: 16 },
  { name: 'fast at 168 in D minor', bpm: 168, tonic: 2, minor: true, bars: 36 },
  { name: 'band that rushes 100→106', bpm: 100, drift: 0.06, tonic: 7, minor: false, bars: 32 },
  { name: 'pickup, 30 cents flat, F# minor', bpm: 112, tonic: 6, minor: true, bars: 24, pre: 1.37, detune: -30 },
  { name: 'quiet verse, loud chorus', bpm: 124, tonic: 9, minor: true, bars: 32, dynamics: true },
  { name: 'no drums (pads and bass only)', bpm: 96, tonic: 5, minor: false, bars: 24, drums: false },
];

for (const c of cases) {
  const { pcm, beats } = band(c);
  const t0 = performance.now();
  const m = mapSong(pcm, SR, (c.detune ?? 0) / 100);
  const ms = performance.now() - t0;
  if (!m) {
    fail(`${c.name}: no map`);
    continue;
  }
  // half time is a fair reading (and suits big hits): then every other true beat is the grid
  const half = Math.abs(m.bpm / (c.bpm / 2) - 1) < 0.05;
  const tempoOk = half || Math.abs(m.bpm / c.bpm - 1) < 0.05;
  const truth = half ? beats.filter((_, i) => i % 2 === 0 || i % 2 === 1) : beats;
  // beats within 70 ms of a true beat, both ways (in half time, every tracked beat must be a true
  // beat and they must cover every other one)
  const near = (a: number[], b: number[]) => a.filter((x) => b.some((y) => Math.abs(x - y) < 0.07)).length;
  const prec = near(m.beats, truth) / m.beats.length;
  const rec = near(truth, m.beats) / (half ? truth.length / 2 : truth.length);
  const F = (2 * prec * Math.min(1, rec)) / Math.max(1e-9, prec + Math.min(1, rec));
  const bars = beats.filter((_, i) => i % 4 === 0);
  let onBar = 0;
  let count = 0;
  for (let i = m.first; i < m.beats.length; i += 4) {
    count++;
    if (bars.some((y) => Math.abs(m.beats[i] - y) < 0.07)) onBar++;
  }
  const keyOk = m.tonicPc === c.tonic && m.minor === c.minor;
  const keyRel = !keyOk && m.minor !== c.minor && m.tonicPc === (c.minor ? (c.tonic + 3) % 12 : (c.tonic + 9) % 12);
  console.log(
    `${c.name.padEnd(34)} tempo ${m.bpm.toFixed(1).padStart(5)} (true ${c.bpm}${half ? ', half time' : ''}) · beats F ${(F * 100).toFixed(0)}% · bars ${onBar}/${count} · key ${NAMES[m.tonicPc]} ${m.minor ? 'min' : 'maj'} fit ${m.keyFit.toFixed(2)} margin ${m.keyMargin.toFixed(3)}${m.keySure ? ' sure' : m.droneSafe ? ' drone-safe' : ''} (true ${NAMES[c.tonic]} ${c.minor ? 'min' : 'maj'}) · pulse ${m.pulse.toFixed(2)} · ${ms.toFixed(0)} ms`,
  );
  if (!tempoOk) fail(`${c.name}: tempo ${m.bpm.toFixed(1)} vs ${c.bpm}`);
  if (F < 0.9) fail(`${c.name}: beats only ${(F * 100).toFixed(0)}% right`);
  if (onBar / count < 0.9) fail(`${c.name}: bar lines wrong (${onBar}/${count})`);
  // being sure of a wrong key would put a drone in the wrong key under the song
  if (m.keySure && !keyOk && !keyRel) fail(`${c.name}: sure of the wrong key`);
  if (m.pulse < PULSE_MIN) fail(`${c.name}: pulse ${m.pulse.toFixed(2)} too unclear for drums`);
  if (m.droneSafe && !keyOk && !keyRel) fail(`${c.name}: would hold the wrong keynote`);
  if (!keyOk && !keyRel) fail(`${c.name}: key wrong`);
  if (c.dynamics) {
    const half = m.barDb.length >> 1;
    const a = m.barDb.slice(0, half).reduce((x, y) => x + y, 0) / half;
    const b = m.barDb.slice(half).reduce((x, y) => x + y, 0) / (m.barDb.length - half);
    if (b - a < 6) fail(`${c.name}: loud half only ${(b - a).toFixed(1)} dB louder`);
  }
}
// noise and silence: no map, or one that is not sure of any key
{
  const noise = new Float32Array(SR * 20).map(() => (rnd() * 2 - 1) * 0.2);
  const m = mapSong(noise, SR);
  console.log(`noise → ${m ? `pulse ${m.pulse.toFixed(2)}, tempo ${m.bpm.toFixed(0)}, key sure: ${m.keySure} (fit ${m.keyFit.toFixed(2)})` : 'no map'}`);
  if (m?.keySure) fail('noise: sure of a key');
  if (m?.droneSafe) fail('noise: would hold a drone');
  if (m && m.pulse >= PULSE_MIN) fail(`noise: pulse ${m.pulse.toFixed(2)} would get drums`);
  if (mapSong(new Float32Array(SR * 20), SR)) fail('silence gave a map');
}
// a lone triad over its root fits several keys; a drone may only ever sit on the root
for (const [root, third, name] of [[48, 4, 'C major'], [45, 3, 'A minor'], [43, 4, 'G major']] as const) {
  const n = SR * 24;
  const pcm = new Float32Array(n);
  const f = (m: number) => 440 * 2 ** ((m - 69) / 12);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const bt = t % 0.5;
    let x = Math.sin(2 * Math.PI * 55 * bt) * Math.exp(-bt * 14) * 0.5;
    x += 0.18 * Math.sin(2 * Math.PI * f(root - 12) * t);
    for (const m of [root + 12, root + 12 + third, root + 19]) x += 0.07 * Math.sin(2 * Math.PI * f(m) * t);
    pcm[i] = x * 0.8;
  }
  const m = mapSong(pcm, SR)!;
  const ok = !m.droneSafe || m.tonicPc === root % 12;
  console.log(`triad on ${name.padEnd(8)} → ${m.droneSafe ? 'drone on ' + NAMES[m.tonicPc] : 'no drone'}${m.keySure ? ' (key sure)' : ''}`);
  if (!ok) fail(`triad on ${name}: would hold ${NAMES[m.tonicPc]}, not its root`);
  if (mapSong(new Float32Array(SR * 2), SR)) fail('two seconds gave a map');
}
console.log(failures ? `\n${failures} FAILURES` : '\nALL OK');
process.exit(failures ? 1 : 0);
