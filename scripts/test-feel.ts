// An imported melody keeps its recording's timing: in the finished piece, the motif's notes start at
// the same times (relative to the first) as they did in the song — not snapped to a grid — unless
// the phrase is longer than two bars, when it is squeezed evenly.
//   npx tsx scripts/test-feel.ts
import { compose } from '../src/engine/composer';
import { STYLE_LIST } from '../src/engine/styles';

const fails: string[] = [];
const fail = (s: string) => fails.push(s);
const placed = new Map<string, number>();

// an uneven, human phrase: a pickup, a long note, a rushed pair, a held end (seconds)
const CASES: { name: string; notes: number[]; rhythm: [number, number][]; bpm: number }[] = [
  { name: 'pop hook', notes: [64, 67, 69, 67, 64, 62, 60], rhythm: [[0, 0.21], [0.24, 0.58], [0.87, 0.19], [1.09, 0.17], [1.3, 0.62], [2.03, 0.33], [2.41, 1.1]], bpm: 118 },
  { name: 'ballad line', notes: [69, 72, 76, 74, 72], rhythm: [[0, 0.9], [1.02, 0.41], [1.5, 1.6], [3.3, 0.5], [3.85, 2.2]], bpm: 72 },
  { name: 'long run (squeezed)', notes: [60, 62, 64, 65, 67, 69, 71, 72, 71, 69], rhythm: [[0, 0.3], [0.5, 0.3], [1.1, 0.3], [1.6, 0.6], [2.4, 0.3], [3.1, 0.5], [3.9, 0.4], [4.6, 0.8], [5.9, 0.4], [6.8, 1.2]], bpm: 140 },
];

for (const c of CASES) {
  for (const st of STYLE_LIST.filter((x) => x.id !== 'amplify')) {
    for (const length of ['short', 'standard'] as const) {
      const sc = compose({ notes: c.notes, styleId: st.id, seed: 3, length, intensity: 0.8, origin: { name: c.name, from: 10, to: 20, rhythm: c.rhythm, bpm: c.bpm } });
      const spb = 60 / sc.bpm;
      const ins = sc.insights.find((i) => i.title.startsWith('Rhythm'))?.body ?? '';
      if (!/own timing/.test(ins)) fail(`${st.id}/${c.name}: the Rhythm insight doesn't say the timing was kept`);
      // the motif as the composer stores it ("Your motif" strand), in eighth-note slots
      const strand = sc.dna.find((d) => d.label === 'Your motif');
      if (!strand) {
        fail(`${st.id}/${c.name}: no motif strand`);
        continue;
      }
      const two = c.notes.length > 8;
      const n = two ? Math.ceil(c.notes.length / 2) : c.notes.length;
      const want = c.rhythm.slice(0, n).map(([t]) => t - c.rhythm[0][0]);
      const got = strand.notes.map((x) => x.pos * 0.5 * spb - strand.notes[0].pos * 0.5 * spb);
      if (got.length !== n) {
        fail(`${st.id}/${c.name}: motif has ${got.length} notes, expected ${n}`);
        continue;
      }
      // one even factor (1 unless squeezed) must map every heard onset onto the piece's
      const k = want[n - 1] > 0 ? got[n - 1] / want[n - 1] : 1;
      const worst = Math.max(...want.map((w, i) => Math.abs(got[i] - w * k)));
      if (worst > 0.002) fail(`${st.id}/${c.name}: onsets off by ${(worst * 1000).toFixed(0)} ms after one even scale`);
      const squeezed = /faster, evenly/.test(ins);
      if (!squeezed && Math.abs(k - 1) > 0.01) fail(`${st.id}/${c.name}: timing changed by ${k.toFixed(3)} without saying so`);
      if (k > 1.001) fail(`${st.id}/${c.name}: stretched (×${k.toFixed(2)})`);
      // and the piece really plays them there: somewhere in the score's melody, the motif's notes start
      // at the heard times × one even factor (k, or 2k where a section augments the theme)
      const mel = sc.melody;
      const pc = (m: number) => ((Math.round(m) % 12) + 12) % 12;
      let atSpeed = 0, augmented = 0;
      for (let i = 0; i + n <= mel.length; i++) {
        // first note by pitch class (a pentatonic mode like silk may bend the others onto its scale), then timing
        if (pc(mel[i].m) !== pc(c.notes[0])) continue;
        const on = mel.slice(i, i + n).map((x) => (x.t - mel[i].t) * spb);
        const f = want[n - 1] > 0 ? on[n - 1] / want[n - 1] : 1;
        if (Math.max(...want.map((w, j) => Math.abs(on[j] - w * f))) > 0.003) continue;
        if (Math.abs(f - k) < 0.01) atSpeed++;
        else if (Math.abs(f - 2 * k) < 0.02) augmented++;
      }
      if (atSpeed + augmented === 0) fail(`${st.id}/${c.name}: the piece never plays the motif with the heard timing`);
      if (length === 'standard') placed.set(st.id, (placed.get(st.id) ?? 0) + atSpeed);
      if (Number.isNaN(sc.durationSec) || sc.events.some((e) => !Number.isFinite(e.t) || !Number.isFinite(e.d) || e.d <= 0)) fail(`${st.id}/${c.name}: bad event times`);
    }
  }
  const sc = compose({ notes: c.notes, styleId: 'titan', seed: 3, length: 'standard', intensity: 0.8, origin: { name: c.name, from: 10, to: 20, rhythm: c.rhythm, bpm: c.bpm } });
  console.log(`${c.name.padEnd(22)} titan ${sc.bpm} BPM · ${sc.insights.find((i) => i.title.startsWith('Rhythm'))?.body}`);
}
// without a heard rhythm (played on the pads) nothing changes
{
  const a = compose({ notes: [64, 67, 69, 67, 64], styleId: 'titan', seed: 3, length: 'standard', intensity: 0.8 });
  if (/own timing/.test(a.insights.find((i) => i.title.startsWith('Rhythm'))?.body ?? '')) fail('pad motif claims a heard rhythm');
  // a motif changed after the import (different note count) falls back to the composer's rhythm
  const b = compose({ notes: [64, 67, 69], styleId: 'titan', seed: 3, length: 'standard', intensity: 0.8, origin: { name: 'x', from: 0, to: 1, rhythm: [[0, 0.2], [0.3, 0.2], [0.5, 0.2], [0.9, 0.2]] } });
  if (/own timing/.test(b.insights.find((i) => i.title.startsWith('Rhythm'))?.body ?? '')) fail('mismatched rhythm was used');
}

console.log('motif played at the heard speed (standard, all cases):', [...placed].map(([id, x]) => `${id} ${x}`).join(' · '));
for (const f of fails.slice(0, 20)) console.log('  ✗', f);
console.log(fails.length ? `\n${fails.length} FAILURES` : '\nALL OK');
process.exit(fails.length ? 1 : 0);
