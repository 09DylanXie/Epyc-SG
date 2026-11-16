// Piece lengths: Short ≈ 40 s, Long 3–4 min, Standard untouched.
//   npx tsx scripts/test-length.ts            check
//   npx tsx scripts/test-length.ts snapshot=F write Standard's fingerprints to F (before a change)
//   npx tsx scripts/test-length.ts against=F  check Standard is identical to that snapshot
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { compose } from '../src/engine/composer';
import { STYLE_LIST } from '../src/engine/styles';

const arg = (k: string) => process.argv.find((a) => a.startsWith(k + '='))?.split('=').slice(1).join('=');
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const MOTIFS = [[62, 65, 69, 67, 64], [60, 62, 64, 67, 69, 67, 64, 62, 60], [69, 72, 74, 76, 74, 72, 69]];
const RANGE = { short: [33, 47], extended: [180, 245] } as const;
let failures = 0;
const fail = (m: string) => {
  failures++;
  if (failures < 40) console.log('  ✗', m);
};
const prints: Record<string, string> = {};
for (const s of STYLE_LIST.filter((x) => x.id !== 'amplify')) {
  const row: string[] = [];
  for (const length of ['short', 'standard', 'extended'] as const) {
    const ds: number[] = [];
    for (const seed of SEEDS)
      for (const drop of [false, true]) {
        const notes = MOTIFS[seed % MOTIFS.length];
        const sc = compose({ notes, styleId: s.id, seed, length, intensity: 0.8, drop });
        ds.push(sc.durationSec);
        if (length === 'standard') prints[`${s.id}/${seed}/${drop}`] = createHash('sha1').update(JSON.stringify([sc.events, sc.sections.map((x) => [x.name, x.bars])])).digest('hex');
        else {
          const [lo, hi] = RANGE[length];
          if (sc.durationSec < lo || sc.durationSec > hi) fail(`${s.id} ${length} seed ${seed}${drop ? ' drop' : ''}: ${sc.durationSec.toFixed(0)} s at ${sc.bpm} BPM (${sc.sections.map((x) => x.name + ':' + x.bars).join(', ')})`);
          // the motif must still be heard and the piece must still end, not stop
          if (!sc.melody.length) fail(`${s.id} ${length} seed ${seed}: no melody`);
          const last = sc.sections[sc.sections.length - 1];
          if (length === 'short' && !['outro', 'finale', 'climax'].includes(last.kind)) fail(`${s.id} short seed ${seed}: ends on a ${last.kind}`);
        }
      }
    row.push(`${length.slice(0, 5).padEnd(5)} ${Math.min(...ds).toFixed(0).padStart(3)}–${Math.max(...ds).toFixed(0).padStart(3)} s`);
  }
  console.log(s.id.padEnd(10), row.join('   '));
}
const snap = arg('snapshot');
if (snap) {
  writeFileSync(snap, JSON.stringify(prints));
  console.log(`wrote ${Object.keys(prints).length} Standard fingerprints to ${snap}`);
}
const against = arg('against');
if (against) {
  const old = JSON.parse(readFileSync(against, 'utf8')) as Record<string, string>;
  const diff = Object.keys(old).filter((k) => old[k] !== prints[k]);
  console.log(`Standard: ${Object.keys(old).length - diff.length}/${Object.keys(old).length} pieces identical to the snapshot`);
  for (const k of diff.slice(0, 10)) fail(`Standard changed: ${k}`);
}
console.log(failures ? `\n${failures} FAILURES` : '\nALL OK');
process.exit(failures ? 1 : 0);
