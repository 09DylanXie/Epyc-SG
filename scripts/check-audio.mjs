// Decodes an exported file (MP3 or WAV) in headless Edge and reports what is actually in it.
//   node scripts/check-audio.mjs <file> [expectedSeconds]
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const [file, expect] = process.argv.slice(2);
const bytes = fs.readFileSync(file);
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage();
await page.goto('about:blank');
const r = await page.evaluate(async (b64) => {
  const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const ctx = new OfflineAudioContext(2, 44100, 44100);
  const buf = await ctx.decodeAudioData(bin.buffer);
  const L = buf.getChannelData(0);
  const R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L;
  let peak = 0;
  let sq = 0;
  let diff = 0;
  const win = Math.floor(buf.sampleRate * 0.5);
  const rmsPerHalfSecond = [];
  let acc = 0;
  for (let i = 0; i < L.length; i++) {
    const a = Math.abs(L[i]);
    const b = Math.abs(R[i]);
    if (a > peak) peak = a;
    if (b > peak) peak = b;
    sq += L[i] * L[i] + R[i] * R[i];
    acc += L[i] * L[i] + R[i] * R[i];
    diff += Math.abs(L[i] - R[i]);
    if ((i + 1) % win === 0) {
      rmsPerHalfSecond.push(Math.sqrt(acc / (2 * win)));
      acc = 0;
    }
  }
  const db = (x) => +(20 * Math.log10(Math.max(x, 1e-9))).toFixed(1);
  const quiet = rmsPerHalfSecond.filter((x) => x < 0.001).length;
  // longest run of near-silence anywhere but the very end
  let run = 0;
  let longest = 0;
  rmsPerHalfSecond.slice(0, -6).forEach((x) => {
    run = x < 0.001 ? run + 1 : 0;
    longest = Math.max(longest, run);
  });
  return {
    seconds: +buf.duration.toFixed(2),
    sampleRate: buf.sampleRate,
    channels: buf.numberOfChannels,
    peakDb: db(peak),
    rmsDb: db(Math.sqrt(sq / (2 * L.length))),
    stereo: diff / L.length > 1e-4,
    silentHalfSeconds: quiet,
    longestSilenceSec: longest / 2,
  };
}, bytes.toString('base64'));
await browser.close();
const problems = [];
if (expect && Math.abs(r.seconds - +expect) > 0.6) problems.push(`duration ${r.seconds}s, expected ${expect}s`);
if (r.peakDb > 0) problems.push('clips');
if (r.rmsDb < -30) problems.push('very quiet');
if (r.longestSilenceSec > 2.5) problems.push(`silent gap of ${r.longestSilenceSec}s`);
console.log(JSON.stringify({ file: file.split(/[\\/]/).pop(), bytes: bytes.length, ...r, problems }));
process.exit(problems.length ? 1 : 0);
