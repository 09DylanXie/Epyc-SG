'use client';

import { PART_TAIL } from '@/engine/audio/render';
import { STYLES } from '@/engine/styles';
import { Check, Close } from './icons';
import { useStudio } from './store';
import { clock } from './util';

const mb = (bytes: number) => (bytes / 1048576).toFixed(1) + ' MB';

/** renders the piece offline, faster than real time, and hands it over as a file */
export default function ExportDialog() {
  const exp = useStudio((s) => s.exp);
  const origin = useStudio((s) => s.score?.origin ?? null);
  const score = useStudio((s) => s.score);
  const style = useStudio((s) => STYLES[s.styleId]);
  const { openExport, download } = useStudio.getState();
  if (!exp.open || !score) return null;
  const part = exp.part;
  const spb = 60 / score.bpm;
  const secs = part ? (part.to - part.from) * spb + PART_TAIL : score.durationSec;

  return (
    <div className="scrim" onPointerDown={(e) => e.target === e.currentTarget && openExport(false)}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label="Download your piece">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="eyebrow" style={{ color: 'var(--a1)' }}>
              Take it with you
            </div>
            <h2 className="mt-2 font-display text-[26px] font-semibold leading-tight">{score.title}</h2>
            <div className="mt-1 text-[12.5px] text-dim">
              {style.name} · {score.keyName} · {score.bpm} BPM · {clock(secs)}
            </div>
            {part && (
              <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[11.5px] font-semibold" data-testid="dl-part">
                Just one part: {part.name} · {clock(part.from * spb)}–{clock(part.to * spb)}
              </div>
            )}
          </div>
          <button className="tbtn flex-none" onClick={() => openExport(false)} disabled={exp.busy} aria-label="Close">
            <Close size={18} />
          </button>
        </div>

        <div className="mt-6 flex gap-3">
          <button className="fmt" onClick={() => void download('mp3')} disabled={exp.busy} data-testid="dl-mp3">
            <div className="text-[15px] font-extrabold">MP3</div>
            <div className="mt-0.5 text-[12px] text-dim">256 kbps stereo · about {mb((secs * 256000) / 8)}</div>
            <div className="mt-2 text-[11px] text-faint">Plays everywhere. Best for sharing.</div>
          </button>
          <button className="fmt" onClick={() => void download('wav')} disabled={exp.busy} data-testid="dl-wav">
            <div className="text-[15px] font-extrabold">WAV</div>
            <div className="mt-0.5 text-[12px] text-dim">16-bit 44.1 kHz · about {mb(secs * 44100 * 4)}</div>
            <div className="mt-2 text-[11px] text-faint">Lossless. Best for editing in a DAW or video tool.</div>
          </button>
        </div>

        <div className="mt-5 min-h-[46px]">
          {exp.busy && (
            <div data-testid="dl-progress">
              <div className="mb-2 flex justify-between text-[12px] font-semibold">
                <span>{exp.label}…</span>
                <span className="font-mono text-dim">{Math.round(exp.p * 100)}%</span>
              </div>
              <div className="progress">
                <i style={{ width: `${exp.p * 100}%` }} />
              </div>
            </div>
          )}
          {exp.done && (
            <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3" data-testid="dl-done">
              <span className="grid h-7 w-7 flex-none place-items-center rounded-full" style={{ background: 'var(--a1)', color: '#0a0806' }}>
                <Check size={15} />
              </span>
              <div className="min-w-0">
                <div className="truncate text-[13px] font-bold">{exp.done.name}</div>
                <div className="text-[11.5px] text-dim">
                  Saved to your downloads · {mb(exp.done.bytes)} · {clock(exp.done.seconds)}
                </div>
              </div>
            </div>
          )}
          {exp.error && <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-[12.5px] text-red-200">Export failed: {exp.error}</div>}
          {!exp.busy && !exp.done && !exp.error && (
            <p className="text-[12px] leading-relaxed text-faint">{part ? 'This part' : 'The whole piece'} is performed again offline — in a few seconds, with your current mixer settings — then encoded on your device. Nothing is uploaded.</p>
          )}
        </div>

        <div className="mt-5 border-t border-white/[0.08] pt-4 text-[11.5px] leading-relaxed text-dim">
          {score.song ? (
            <>
              <b className="text-ink">This file contains your recording.</b> <b className="text-dim">{score.song.name}</b> plays in it exactly as you imported it, with the new layer under it. Only release it if you have the rights to that recording.{' '}
            </>
          ) : origin && !origin.own ? (
            <>
              <b className="text-ink">Check the melody first.</b> The tune of this piece was taken from <b className="text-dim">{origin.name}</b>. If you don&apos;t own that melody, make sure you have the rights to use it before releasing this. Everything around it was written new.{' '}
            </>
          ) : (
            <>
              <b className="text-ink">Yours to use.</b> The composition is generated from the notes you played.{' '}
            </>
          )}
          The strings, brass and flute are real recordings from{' '}
          <a className="underline decoration-white/30 underline-offset-2 hover:text-ink" href="/samples/CREDITS.txt" target="_blank" rel="noreferrer">
            VSCO 2 Community Edition
          </a>
          , released into the public domain (CC0); everything else is synthesized in your browser. No loops, no licensed tracks.{origin && !origin.own ? '' : ' Use it in your games, films, streams and commercial projects.'}
        </div>
      </div>
    </div>
  );
}
