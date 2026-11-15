import { encodeWav } from './dsp';
import type { Mp3Reply, Mp3Request } from './mp3.worker';

/** Encodes two channels to an MP3 blob inside a Web Worker. */
export function encodeMp3(left: Float32Array, right: Float32Array, sampleRate: number, kbps: number, onProgress?: (p: number) => void): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./mp3.worker.ts', import.meta.url), { type: 'module' });
    const finish = () => worker.terminate();
    worker.onmessage = (e: MessageEvent<Mp3Reply>) => {
      const m = e.data;
      if (m.type === 'progress') onProgress?.(m.value);
      else if (m.type === 'done') {
        finish();
        resolve(new Blob([m.data], { type: 'audio/mpeg' }));
      } else {
        finish();
        reject(new Error(m.message));
      }
    };
    worker.onerror = (e) => {
      finish();
      reject(new Error(e.message || 'MP3 encoder failed to start'));
    };
    // copies, so the caller keeps its buffers
    const l = left.slice();
    const r = right.slice();
    const req: Mp3Request = { left: l, right: r, sampleRate, kbps };
    worker.postMessage(req, [l.buffer, r.buffer]);
  });
}

export function wavBlob(left: Float32Array, right: Float32Array, sampleRate: number): Blob {
  return new Blob([encodeWav(left, right, sampleRate)], { type: 'audio/wav' });
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
