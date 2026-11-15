/* Engine self-test: every style × every length × many motifs. Run: npx tsx scripts/test-composer.ts */
import { compose, inspire } from '../src/engine/composer';
import { STYLE_LIST } from '../src/engine/styles';
import { METERS, type PieceLength, type Layer } from '../src/engine/types';
import { makeRng } from '../src/engine/rng';

let failures = 0;
const fail = (msg: string) => {
  failures++;
  if (failures < 60) console.log('  ✗ ' + msg);
};

const LENGTHS: PieceLength[] = ['short', 'standard', 'extended'];

// 1. static pattern validation
for (const st of STYLE_LIST) {
  const steps = METERS[st.meter].steps;
  for (const len of LENGTHS) {
    const form = st.form(len);
    for (const sec of form) {
      const check = (what: string, pat?: string) => {
        if (!pat || pat === 'X') return;
        if (pat.length % steps !== 0) fail(`${st.id}/${len}/${sec.name}: ${what} "${pat}" has ${pat.length} steps (bar = ${steps})`);
      };
      for (const L of sec.layers as Layer[]) {
        if (L.k === 'drums') {
          for (const [i, p] of Object.entries(L.g)) check(`drum ${i}`, p);
          if (L.fill) for (const [i, p] of Object.entries(L.fill)) check(`fill ${i}`, p);
        } else if (L.k === 'bass' || L.k === 'ost') {
          check(`${L.k} ${L.inst}`, L.pat);
          check(`${L.k} ${L.inst} acc`, L.acc);
        } else if (L.k === 'pad') check(`pad ${L.inst}`, L.pat);
        if ((L.from ?? 0) >= (L.to ?? sec.bars) || (L.from ?? 0) >= sec.bars) fail(`${st.id}/${len}/${sec.name}: layer ${L.k} has empty span`);
      }
    }
  }
}

// 2. dynamic validation
const rng = makeRng(12345);
const rows: string[] = [];
for (const st of STYLE_LIST) {
  for (const len of LENGTHS) {
    let evs = 0;
    let dur = 0;
    let maxPoly = 0;
    let bars = 0;
    for (let trial = 0; trial < 14; trial++) {
      const n = trial === 0 ? 1 : trial === 1 ? 2 : trial === 2 ? 16 : rng.int(3, 12);
      const notes = trial % 3 === 0 ? Array.from({ length: n }, () => rng.int(48, 84)) : inspire(rng.int(1, 1e9), rng.int(0, 11), st.modes[rng.int(0, st.modes.length - 1)][0]).slice(0, Math.max(1, n));
      const intensity = [0.2, 0.8, 1][trial % 3];
      const drop = trial % 2 === 1;
      let sc;
      try {
        sc = compose({ notes, styleId: st.id, seed: rng.int(1, 1e9), length: len, intensity, drop });
      } catch (e) {
        fail(`${st.id}/${len}: compose threw ${(e as Error).stack}`);
        continue;
      }
      const again = compose({ notes, styleId: st.id, seed: sc.seed, length: len, intensity, drop });
      if (JSON.stringify(again.events) !== JSON.stringify(sc.events)) fail(`${st.id}/${len}: not deterministic`);
      let prev = -1;
      for (const e of sc.events) {
        if (!Number.isFinite(e.t) || !Number.isFinite(e.d) || !Number.isFinite(e.m) || !Number.isFinite(e.v)) fail(`${st.id}/${len}: non-finite event ${JSON.stringify(e)}`);
        if (e.d <= 0) fail(`${st.id}/${len}: d<=0 ${JSON.stringify(e)}`);
        if (e.v <= 0 || e.v > 1.16) fail(`${st.id}/${len}: vel ${e.v}`);
        if (e.t < 0 || e.t > sc.totalBeats + 0.5) fail(`${st.id}/${len}: t out of range ${e.t} / ${sc.totalBeats} (${e.i})`);
        if (e.m < 20 || e.m > 110) fail(`${st.id}/${len}: midi out of range ${e.m} (${e.i})`);
        if (e.t < prev) fail(`${st.id}/${len}: unsorted`);
        if (e.from !== undefined && !Number.isFinite(e.from)) fail(`${st.id}/${len}: bad glide`);
        prev = e.t;
      }
      if (!sc.melody.length) fail(`${st.id}/${len}: empty melody`);
      if (!sc.title) fail(`${st.id}/${len}: no title`);
      if (sc.sections.some((s) => !s.say.length)) fail(`${st.id}/${len}: section without narration`);
      // polyphony
      const pts: [number, number][] = [];
      for (const e of sc.events) {
        pts.push([e.t, 1], [e.t + e.d, -1]);
      }
      pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      let cur = 0;
      for (const [, d] of pts) {
        cur += d;
        if (cur > maxPoly) maxPoly = cur;
      }
      evs = sc.events.length;
      dur = sc.durationSec;
      bars = sc.totalBars;
    }
    rows.push(`${st.id.padEnd(10)} ${len.padEnd(9)} bars ${String(bars).padStart(3)}  ${(dur / 60) | 0}:${String(Math.round(dur % 60)).padStart(2, '0')}  events ${String(evs).padStart(5)}  maxPoly ${maxPoly}`);
  }
}
console.log(rows.join('\n'));

