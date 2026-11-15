// Builds the recorded-orchestra sample set from VSCO 2: Community Edition (CC0, Versilian Studios).
//   node scripts/build-samples.mjs <cacheDir>
// Downloads the chosen articulations once into <cacheDir>, then for every note:
//   detects the pitch it actually plays (file names are not reliable about octaves),
//   finds where the sound starts, trims, levels, resamples to 32 kHz and encodes a stereo MP3.
// Writes public/samples/<set>/<root>.mp3 and src/engine/audio/sampleMap.json.
import fs from 'node:fs';
import path from 'node:path';
import { Mp3Encoder } from '@breezystack/lamejs';

const REPO = 'sgossner/VSCO-2-CE';
const RAW = `https://raw.githubusercontent.com/${REPO}/master/`;
const OUT_SR = 32000;
const KBPS = 128;
const TARGET_RMS = 0.1; // −20 dBFS over the sustain
const [cacheDir = '.vsco-cache'] = process.argv.slice(2);

/** which recordings make up each set, and which dynamic layer to prefer for each note */
const SETS = {
  celloSec: { dir: 'Strings/Cello Section/susvib', prefer: ['v3', 'v1'], len: 5 },
  violaSec: { dir: 'Strings/Viola Section/susvib', prefer: ['v2', 'v1'], len: 5 },
  violinSec: { dir: 'Strings/Violin Section/susVib', prefer: ['v2', 'v1'], len: 5 },
  violinTrem: { dir: 'Strings/Violin Section/Trem', prefer: ['v2', 'v1'], len: 4 },
  celloTrem: { dir: 'Strings/Cello Section/trem', prefer: ['v2', 'v1'], len: 4 },
  violinSpic: { dir: 'Strings/Violin Section/Spic', prefer: ['v2', 'v1'], rr: /rr1/i, len: 0.9, short: true },
  celloSpic: { dir: 'Strings/Cello Section/spic', prefer: ['v2', 'v1'], rr: /rr1/i, len: 1.1, short: true },
  soloViolin: { dir: 'Strings/Solo Violin/Arco Vib', prefer: ['f', 'p'], len: 5 },
  horn: { dir: 'Brass/F Horn/sus', prefer: ['v3', 'v4', 'v2', 'v1'], len: 4.5 },
  trumpet: { dir: 'Brass/Trumpet/sus', prefer: ['v3', 'v1'], len: 4.5 },
  trombone: { dir: 'Brass/Tenor Trombone/sus', prefer: ['v3', 'v2', 'v1'], len: 4.5 },
  tuba: { dir: 'Brass/Tuba/sus', prefer: ['v3', 'v2', 'v1'], len: 4.5 },
  flute: { dir: 'Woodwinds/Flute/susvib', prefer: ['v1'], len: 4.5 },
};

const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const nameMidi = (tok) => {
  const m = /^([A-G])(#?)(-?\d)$/.exec(tok);
  return m ? 12 * (+m[3] + 1) + NOTE[m[1]] + (m[2] ? 1 : 0) : null;
};

// ───────────── fetch ─────────────
async function tree() {
  const f = path.join(cacheDir, 'tree.json');
  if (!fs.existsSync(f)) {
    const r = await fetch(`https://api.github.com/repos/${REPO}/git/trees/master?recursive=1`);
    if (!r.ok) throw new Error('tree ' + r.status);
    fs.writeFileSync(f, await r.text());
  }
  return JSON.parse(fs.readFileSync(f, 'utf8')).tree.filter((t) => t.type === 'blob');
}

async function download(rel) {
  const dest = path.join(cacheDir, 'wav', rel);
  if (fs.existsSync(dest)) return dest;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const url = RAW + rel.split('/').map(encodeURIComponent).join('/');
  for (let tries = 0; ; tries++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(r.status + ' ' + url);
      fs.writeFileSync(dest + '.part', Buffer.from(await r.arrayBuffer()));
      fs.renameSync(dest + '.part', dest);
      return dest;
    } catch (e) {
      if (tries >= 3) throw e;
      await new Promise((ok) => setTimeout(ok, 1500 * (tries + 1)));
    }
  }
}

