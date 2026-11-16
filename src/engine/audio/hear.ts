import { MAX_SECONDS, type Heard } from '../listen';
import type { ListenReply, ListenRequest } from './listen.worker';

/** pitch tracking does not need more than this, and it keeps a five-minute song quick */
const SR = 16000;
export const MAX_FILE_MB = 80;

/**
 * Decodes an audio file on this device (nothing is uploaded) and listens for its melody in a
 * worker. Also returns the recording itself at full quality, for Amplify to play. Rejects with a
 * sentence a person can act on.
 */
export async function hearFile(file: File, onProgress?: (p: number, label: string) => void): Promise<{ heard: Heard; audio: AudioBuffer }> {
  if (file.size > MAX_FILE_MB * 1024 * 1024) throw new Error(`That file is over ${MAX_FILE_MB} MB — try a shorter clip.`);
  onProgress?.(0.02, 'Reading the file');
  const bytes = await file.arrayBuffer();
  onProgress?.(0.06, 'Decoding');
  let audio: AudioBuffer;
  let full: AudioBuffer;
  try {
    // decoding detaches the bytes, so the full-quality copy decodes from its own copy of them
    full = await new OfflineAudioContext(2, 1, 44100).decodeAudioData(bytes.slice(0));
    // decoding into a 16 kHz context resamples on the way in
    audio = await new OfflineAudioContext(1, 1, SR).decodeAudioData(bytes);
  } catch {
    throw new Error('That file could not be decoded — try an MP3, WAV, M4A or OGG.');
  }
  const n = Math.min(audio.length, Math.floor(MAX_SECONDS * audio.sampleRate));
  // mid channel: a sung or lead melody is almost always in the centre of the mix
  const pcm = new Float32Array(n);
  for (let c = 0; c < audio.numberOfChannels; c++) {
    const d = audio.getChannelData(c);
    for (let i = 0; i < n; i++) pcm[i] += d[i] / audio.numberOfChannels;
  }
  onProgress?.(0.12, 'Listening for the melody');
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./listen.worker.ts', import.meta.url), { type: 'module' });
    const finish = () => worker.terminate();
    worker.onmessage = (e: MessageEvent<ListenReply>) => {
      const m = e.data;
      if (m.type === 'progress') onProgress?.(0.12 + 0.86 * m.value, 'Listening for the melody');
      else if (m.type === 'done') {
        finish();
        resolve({ heard: m.heard, audio: full });
      } else {
        finish();
        reject(new Error(m.message));
      }
    };
    worker.onerror = (e) => {
      finish();
      reject(new Error(e.message || 'The listener failed to start'));
    };
    const req: ListenRequest = { pcm, sampleRate: audio.sampleRate };
    worker.postMessage(req, [pcm.buffer]);
  });
}
