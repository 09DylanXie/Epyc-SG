// Run the melody extractor on WAV files from disk and print what it hears.
//   npx tsx scripts/listen-wav.ts <file.wav> [...]
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { listen } from '../src/engine/listen';

function readWav(path: string): { pcm: Float32Array; sr: number } {
  const b = readFileSync(path);
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') throw new Error('not a WAV');
  let p = 12;
  let fmt = { ch: 1, sr: 44100, bits: 16, tag: 1 };
  while (p + 8 <= b.length) {
    const id = b.toString('ascii', p, p + 4);
    const size = b.readUInt32LE(p + 4);
    const body = p + 8;
    if (id === 'fmt ') fmt = { tag: b.readUInt16LE(body), ch: b.readUInt16LE(body + 2), sr: b.readUInt32LE(body + 4), bits: b.readUInt16LE(body + 14) };
    if (id === 'data') {
      const bytes = fmt.bits / 8;
      const n = Math.floor(Math.min(size, b.length - body) / (bytes * fmt.ch));
      const pcm = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        let v = 0;
        for (let c = 0; c < fmt.ch; c++) {
          const o = body + (i * fmt.ch + c) * bytes;
          v += fmt.tag === 3 ? b.readFloatLE(o) : fmt.bits === 16 ? b.readInt16LE(o) / 32768 : fmt.bits === 24 ? b.readIntLE(o, 3) / 8388608 : (b[o] - 128) / 128;
        }
        pcm[i] = v / fmt.ch;
      }
      return { pcm, sr: fmt.sr };
    }
    p = body + size + (size & 1);
  }
  throw new Error('no data chunk');
}

// the app decodes at 16 kHz; do the same with a simple averaging resampler
function to16k(pcm: Float32Array, sr: number): Float32Array {
  const ratio = sr / 16000;
  const out = new Float32Array(Math.floor(pcm.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const a = Math.floor(i * ratio);
    const b = Math.max(a + 1, Math.floor((i + 1) * ratio));
    let s = 0;
    for (let k = a; k < b && k < pcm.length; k++) s += pcm[k];
    out[i] = s / (b - a);
  }
  return out;
}

const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const nm = (m: number) => names[m % 12] + (Math.floor(m / 12) - 1);
for (const file of process.argv.slice(2)) {
  try {
    const { pcm, sr } = readWav(file);
    const h = listen(to16k(pcm, sr), 16000);
    const cl = h.line.map((n) => n.clear).sort((a, b) => a - b);
    console.log(
      `${basename(file).padEnd(14)} ${h.seconds.toFixed(1)}s · tune ${((h.tune ?? 0) * 100).toFixed(0)}c · ${h.line.length} notes (clear median ${(cl[cl.length >> 1] ?? 0).toFixed(1)}) · ${h.phrases.length} phrases` +
        (h.phrases[0] ? ` · best: ${h.phrases[0].notes.map(nm).join(' ')} @${h.phrases[0].from.toFixed(1)}s` : '') +
        `\n${''.padEnd(15)}line: ${h.line.slice(0, 18).map((n) => nm(n.midi)).join(' ')}`,
    );
  } catch (e) {
    console.log(basename(file), 'error', (e as Error).message);
  }
}