// 2b. build-up & drop: every climax is preceded by a build, a riser and a silent beat, and lands with an impact and a sub drop
for (const st of STYLE_LIST) {
  for (const len of LENGTHS) {
    const sc = compose({ notes: [62, 65, 69, 67, 64], styleId: st.id, seed: 99, length: len, intensity: 0.8, drop: true });
    const plain = compose({ notes: [62, 65, 69, 67, 64], styleId: st.id, seed: 99, length: len, intensity: 0.8 });
    const id = `${st.id}/${len}`;
    if (sc.totalBars < plain.totalBars) fail(`${id}: drop made the piece shorter`);
    let targets = sc.sections.filter((x) => x.kind === 'climax' || (x.kind === 'finale' && x.energy >= 0.9));
    if (!targets.length) targets = sc.sections.filter((x, i) => i > 0 && sc.sections[i - 1].kind === 'build' && sc.sections[i - 1].say.some((w) => w.includes('build-up')));
    if (!targets.length) fail(`${id}: no climax to drop into`);
    for (const t of targets) {
      const T = t.startBeat;
      const at = (i: string) => sc.events.some((e) => e.i === i && Math.abs(e.t - T) < 0.05);
      if (!at('impact') || !at('subDrop')) fail(`${id}: ${t.name} has no impact/subDrop`);
      if (!sc.events.some((e) => e.i === 'riser' && e.t < T && e.t + e.d > T - 0.1)) fail(`${id}: no riser into ${t.name}`);
      const noisy = sc.events.filter((e) => e.b !== 'fx' && e.t > T - 0.9 && e.t < T - 0.06);
      if (noisy.length) fail(`${id}: ${noisy.length} notes in the silent beat before ${t.name} (${noisy[0].i})`);
      const prev = sc.sections[sc.sections.indexOf(t) - 1];
      if (!prev || prev.kind !== 'build') fail(`${id}: ${t.name} not preceded by a build`);
    }
  }
}
console.log('drop checks done');

// 3. one readable sample
const sample = compose({ notes: [62, 65, 69, 67, 64], styleId: 'titan', seed: 7, length: 'standard', intensity: 0.8 });
console.log(`\n“${sample.title}” — ${sample.keyName}, ${sample.bpm} BPM, ${sample.progression}`);
for (const i of sample.insights) console.log(` • ${i.title}\n     ${i.body}`);
for (const s of sample.sections) console.log(` § ${s.name} [${s.kind}] bars ${s.startBar + 1}-${s.startBar + s.bars} e=${s.energy} ${s.keyName}\n     ${s.say.join(' ')}`);
console.log(' melody:', sample.melody.slice(0, 24).map((n) => n.m).join(' '));
console.log(' dna:', sample.dna.map((d) => `${d.label}[${d.notes.map((n) => n.deg).join(',')}]`).join('  '));

console.log(failures ? `\n${failures} FAILURES` : '\nALL OK');
process.exit(failures ? 1 : 0);
