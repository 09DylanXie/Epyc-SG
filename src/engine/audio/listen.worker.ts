/// <reference lib="webworker" />
/** Melody extraction off the main thread: mono PCM in, progress ticks, then the phrases it heard. */
import { listen, type Heard } from '../listen';

export interface ListenRequest {
  pcm: Float32Array;
  sampleRate: number;
}
export type ListenReply = { type: 'progress'; value: number } | { type: 'done'; heard: Heard } | { type: 'error'; message: string };

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = (e: MessageEvent<ListenRequest>) => {
  try {
    const heard = listen(e.data.pcm, e.data.sampleRate, (value) => scope.postMessage({ type: 'progress', value } satisfies ListenReply));
    scope.postMessage({ type: 'done', heard } satisfies ListenReply);
  } catch (err) {
    scope.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) } satisfies ListenReply);
  }
};