// ───────────── wav ─────────────
function readWav(file) {
  const b = fs.readFileSync(file);
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') throw new Error('not wav ' + file);
  let p = 12;
  let fmt = null;
  let data = null;
  while (p + 8 <= b.length) {
    const id = b.toString('ascii', p, p + 4);
    const size = b.readUInt32LE(p + 4);
    if (id === 'fmt ') fmt = { tag: b.readUInt16LE(p + 8), ch: b.readUInt16LE(p + 10), sr: b.readUInt32LE(p + 12), bits: b.readUInt16LE(p + 22) };
    if (id === 'data') data = b.subarray(p + 8, Math.min(b.length, p + 8 + size));
    p += 8 + size + (size & 1);
  }
  if (!fmt || !data) throw new Error('bad wav ' + file);
  let tag = fmt.tag;
  if (tag === 0xfffe) tag = fmt.bits === 32 && data.length % 4 === 0 && fmt.bits === 32 ? 3 : 1; // extensible: assume PCM unless 32-bit float
  const bps = fmt.bits / 8;
  const n = Math.floor(data.length / (bps * fmt.ch));
  const chs = Array.from({ length: fmt.ch }, () => new Float32Array(n));
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < fmt.ch; c++) {
      const o = (i * fmt.ch + c) * bps;
      let v;
      if (tag === 3) v = bps === 4 ? data.readFloatLE(o) : data.readDoubleLE(o);
      else if (bps === 2) v = data.readInt16LE(o) / 32768;
      else if (bps === 3) v = data.readIntLE(o, 3) / 8388608;
      else if (bps === 4) v = data.readInt32LE(o) / 2147483648;
      else v = (data[o] - 128) / 128;
      chs[c][i] = v;
    }
  }
  if (chs.length === 1) chs.push(chs[0].slice());
  return { sr: fmt.sr, chs: chs.slice(0, 2) };
}

// ───────────── analysis ─────────────
function onsetOf(mono, sr) {
  let peak = 0;
  for (const x of mono) peak = Math.max(peak, Math.abs(x));
  const thr = peak * 0.03;
  const w = Math.floor(sr * 0.002);
  for (let i = 0; i < mono.length - w; i++) {
    if (Math.abs(mono[i]) > thr) return Math.max(0, i - Math.floor(sr * 0.008));
    void w;
  }
  return 0;
}

/** YIN fundamental estimate over one frame; returns [hz, aperiodicity] */
function yin(x, sr, start, W = 2048, fmin = 50, fmax = 1800) {
  const tmin = Math.floor(sr / fmax);
  const tmax = Math.min(Math.floor(sr / fmin), W - 1);
  const d = new Float32Array(tmax + 1);
  for (let tau = 1; tau <= tmax; tau++) {
    let s = 0;
    for (let i = 0; i < W; i++) {
      const v = x[start + i] - x[start + i + tau];
      s += v * v;
    }
    d[tau] = s;
  }
  let run = 0;
  const cm = new Float32Array(tmax + 1);
  cm[0] = 1;
  for (let tau = 1; tau <= tmax; tau++) {
    run += d[tau];
    cm[tau] = run ? (d[tau] * tau) / run : 1;
  }
  let best = -1;
  for (let tau = tmin; tau <= tmax; tau++) {
    if (cm[tau] < 0.15) {
      while (tau + 1 <= tmax && cm[tau + 1] < cm[tau]) tau++;
      best = tau;
      break;
    }
  }
  if (best < 0) {
    let mv = Infinity;
    for (let tau = tmin; tau <= tmax; tau++) {
      if (cm[tau] < mv) {
        mv = cm[tau];
        best = tau;
      }
    }
  }
  const a = cm[best - 1] ?? cm[best];
  const b = cm[best];
  const c = cm[best + 1] ?? cm[best];
  const shift = (a - c) / (2 * (a - 2 * b + c) || 1);
  return [sr / (best + (Number.isFinite(shift) ? shift : 0)), b];
}

function pitchOf(mono, sr, onset, short) {
  const ests = [];
  const from = onset + Math.floor(sr * (short ? 0.03 : 0.35));
  const to = onset + Math.floor(sr * (short ? 0.25 : 2.0));
  for (let s = from; s + 4096 < Math.min(to, mono.length); s += Math.floor(sr * (short ? 0.02 : 0.1))) {
    const [hz, ap] = yin(mono, sr, s);
    if (ap < 0.35 && hz > 40) ests.push(69 + 12 * Math.log2(hz / 440));
  }
  if (!ests.length) return null;
  ests.sort((p, q) => p - q);
  return ests[Math.floor(ests.length / 2)];
}

