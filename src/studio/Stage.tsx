'use client';

import { useEffect, useState } from 'react';
import { player } from '@/engine/audio/player';
import { STYLES } from '@/engine/styles';
import type { Score, Section, SectionKind } from '@/engine/types';
import { Film, Shrink } from './icons';
import { onFrame } from './loop';
import { useStudio } from './store';

const KIND: Record<SectionKind, string> = {
  intro: 'Opening',
  theme: 'Theme',
  build: 'Build',
  climax: 'Climax',
  break: 'Stillness',
  finale: 'Finale',
  outro: 'Closing',
};

function Hero() {
  const genre = useStudio((s) => STYLES[s.styleId].genre.toLowerCase());
  return (
    <div className="narrate">
      <div className="eyebrow" style={{ color: 'var(--a1)' }}>
        Your personal composer
      </div>
      <h1 className="title hero mt-2">
        Play a few notes.
        <br />
        Get a whole score.
      </h1>
      <p className="mt-2.5 max-w-[52ch] text-[13.5px] leading-relaxed text-dim">
        Tap the pads or use your keyboard — every pad is already in key, so nothing you play can be wrong. Epyc SG grows your idea into a theme and performs it as a full {genre} piece.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11.5px] font-semibold text-faint">
        <span className="flex items-center gap-1.5">
          <span className="kbd">A</span>
          <span className="kbd">S</span>
          <span className="kbd">D</span>
          <span className="kbd">F</span> play
        </span>
        <span className="flex items-center gap-1.5">
          <span className="kbd">Enter</span> forge
        </span>
        <span className="flex items-center gap-1.5">
          <span className="kbd">Space</span> play / pause
        </span>
      </div>
    </div>
  );
}

function Forging() {
  const steps = useStudio((s) => s.steps);
  const at = useStudio((s) => Math.min(s.stepAt, s.steps.length - 1));
  const loadP = useStudio((s) => s.loadP);
  const pending = useStudio((s) => s.pending);
  const line = useStudio((s) => s.forgeLine);
  if (!steps.length || !pending) return null;
  const last = at === steps.length - 1;
  const first = pending.sections[0];
  // Laid out exactly like NowPlaying, with the opening movement's own text held invisibly underneath,
  // so the title is already where it will be when the music starts.
  return (
    <div>
      <div className="eyebrow" style={{ color: 'var(--a1)' }}>
        Forging your score
      </div>
      <h1 className="title narrate quick mt-2" key={pending.title}>
        {pending.title}
      </h1>
      <div className="grid">
        <div className="invisible col-start-1 row-start-1" aria-hidden>
          <p className="mt-3 min-h-[3.25em] max-w-[58ch] text-[14px] leading-relaxed">{first.say[0]}</p>
          <div className="voices mt-2 flex flex-wrap gap-1.5">
            {first.voices.map((v) => (
              <span className="voice" key={v}>
                {v}
              </span>
            ))}
          </div>
        </div>
        <div className="col-start-1 row-start-1">
          <p className="mt-3 line-clamp-2 max-w-[58ch] text-[14px] leading-relaxed text-ink/85">{line}</p>
          <div className="voices steps mt-2 flex gap-1.5">
            {steps.map((s, i) => (
              <span className={`voice step ${i < at ? 'done' : i === at ? 'on' : ''}`} key={s.label} title={s.detail}>
                {s.label}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="progress forge-bar">
        <i style={{ width: `${((at + (last ? loadP : 1)) / steps.length) * 100}%` }} />
      </div>
    </div>
  );
}

/** what the orchestra is doing right now, one sentence at a time as the movement unfolds */
function Narration({ sec }: { sec: Section }) {
  const [line, setLine] = useState(0);
  useEffect(() => {
    const n = sec.say.length;
    if (n < 2) return;
    return onFrame(() => {
      const p = (player.position - sec.startBeat) / sec.beats;
      const k = Math.max(0, Math.min(n - 1, Math.floor(p * n)));
      setLine((cur) => (cur === k ? cur : k));
    });
  }, [sec]);
  return (
    <p className="narrate mt-3 min-h-[3.25em] max-w-[58ch] text-[14px] leading-relaxed text-ink/85" key={line}>
      {sec.say[Math.min(line, sec.say.length - 1)]}
    </p>
  );
}

function NowPlaying({ score }: { score: Score }) {
  const idx = useStudio((s) => Math.min(s.sectionIdx, score.sections.length - 1));
  const sec = score.sections[idx];
  return (
    <div>
      <div className="eyebrow narrate" style={{ color: 'var(--a1)' }} key={idx}>
        {KIND[sec.kind]} · {sec.name} · bars {sec.startBar + 1}–{sec.startBar + sec.bars}
      </div>
      <h1 className="title mt-2" data-testid="title">
        {score.title}
      </h1>
      <Narration sec={sec} key={`${score.title}:${idx}`} />
      <div className="voices mt-2 flex flex-wrap gap-1.5">
        {sec.voices.map((v, i) => (
          <span className="voice" key={`${idx}:${v}`} style={{ animationDelay: `${i * 50}ms` }}>
            {v}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function Stage() {
  const score = useStudio((s) => s.score);
  const phase = useStudio((s) => s.phase);
  const style = useStudio((s) => STYLES[s.styleId]);
  const cinema = useStudio((s) => s.cinema);
  const setCinema = useStudio((s) => s.setCinema);
  const pending = useStudio((s) => s.pending);
  const playingKey = useStudio((s) => (s.score ? s.score.sections[Math.min(s.sectionIdx, s.score.sections.length - 1)].keyName : null));
  // while forging, the stage already belongs to the piece that is about to play
  const forging = phase === 'forging' && !!pending;
  const shown = forging ? pending : phase === 'forging' ? null : score;
  const keyName = forging ? pending.sections[0].keyName : playingKey;

  return (
    <section className="stage">
      <header className="flex h-9 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 overflow-hidden">
          <span className="chip">
            <span className="h-2 w-2 rounded-full" style={{ background: 'var(--a1)', boxShadow: '0 0 10px var(--a1)' }} />
            <b>{style.name}</b>
            {style.genre}
          </span>
          {shown && (
            <>
              <span className="chip">
                Key <b>{keyName}</b>
              </span>
              <span className="chip">
                <b>{shown.bpm}</b> BPM
              </span>
              <span className="chip">
                <b>{shown.meter.label}</b>
              </span>
            </>
          )}
        </div>
        <button className={`btn ${cinema ? 'on' : ''}`} onClick={() => setCinema(!cinema)} title={cinema ? 'Back to the studio (Esc)' : 'Immerse: hide everything but the sky and the player'}>
          {cinema ? <Shrink size={15} /> : <Film size={15} />}
          {cinema ? 'Exit' : 'Immerse'}
        </button>
      </header>
      <div className="stage-body">
        <div id="eclipse" className="eclipse" />
        <div className="billing">{phase === 'forging' ? <Forging /> : score ? <NowPlaying score={score} /> : <Hero />}</div>
      </div>
    </section>
  );
}
