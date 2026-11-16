// What the composer understands when you talk to it about an imported song.
//   npx tsx scripts/test-request.ts
import { parseRequest, type Request } from '../src/engine/request';
import { STYLE_LIST } from '../src/engine/styles';

const ctx = { seconds: 210, styles: STYLE_LIST.map((s) => ({ id: s.id, name: s.name })) };
let failures = 0;
const cases: [string, Partial<Request> & { kind: Request['kind'] }][] = [
  ['use 1:20 to 1:35', { kind: 'window', from: 80, to: 95 }],
  ['from 1:20 - 1:35', { kind: 'window', from: 80, to: 95 }],
  ['take the melody between 80 and 95', { kind: 'window', from: 80, to: 95 }],
  ['between 1:35 and 1:20 please', { kind: 'window', from: 80, to: 95 }],
  ['1m20s to 1m35s', { kind: 'window', from: 80, to: 95 }],
  ['at 1:37', { kind: 'window', from: 95, to: 107 }],
  ['around 90 seconds', { kind: 'window', from: 88, to: 100 }],
  ['something around 2 minutes', { kind: 'window', from: 118, to: 130 }],
  ['after 2:00', { kind: 'window', from: 120, to: 135 }],
  ['before 0:30', { kind: 'window', from: 15, to: 30 }],
  ['the first 30 seconds', { kind: 'window', from: 0, to: 30 }],
  ['last 20 seconds', { kind: 'window', from: 190, to: 210 }],
  ['near the end', { kind: 'window', from: 180, to: 210 }],
  ['the intro', { kind: 'window', from: 0, to: 30 }],
  ['the middle', { kind: 'window', from: 90, to: 120 }],
  ['a longer one from 1:20 to 1:35', { kind: 'window', from: 80, to: 95, size: 11 }],
  ['use 4:00', { kind: 'past-end' }],
  ['later', { kind: 'shift', dir: 1 }],
  ['a bit earlier', { kind: 'shift', dir: -1 }],
  ['make it longer', { kind: 'size', size: 11 }],
  ['shorter', { kind: 'size', size: 4 }],
  ['another one', { kind: 'next' }],
  ['try something else', { kind: 'next' }],
  ['option 3', { kind: 'option', n: 3 }],
  ['use phrase 2', { kind: 'option', n: 2 }],
  ['list', { kind: 'list' }],
  ['what else did you hear', { kind: 'list' }],
  ['go back to your pick', { kind: 'reset' }],
  ['new arrangement', { kind: 'again' }],
  ['make it Phantom', { kind: 'style', id: 'phantom' }],
  ['switch to dark cello mode', { kind: 'style', id: ctx.styles.find((s) => s.name === 'Dark Cello')!.id }],
  ['use the choir', { kind: 'style', id: ctx.styles.find((s) => s.name === 'Twin Choirs')!.id }],
  ['the chorus', { kind: 'sections' }],
  ['start over', { kind: 'reset' }],
  ['the first minute', { kind: 'window', from: 0, to: 60 }],
  ['the last minute', { kind: 'window', from: 150, to: 210 }],
  ['first 2 minutes', { kind: 'window', from: 0, to: 120 }],
  ['help', { kind: 'help' }],
  ['make it sound happier', { kind: 'help' }],
  ['', { kind: 'help' }],
];
for (const [said, want] of cases) {
  const got = parseRequest(said, ctx) as unknown as Record<string, unknown>;
  const ok = Object.entries(want).every(([k, v]) => (typeof v === 'number' ? Math.abs((got[k] as number) - v) < 0.01 : got[k] === v));
  if (!ok) failures++;
  console.log(`${ok ? '  ✓' : '  ✗'} ${JSON.stringify(said).padEnd(40)} → ${JSON.stringify(got)}`);
}
console.log(failures ? `\n${failures} FAILURES` : '\nALL OK');
process.exit(failures ? 1 : 0);