function rmsOf(mono, a, b) {
  let s = 0;
  for (let i = a; i < b; i++) s += mono[i] * mono[i];
  return Math.sqrt(s / Math.max(1, b - a));
}
function loudest(mono, sr, a, b, win = 0.05) {
  const w = Math.floor(sr * win);
  let acc = 0;
  let best = 0;
  for (let i = a; i < b; i++) {
    acc += mono[i] * mono[i];
    if (i - a >= w) acc -= mono[i - w] * mono[i - w];
    if (acc > best) best = acc;
  }
  return Math.sqrt(best / w);
}

// ───────────── resample (windowed sinc) ─────────────
function resample(x, srIn, srOut) {
  if (srIn === srOut) return x;
  const ratio = srIn / srOut;
  const n = Math.floor(x.length / ratio);
  const out = new Float32Array(n);
  const fc = (0.45 * srOut) / srIn;
  const H = 16;
  for (let i = 0; i < n; i++) {
    const pos = i * ratio;
    const k0 = Math.floor(pos);
    let s = 0;
    for (let k = k0 - H + 1; k <= k0 + H; k++) {
      if (k < 0 || k >= x.length) continue;
      const u = pos - k;
      const sinc = u === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * u) / (Math.PI * u);
      const w = 0.42 + 0.5 * Math.cos((Math.PI * u) / H) + 0.08 * Math.cos((2 * Math.PI * u) / H);
      s += x[k] * sinc * w;
    }
    out[i] = s;
  }
  return out;
}

function mp3(l, r, sr) {
  const enc = new Mp3Encoder(2, sr, KBPS);
  const toI = (f) => {
    const o = new Int16Array(f.length);
    for (let i = 0; i < f.length; i++) o[i] = Math.max(-32767, Math.min(32767, Math.round(f[i] * 32767)));
    return o;
  };
  const L = toI(l);
  const R = toI(r);
  const parts = [];
  for (let i = 0; i < L.length; i += 1152) {
    const b = enc.encodeBuffer(L.subarray(i, i + 1152), R.subarray(i, i + 1152));
    if (b.length) parts.push(Buffer.from(b));
  }
  const e = enc.flush();
  if (e.length) parts.push(Buffer.from(e));
  return Buffer.concat(parts);
}

// ───────────── main ─────────────
fs.mkdirSync(cacheDir, { recursive: true });
const files = await tree();
const map = { source: 'VSCO 2: Community Edition — Versilian Studios / Sam Gossner, Simon Dalzell (CC0 1.0)', sr: OUT_SR, sets: {} };
const report = [];
let problems = 0;

