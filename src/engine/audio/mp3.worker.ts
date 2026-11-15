/// <reference lib="webworker" />
/**
 * MP3 encoding off the main thread. Receives two Float32 channels, answers with progress
 * ticks and finally the encoded file. Encoder: lamejs (LGPL-3.0), used unmodified as a library.
 */
import { Mp3Encoder } from '@breezystack/lamejs';

export interface Mp3Request {
  left: Float32Array;
  right: Float32Array;
  sampleRate: number;
  kbps: number;
}
export type Mp3Reply = { type: 'progress'; value: number } | { type: 'done'; data: ArrayBuffer } | { type: 'error'; message: string };

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = (e: MessageEvent<Mp3Request>) => {
  try {
    const { left, right, sampleRate, kbps } = e.data;
    const enc = new Mp3Encoder(2, sampleRate, kbps);
    const BLOCK = 1152 * 24;
    const n = left.length;
    const l16 = new Int16Array(BLOCK);
    const r16 = new Int16Array(BLOCK);
    const parts: Uint8Array[] = [];
    let bytes = 0;
    // cheap deterministic TPDF dither so quiet reverb tails don't turn to grit at 16 bits
    let seed = 0x9e3779b9;
    const rnd = () => {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return (seed >>> 0) / 4294967296;
    };
    const q = (x: number) => {
      const v = x * 32767 + (rnd() - rnd());
      return v > 32767 ? 32767 : v < -32768 ? -32768 : Math.round(v);
    };
    let block = 0;
    for (let o = 0; o < n; o += BLOCK, block++) {
      const len = Math.min(BLOCK, n - o);
      for (let i = 0; i < len; i++) {
        l16[i] = q(left[o + i]);
        r16[i] = q(right[o + i]);
      }
      const out = enc.encodeBuffer(len === BLOCK ? l16 : l16.subarray(0, len), len === BLOCK ? r16 : r16.subarray(0, len));
      if (out.length) {
        const copy = new Uint8Array(out.length);
        copy.set(out);
        parts.push(copy);
        bytes += copy.length;
      }
      if (block % 6 === 0) scope.postMessage({ type: 'progress', value: o / n } satisfies Mp3Reply);
    }
    const tail = enc.flush();
    if (tail.length) {
      const copy = new Uint8Array(tail.length);
      copy.set(tail);
      parts.push(copy);
      bytes += copy.length;
    }
    const file = new Uint8Array(bytes);
    let at = 0;
    for (const p of parts) {
      file.set(p, at);
      at += p.length;
    }
    scope.postMessage({ type: 'done', data: file.buffer } satisfies Mp3Reply, [file.buffer]);
  } catch (err) {
    scope.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) } satisfies Mp3Reply);
  }
};
