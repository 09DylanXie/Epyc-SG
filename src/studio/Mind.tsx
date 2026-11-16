'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { player } from '@/engine/audio/player';
import { BUSES, BUS_LABEL, type Bus, type DnaStrand, type Score } from '@/engine/types';
import { onFrame } from './loop';
import { useStudio } from './store';

/** a phrase drawn the way it sounds: left to right in time, higher notes higher up */
function Contour({ strand, lo, hi, strong }: { strand: DnaStrand; lo: number; hi: number; strong: boolean }) {
  const W = 220;
  const H = 40;
  const y = (deg: number) => 5 + (1 - (deg - lo) / Math.max(1, hi - lo)) * (H - 12);
  const pts = strand.notes.map((n) => ({ x: (n.pos / strand.span) * W, w: Math.max(4, (n.len / strand.span) * W - 3), y: y(n.deg) }));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-10 w-full" preserveAspectRatio="none" aria-hidden>
      {pts.slice(1).map((p, i) => (
        <line key={'l' + i} x1={pts[i].x + pts[i].w} y1={pts[i].y + 2} x2={p.x} y2={p.y + 2} stroke="var(--a1)" strokeOpacity={strong ? 0.5 : 0.25} strokeWidth="1" vectorEffect="non-scaling-stroke" />
      ))}
      {pts.map((p, i) => (
        <rect key={i} x={p.x} y={p.y} width={p.w} height={4} rx={2} fill={strong ? 'var(--a1)' : 'color-mix(in srgb, var(--a1) 60%, var(--a2))'} fillOpacity={strong ? 1 : 0.75} />
      ))}
    </svg>
  );
}

function Dna({ score }: { score: Score }) {
  const [lo, hi] = useMemo(() => {
    const all = score.dna.flatMap((s) => s.notes.map((n) => n.deg));
    return all.length ? [Math.min(...all), Math.max(...all)] : [0, 1];
  }, [score]);
  return (
    <div className="card overflow-hidden">
      {score.dna.map((s, i) => (
        <div key={s.label} className={`grid grid-cols-[92px_minmax(0,1fr)] items-center gap-2 px-3.5 py-2 ${i ? 'border-t border-white/[0.06]' : ''}`}>
          <div className="min-w-0">
            <div className={`truncate text-[12px] font-bold ${i === 0 ? 'text-a1' : ''}`}>{s.label}</div>
            <div className="text-[10.5px] leading-tight text-faint">{s.hint}</div>
          </div>
          <Contour strand={s} lo={lo} hi={hi} strong={i === 0} />
        </div>
      ))}
    </div>
  );
}

function Harmony({ score }: { score: Score }) {
  const sectionIdx = useStudio((s) => Math.min(s.sectionIdx, score.sections.length - 1));
  const chordIdx = useStudio((s) => s.chordIdx);
  const sec = score.sections[sectionIdx];
  const chords = useMemo(
    () => score.chords.map((c, i) => ({ ...c, i })).filter((c) => c.beat >= sec.startBeat - 1e-6 && c.beat < sec.startBeat + sec.beats - 1e-6),
    [score, sec],
  );
  return (
    <div className="card p-3.5">
      <div className="flex items-baseline justify-between gap-3">
        <div className="font-display text-[15px] font-semibold tracking-wide">{score.progression}</div>
        <div className="flex-none font-mono text-[10.5px] text-faint">{sec.keyName}</div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {chords.map((c) => (
          <div key={c.i} className={`chord ${c.i === chordIdx ? 'on' : ''}`}>
            <b>{c.name}</b>
            <i>{c.roman}</i>
          </div>
        ))}
      </div>
    </div>
  );
}

