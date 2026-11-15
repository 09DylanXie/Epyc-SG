/// <reference lib="webworker" />
/**
 * Instrument samples and concert-hall impulses are synthesized here, off the main thread, so
 * the page never stalls while a piece is being prepared. Jobs are named by their cache key:
 *   p:<drum>            one-shot percussion
 *   k:<pluck>:<midi>    plucked string at a pitch
 *   b:<bell>:<midi>     bell / mallet at a pitch
 *   i:<sr>:<size>:<damp> hall impulse response
 */
import { renderBell, renderImpulse, renderPerc, renderPluck, type BellKind, type PluckKind } from './dsp';

export interface SampleJob {
  key: string;
  sr: number;
}
export interface SampleDone {
  key: string;
  chs: Float32Array<ArrayBuffer>[];
  rate?: number;
  error?: string;
}

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = (e: MessageEvent<SampleJob>) => {
  const { key, sr } = e.data;
  try {
    const part = key.split(':');
    let chs: Float32Array<ArrayBuffer>[];
    let rate: number | undefined;
    if (part[0] === 'p') chs = renderPerc(key.slice(2), sr);
    else if (part[0] === 'k') ({ chs, rate } = renderPluck(part[1] as PluckKind, +part[2], sr));
    else if (part[0] === 'b') chs = renderBell(part[1] as BellKind, +part[2], sr);
    else chs = renderImpulse(+part[1], +part[2], +part[3]);
    const done: SampleDone = { key, chs, rate };
    // channels may share one buffer (mono sources); a buffer can only be handed over once
    scope.postMessage(done, [...new Set(chs.map((c) => c.buffer))]);
  } catch (err) {
    const done: SampleDone = { key, chs: [], error: err instanceof Error ? err.message : String(err) };
    scope.postMessage(done);
  }
};