for (const [set, spec] of Object.entries(SETS)) {
  const inDir = files.filter((f) => f.path.startsWith(spec.dir + '/') && /\.wav$/i.test(f.path));
  const byNote = new Map();
  for (const f of inDir) {
    const base = path.basename(f.path);
    const tok = /_([A-G]#?-?\d)_/.exec(base)?.[1];
    if (!tok) continue;
    if (spec.rr && !spec.rr.test(base)) continue;
    const layer = spec.prefer.findIndex((v) => new RegExp(`_${v}(_|\\.|$)`, 'i').test(base));
    if (layer < 0) continue;
    const cur = byNote.get(tok);
    if (!cur || layer < cur.layer || (layer === cur.layer && base < cur.base)) byNote.set(tok, { tok, base, layer, path: f.path });
  }
  const picks = [...byNote.values()];
  // download
  let next = 0;
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      while (next < picks.length) {
        const p = picks[next++];
        p.local = await download(p.path);
      }
    }),
  );
  const outDir = path.join('public', 'samples', set);
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const rows = [];
  const seen = [];
  for (const p of picks) {
    const { sr, chs } = readWav(p.local);
    const mono = new Float32Array(chs[0].length);
    for (let i = 0; i < mono.length; i++) mono[i] = (chs[0][i] + chs[1][i]) / 2;
    const on = onsetOf(mono, sr);
    const pm = pitchOf(mono, sr, on, spec.short);
    const named = nameMidi(p.tok);
    seen.push({ p, pm, named, off: pm == null || named == null ? null : Math.round(pm) - named });
  }
  const tally = {};
  for (const x of seen) if (x.off != null) tally[x.off] = (tally[x.off] ?? 0) + 1;
  const usual = +Object.entries(tally).sort((a, b) => b[1] - a[1])[0][0];
  for (const x of seen) {
    if (x.off !== usual) {
      report.push(`${set} ${x.p.base}: plays ${x.pm?.toFixed(2)} but the folder runs ${usual >= 0 ? "+" : ""}${usual} from its names — dropped`);
      x.p.drop = true;
    }
  }
  for (const p of picks) {
    if (p.drop) continue;
    const { sr, chs } = readWav(p.local);
    const mono = new Float32Array(chs[0].length);
    for (let i = 0; i < mono.length; i++) mono[i] = (chs[0][i] + chs[1][i]) / 2;
    const on = onsetOf(mono, sr);
    const pm = pitchOf(mono, sr, on, spec.short);
    const named = nameMidi(p.tok);
    if (pm == null) {
      report.push(`${set} ${p.base}: no pitch found — skipped`);
      problems++;
      continue;
    }
    const root = Math.round(pm);
    const cents = Math.round((pm - root) * 100);
    const off = named == null ? null : root - named;
    // trim, level, fade, resample
    const len = Math.min(mono.length - on, Math.floor(sr * spec.len));
    const lv = spec.short ? loudest(mono, sr, on, on + len) : rmsOf(mono, on + Math.floor(sr * 0.3), on + Math.min(len, Math.floor(sr * 1.6)));
    let peak = 0;
    for (let i = on; i < on + len; i++) peak = Math.max(peak, Math.abs(chs[0][i]), Math.abs(chs[1][i]));
    const want = TARGET_RMS / Math.max(lv, 1e-6);
    const gain = Math.min(want, 0.9 / Math.max(peak, 1e-6));
    const resid = want / gain; // the player applies the rest
    const fade = Math.floor(sr * (spec.short ? 0.05 : 0.3));
    const cut = chs.map((c) => {
      const o = new Float32Array(len);
      for (let i = 0; i < len; i++) {
        const t = len - i;
        o[i] = c[on + i] * gain * (t < fade ? t / fade : 1);
      }
      return resample(o, sr, OUT_SR);
    });
    const buf = mp3(cut[0], cut[1], OUT_SR);
    fs.writeFileSync(path.join(outDir, `${root}.mp3`), buf);
    rows.push([root, cents, +resid.toFixed(3)]);
    report.push(`${set.padEnd(11)} ${p.base.padEnd(36)} name ${String(named).padStart(3)} → plays ${pm.toFixed(2).padStart(6)} (${off >= 0 ? '+' : ''}${off}) rms ${(20 * Math.log10(lv)).toFixed(1)} dB  ${(len / sr).toFixed(1)}s  ${(buf.length / 1024).toFixed(0)} KB${resid > 1.05 ? `  +${(20 * Math.log10(resid)).toFixed(1)}dB at play` : ''}`);
  }
  rows.sort((a, b) => a[0] - b[0]);
  // two recordings landing on the same note: keep the first
  map.sets[set] = rows.filter((r, i) => i === 0 || r[0] !== rows[i - 1][0]);
  const offs = new Set(report.filter((l) => l.startsWith(set + ' ') || l.startsWith(set.padEnd(11))).map((l) => /\(([+-]?\d+)\)/.exec(l)?.[1]));
  report.push(`${set}: ${map.sets[set].length} notes, ${map.sets[set][0]?.[0]}–${map.sets[set].at(-1)?.[0]}, name→pitch offsets ${[...offs].join(',')}`);
}

fs.writeFileSync('src/engine/audio/sampleMap.json', JSON.stringify(map));
fs.writeFileSync(
  path.join('public', 'samples', 'CREDITS.txt'),
  `Orchestral samples: VSCO 2: Community Edition by Versilian Studios (Sam Gossner) and Ivy Audio (Simon Dalzell).
https://vis.versilstudios.net/vsco-community.html
Released under CC0 1.0 Universal (public domain dedication): usable for any purpose, including commercial music.
These files are trimmed, levelled and re-encoded excerpts made for Epyc SG.
`,
);
console.log(report.join('\n'));
console.log(problems ? `${problems} problems` : 'done');