function Empty() {
  const steps: [string, string][] = [
    ['It listens', 'Your notes are weighed against ten scales in all twelve keys to find the one they already belong to.'],
    ['It develops', 'Your motif becomes a four-phrase theme: stated, answered, returned, then turned upside-down to fall home.'],
    ['It harmonises', 'Dozens of chord progressions are auditioned and the one that supports your strongest notes wins.'],
    ['It orchestrates', 'Movements, key lifts, risers, drops and a finale are laid out and performed by recorded strings and brass with a synthesized ensemble around them.'],
  ];
  return (
    <div className="px-1">
      <p className="text-[12.5px] leading-relaxed text-dim">Once you forge a piece, this panel shows exactly how your notes became it — live, as it plays.</p>
      <ol className="mt-4 space-y-3">
        {steps.map(([t, b], i) => (
          <li key={t} className="card flex gap-3 p-3.5">
            <span className="mt-0.5 grid h-6 w-6 flex-none place-items-center rounded-full border border-white/15 font-mono text-[11px] font-bold text-a1">{i + 1}</span>
            <span>
              <span className="block text-[13px] font-bold">{t}</span>
              <span className="mt-0.5 block text-[12px] leading-relaxed text-dim">{b}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Mixer() {
  const levels = useStudio((s) => s.levels);
  const mutes = useStudio((s) => s.mutes);
  const { setLevel, toggleMute } = useStudio.getState();
  const bars = useRef<Partial<Record<Bus, HTMLElement | null>>>({});
  useEffect(() => {
    const smooth: Partial<Record<Bus, number>> = {};
    return onFrame(() => {
      for (const b of BUSES) {
        const el = bars.current[b];
        if (!el) continue;
        const rms = player.meter(b);
        const v = rms > 1e-5 ? Math.max(0, Math.min(1, (20 * Math.log10(rms) + 58) / 50)) : 0;
        const prev = smooth[b] ?? 0;
        const next = v > prev ? v : prev * 0.9;
        smooth[b] = next;
        el.style.transform = `scaleX(${next.toFixed(3)})`;
      }
    });
  }, []);
  return (
    <div className="card divide-y divide-white/[0.06]">
      {BUSES.map((b) => (
        <div key={b} className="px-3.5 py-2.5">
          <div className="flex items-center gap-2.5">
            <button className={`mute ${mutes[b] ? 'on' : ''}`} onClick={() => toggleMute(b)} aria-pressed={mutes[b]} aria-label={`Mute ${BUS_LABEL[b]}`} title={mutes[b] ? 'Unmute' : 'Mute'}>
              M
            </button>
            <span className={`w-[88px] flex-none truncate text-[12px] font-bold ${mutes[b] ? 'text-faint line-through' : ''}`}>{BUS_LABEL[b]}</span>
            <input
              className="range"
              type="range"
              min={0}
              max={1.5}
              step={0.01}
              value={levels[b]}
              aria-label={`${BUS_LABEL[b]} level`}
              style={{ '--v': `${(levels[b] / 1.5) * 100}%` } as CSSProperties}
              onChange={(e) => setLevel(b, +e.target.value)}
              onDoubleClick={() => setLevel(b, 1)}
            />
          </div>
          <div className="meter mt-1.5">
            <i ref={(el) => void (bars.current[b] = el)} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** the conversation about an imported song: which part of it the melody should come from */
function Talk() {
  const chat = useStudio((s) => s.chat);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [chat.length]);
  return (
    <section data-testid="talk">
      <div className="eyebrow mb-2 px-1">Talk to the composer</div>
      <div className="space-y-2" aria-live="polite">
        {chat.map((m, i) => (
          <div key={i} className={m.who === 'you' ? 'talk-you' : 'talk-me'}>
            {m.text}
          </div>
        ))}
        <div ref={end} />
      </div>
    </section>
  );
}

const ASKS = ['Later', 'Earlier', 'Longer', 'Shorter', 'List'];

function Ask() {
  const busy = useStudio((s) => s.phase === 'forging' || !!s.importing);
  const [text, setText] = useState('');
  const send = (t: string) => {
    if (!t.trim() || busy) return;
    useStudio.getState().tell(t);
    setText('');
  };
  return (
    <form
      className="border-t border-white/[0.06] px-4 pt-2.5 pb-4"
      onSubmit={(e) => {
        e.preventDefault();
        send(text);
      }}
    >
      <div className="mb-2 flex flex-wrap gap-1.5">
        {ASKS.map((a) => (
          <button key={a} type="button" className="chip hover:text-ink disabled:opacity-40" disabled={busy} onClick={() => send(a.toLowerCase())}>
            {a}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          className="talk-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. use 1:20 to 1:35"
          aria-label="Tell the composer which part of the song to use"
          maxLength={200}
          data-testid="talk-input"
        />
        <button className="btn" type="submit" disabled={busy || !text.trim()}>
          {busy ? '…' : 'Send'}
        </button>
      </div>
    </form>
  );
}

/** right rail: the reasoning behind the piece, and the mixing desk */
export default function Mind() {
  const score = useStudio((s) => s.score);
  const heard = useStudio((s) => !!s.heard);
  const [tab, setTab] = useState<'mind' | 'mixer'>('mind');
  return (
    <aside className="rail rail-r glass">
      <div className="px-5 pt-5 pb-3">
        <div className="font-display text-[15px] font-semibold tracking-[0.2em]">COMPOSER&rsquo;S MIND</div>
        <div className="mt-1 text-[11.5px] text-faint">The thinking behind the music</div>
      </div>
      <div className="px-4 pb-3">
        <div className="seg-ctl w-full">
          <button className={`flex-1 ${tab === 'mind' ? 'on' : ''}`} onClick={() => setTab('mind')}>
            Reasoning
          </button>
          <button className={`flex-1 ${tab === 'mixer' ? 'on' : ''}`} onClick={() => setTab('mixer')}>
            Mixer
          </button>
        </div>
      </div>
      <div className="scroll flex-1 space-y-4 px-4 pb-5">
        {tab === 'mixer' ? (
          <>
            <Mixer />
            <p className="px-1 text-[11.5px] leading-relaxed text-faint">Your mix is what gets exported. Double-click a fader to reset it.</p>
          </>
        ) : !score ? (
          <Empty />
        ) : (
          <>
            {score.song ? null : (
              <>
                <section>
                  <div className="eyebrow mb-2 px-1">Motif DNA</div>
                  <Dna score={score} />
                </section>
                <section>
                  <div className="eyebrow mb-2 px-1">Harmony · now</div>
                  <Harmony score={score} />
                </section>
              </>
            )}
            <section>
              <div className="eyebrow mb-2 px-1">Decisions</div>
              <div className="space-y-2">
                {score.insights.map((it) => (
                  <div key={it.title} className="card p-3.5">
                    <div className="text-[12.5px] font-bold">{it.title}</div>
                    <p className="mt-1 text-[12px] leading-relaxed text-dim">{it.body}</p>
                  </div>
                ))}
              </div>
            </section>
            {heard && <Talk />}
          </>
        )}
      </div>
      {tab === 'mind' && heard && <Ask />}
    </aside>
  );
}
