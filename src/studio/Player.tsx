'use client';

import { useEffect, useRef, type CSSProperties, type PointerEvent as RPointerEvent } from 'react';
import { player } from '@/engine/audio/player';
import { Dice, Download, Loop, Next, Pause, Play, Prev, Volume } from './icons';
import { onFrame } from './loop';
import { useStudio } from './store';
import { clock } from './util';

/** one line for the whole piece, cut where each movement begins */
function Seek() {
  const score = useStudio((s) => s.score);
  const wrap = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  const now = useRef<HTMLSpanElement>(null);
  const drag = useRef<number | null>(null);

  useEffect(() => {
    let shown = '';
    return onFrame(() => {
      const end = player.endBeat || 1;
      const f = drag.current ?? (score ? Math.min(1, player.position / end) : 0);
      if (bar.current) bar.current.style.transform = `scaleX(${f.toFixed(4)})`;
      if (knob.current && wrap.current) knob.current.style.transform = `translateX(${(f * wrap.current.clientWidth).toFixed(1)}px)`;
      const label = clock(score ? f * score.durationSec : 0);
      if (label !== shown && now.current) {
        shown = label;
        now.current.textContent = label;
      }
    });
  }, [score]);

  const frac = (e: RPointerEvent) => {
    const b = wrap.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - b.left) / b.width));
  };
  const total = score ? player.endBeat || score.totalBeats : 1;
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2.5">
      <span ref={now} className="w-8 flex-none text-right font-mono text-[11px] text-dim">
        0:00
      </span>
      <div
        className="seek"
        ref={wrap}
        role="slider"
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={0}
        data-testid="seek"
        onPointerDown={(e) => {
          if (!score) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = frac(e);
        }}
        onPointerMove={(e) => {
          if (drag.current !== null) drag.current = frac(e);
        }}
        onPointerUp={(e) => {
          if (drag.current === null) return;
          const f = frac(e);
          drag.current = null;
          useStudio.getState().seek(f * player.endBeat);
        }}
        onPointerCancel={() => (drag.current = null)}
      >
        <div className="track">
          <div className="bar" ref={bar} />
        </div>
        {score?.sections.slice(1).map((s, i) => (
          <div key={i} className="mark" data-mark={i + 1} style={{ left: `${(s.startBeat / total) * 100}%` }} />
        ))}
        <div className="knob" ref={knob} />
      </div>
      <span className="w-8 flex-none font-mono text-[11px] text-dim">{clock(score?.durationSec ?? 0)}</span>
    </div>
  );
}

/** the player: a slim bar under the stage with the transport, the piece's timeline and the export */
export default function Player() {
  const hasScore = useStudio((s) => !!s.score);
  const playing = useStudio((s) => s.playing);
  const loop = useStudio((s) => s.loop);
  const volume = useStudio((s) => s.volume);
  const busy = useStudio((s) => s.phase === 'forging');
  const { toggle, jump, setLoop, setVolume, forge, openExport } = useStudio.getState();
  const lastVol = useRef(0.9);

  return (
    <div className="player glass" role="group" aria-label="Player">
      <div className="flex flex-none items-center gap-1">
        <button className="tbtn" onClick={() => jump(-1)} disabled={!hasScore} title="Previous part" aria-label="Previous part">
          <Prev size={17} />
        </button>
        <button className="play" onClick={toggle} disabled={busy} aria-label={playing ? 'Pause' : 'Play'} data-testid="play" title="Play / pause (Space)">
          {playing ? <Pause size={17} /> : <Play size={17} />}
        </button>
        <button className="tbtn" onClick={() => jump(1)} disabled={!hasScore} title="Next part" aria-label="Next part">
          <Next size={17} />
        </button>
      </div>

      <Seek />

      <div className="flex flex-none items-center gap-1">
        <button className={`tbtn ${loop ? 'on' : ''}`} onClick={() => setLoop(!loop)} aria-pressed={loop} title="Loop the piece" aria-label="Loop">
          <Loop size={15} />
        </button>
        <button className="tbtn hide-xs" onClick={() => void forge()} disabled={busy || !hasScore} title="New variation of the same notes" aria-label="New variation">
          <Dice size={16} />
        </button>
        <span className="hide-xs flex items-center gap-1.5 pr-1">
          <button
            className="tbtn"
            onClick={() => {
              if (volume > 0.02) {
                lastVol.current = volume;
                setVolume(0);
              } else setVolume(lastVol.current);
            }}
            aria-label={volume > 0.02 ? 'Mute' : 'Unmute'}
          >
            <Volume size={17} level={volume} />
          </button>
          <input
            className="range !w-[76px]"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            aria-label="Volume"
            style={{ '--v': `${volume * 100}%` } as CSSProperties}
            onChange={(e) => setVolume(+e.target.value)}
          />
        </span>
      </div>

      <button className="cta" onClick={() => openExport(true)} disabled={!hasScore || busy} data-testid="download" title="Download this piece as MP3 or WAV">
        <Download size={15} />
        Export MP3
      </button>
    </div>
  );
}
