'use client';

import { AMPLIFY_ID } from '@/engine/backing';
import { useEffect, useRef, type CSSProperties, type PointerEvent as RPointerEvent } from 'react';
import { player } from '@/engine/audio/player';
import { STYLES } from '@/engine/styles';
import { MODES, PC_NAMES, pcOf, type ModeId } from '@/engine/theory';
import { INST_LABEL, type PieceLength } from '@/engine/types';
import { Close, Listen, Lock, Play, Spark, Undo } from './icons';
import { COLS, PAD_CAPS, PIANO_CAPS, PIANO_HI, PIANO_LO, ROWS, inScale, padMidi } from './keys';
import { onFrame } from './loop';
import Midi from './Midi';
import { MAX_NOTES, useStudio } from './store';

const noteLabel = (m: number) => PC_NAMES[pcOf(m)];
const octaveOf = (m: number) => Math.floor(m / 12) - 1;
const ROW_TINT = ['color-mix(in srgb, var(--a2) 100%, var(--a1))', 'color-mix(in srgb, var(--a2) 66%, var(--a1))', 'color-mix(in srgb, var(--a2) 33%, var(--a1))', 'var(--a1)'];
const MODE_IDS = Object.keys(MODES) as ModeId[];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** one pointer = one sounding note; dragging glides from pad to pad */
function useGlide() {
  const ptr = useRef(new Map<number, number>());
  useEffect(() => {
    const up = (e: PointerEvent) => {
      const m = ptr.current.get(e.pointerId);
      if (m === undefined) return;
      ptr.current.delete(e.pointerId);
      if (![...ptr.current.values()].includes(m)) useStudio.getState().release(m);
    };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, []);
  const start = (e: RPointerEvent<HTMLElement>, midi: number) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    ptr.current.set(e.pointerId, midi);
    useStudio.getState().press(midi);
  };
  const enter = (e: RPointerEvent<HTMLElement>, midi: number) => {
    const prev = ptr.current.get(e.pointerId);
    if (prev === undefined || prev === midi) return;
    ptr.current.set(e.pointerId, midi);
    if (![...ptr.current.values()].includes(prev)) useStudio.getState().release(prev);
    useStudio.getState().press(midi);
  };
  return { start, enter };
}

/** while the piece plays, the pads and keys that match its melody light up */
function useEcho(root: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    let lit: number[] = [];
    return onFrame(() => {
      const el = root.current;
      if (!el) return;
      const now = [...player.sounding];
      if (now.length === lit.length && now.every((m, i) => m === lit[i])) return;
      el.querySelectorAll('.echo').forEach((n) => n.classList.remove('echo'));
      for (const m of now) el.querySelectorAll(`[data-midi="${m}"]`).forEach((n) => n.classList.add('echo'));
      lit = now;
    });
  }, [root]);
}

function Tray() {
  const motif = useStudio((s) => s.motif);
  const capture = useStudio((s) => s.capture);
  const phase = useStudio((s) => s.phase);
  const hasScore = useStudio((s) => !!s.score);
  const importing = useStudio((s) => s.importing);
  const heard = useStudio((s) => s.heard);
  const origin = useStudio((s) => s.origin);
  const amp = useStudio((s) => s.styleId === AMPLIFY_ID);
  const { undo, newMotif, setCapture, previewMotif, forge, inspireMe, importFile, nextPhrase } = useStudio.getState();
  const fileRef = useRef<HTMLInputElement>(null);
  const lo = motif.length ? Math.min(...motif) : 0;
  const hi = motif.length ? Math.max(...motif) : 1;
  const compact = motif.length > 10;
  const busy = phase === 'forging';

  return (
    <div className="flex items-center gap-2.5">
      <button
        className={`btn h-12 w-[78px] flex-col !gap-0.5 ${capture ? 'on' : ''}`}
        onClick={() => setCapture(!capture)}
        title={capture ? 'Recording: every note you play joins the motif' : 'Jamming: play along without changing the motif'}
        aria-pressed={capture}
      >
        <span className="flex items-center gap-1.5 text-[11px] tracking-[0.14em]">
          {capture && <i className="rec-dot" />}
          {capture ? 'REC' : 'JAM'}
        </span>
        <span className="font-mono text-[9.5px] font-medium text-faint">
          {motif.length}/{MAX_NOTES}
        </span>
      </button>

      <div className="flex h-12 min-w-0 flex-1 items-center gap-1 rounded-xl border border-white/[0.07] bg-black/25 px-2" data-testid="tray">
        {motif.map((m, i) => (
          <span key={`${i}:${m}`} className="note-chip" style={{ '--h': hi === lo ? 0.5 : (m - lo) / (hi - lo), flex: '0 1 34px', minWidth: 0 } as CSSProperties}>
            {noteLabel(m)}
            {!compact && <span className="opacity-50">{octaveOf(m)}</span>}
          </span>
        ))}
        {!motif.length && !importing && (
          <span className="truncate px-2 text-[12.5px] font-medium text-faint">
            {amp ? (
              <>
                <b className="text-dim">Import</b> a song: Amplify plays it exactly as it is and lays drums, a low drone and impacts under it.
              </>
            ) : (
              <>
            Your motif appears here — play 3 to 8 notes, let <b className="text-dim">Inspire</b> start one, or <b className="text-dim">Import</b> a song and I&apos;ll take its melody.
              </>
            )}
          </span>
        )}
        {importing && (
          <span className="flex min-w-0 flex-1 items-center gap-2.5 px-2 text-[12px] font-medium text-dim" data-testid="importing">
            <span className="truncate">{importing.label}…</span>
            <span className="h-1 w-24 flex-none overflow-hidden rounded-full bg-white/10">
              <span className="block h-full rounded-full" style={{ width: `${Math.round(importing.p * 100)}%`, background: 'var(--a1)' }} />
            </span>
          </span>
        )}
        {origin && heard && motif.length > 0 && (
          <span className="hidden truncate pl-2 text-[11px] font-medium text-faint xl:inline" title={`Heard in ${origin.name}`}>
            from {origin.name}
          </span>
        )}
        {capture && motif.length > 0 && motif.length < MAX_NOTES && <span className="ghost-slot" style={{ flex: '0 1 34px', minWidth: 0 }} />}
        <span className="flex-1" />
        {motif.length > 0 && (
          <span className="flex flex-none items-center gap-1 pl-1">
            <button className="btn icon" onClick={previewMotif} title="Hear the motif" aria-label="Hear the motif">
              <Play size={13} />
            </button>
            <button className="btn icon" onClick={undo} disabled={!capture} title="Remove the last note (Backspace)" aria-label="Remove the last note">
              <Undo size={15} />
            </button>
            <button className="btn icon" onClick={newMotif} title="Start a new motif" aria-label="Start a new motif">
              <Close size={15} />
            </button>
          </span>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="audio/*,.mp3,.wav,.m4a,.ogg,.flac"
        className="hidden"
        data-testid="import-file"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void importFile(file);
        }}
      />
      {!amp && heard && origin && heard.phrases.length > 1 ? (
        <button className="btn h-12 flex-col !gap-0.5 px-3" onClick={nextPhrase} disabled={busy || !!importing} data-testid="next-phrase" title={`Use another melody heard in ${heard.name}`}>
          <span className="text-[11.5px]">Another phrase</span>
          <span className="font-mono text-[9.5px] font-medium text-faint">
            {heard.idx + 1}/{heard.phrases.length}
          </span>
        </button>
      ) : null}
      <button
        className="btn h-12 px-3.5"
        onClick={() => fileRef.current?.click()}
        disabled={busy || !!importing}
        data-testid="import"
        title={
          amp
            ? 'Import an MP3 (or WAV, M4A, OGG): it plays exactly as it is, with an epic layer under it. The file stays on your device.'
            : 'Import an MP3 (or WAV, M4A, OGG): I take its melody and write a new piece around it in this mode. The file stays on your device. Use recordings whose melody you have the rights to.'
        }
      >
        <Listen size={16} style={{ color: 'var(--a1)' }} />
        Import
      </button>
      <button className="btn h-12 px-3.5" onClick={inspireMe} disabled={busy || !!importing || amp} title={amp ? 'Amplify plays your song instead of a motif' : 'Write a motif for me'}>
        <Spark size={15} style={{ color: 'var(--a1)' }} />
        Inspire
      </button>
      <button className={`forge ${motif.length && !busy ? 'ready' : ''}`} onClick={() => void forge()} disabled={busy || !!importing} data-testid="forge" title="Compose the piece (Enter)">
        {busy ? 'FORGING' : hasScore ? 'REFORGE' : 'FORGE'}
      </button>
    </div>
  );
}

const LENGTHS: [PieceLength, string][] = [
  ['short', 'Short'],
  ['standard', 'Standard'],
  ['extended', 'Long'],
];

function Controls() {
  const padKey = useStudio((s) => s.padKey);
  const keyLocked = useStudio((s) => s.keyLocked);
  const kbTarget = useStudio((s) => s.kbTarget);
  const octave = useStudio((s) => s.octave);
  const length = useStudio((s) => s.length);
  const intensity = useStudio((s) => s.intensity);
  const drop = useStudio((s) => s.drop);
  const amp = useStudio((s) => s.styleId === AMPLIFY_ID);
  const voice = useStudio((s) => {
    const st = STYLES[s.styleId];
    return st.padLow ? `${INST_LABEL[st.padVoice]} · low notes ${INST_LABEL[st.padLow.inst]}` : INST_LABEL[st.padVoice];
  });
  const { setPadKey, setKeyLocked, setKbTarget, setLength, setIntensity, setDrop } = useStudio.getState();

  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
      <div className="flex items-center gap-1.5">
        <select className="select" value={padKey.tonicPc} onChange={(e) => setPadKey({ tonicPc: +e.target.value })} aria-label="Key">
          {PC_NAMES.map((n, i) => (
            <option key={n} value={i}>
              {n}
            </option>
          ))}
        </select>
        <select className="select" value={padKey.mode} onChange={(e) => setPadKey({ mode: e.target.value as ModeId })} aria-label="Scale">
          {MODE_IDS.map((id) => (
            <option key={id} value={id}>
              {cap(MODES[id].name)}
            </option>
          ))}
        </select>
        <button
          className={`btn icon ${keyLocked ? 'on' : ''}`}
          onClick={() => setKeyLocked(!keyLocked)}
          aria-pressed={keyLocked}
          title={keyLocked ? 'Key locked: the piece will be written in this key' : 'Key free: Epyc SG picks the key that fits your notes best'}
        >
          <Lock size={14} open={!keyLocked} />
        </button>
      </div>

      <div className="seg-ctl" title="What your computer keyboard plays">
        <button className={kbTarget === 'pads' ? 'on' : ''} onClick={() => setKbTarget('pads')}>
          ⌨ Pads
        </button>
        <button className={kbTarget === 'piano' ? 'on' : ''} onClick={() => setKbTarget('piano')}>
          ⌨ Piano{kbTarget === 'piano' ? ` C${octave}` : ''}
        </button>
      </div>
      <Midi />
      <span className="hidden text-[11px] font-medium text-faint 2xl:inline">Voice · {voice}</span>

      <span className="flex-1" />

      <div className="seg-ctl" title={amp ? 'Amplify runs as long as your song' : 'How long the piece runs'}>
        {LENGTHS.map(([id, label]) => (
          <button key={id} className={length === id && !amp ? 'on' : ''} onClick={() => setLength(id)} disabled={amp}>
            {label}
          </button>
        ))}
      </div>
      <button
        className={`btn ${drop ? 'on' : ''}`}
        onClick={() => setDrop(!drop)}
        aria-pressed={drop}
        disabled={amp}
        data-drop
        title={drop ? 'Build-up & drop on: every big moment gets a run-up, a beat of silence and a drop' : 'Add a build-up and a drop before the big moments of your piece'}
      >
        Build &amp; Drop
      </button>
      <label className="flex items-center gap-2 text-[10.5px] font-bold uppercase tracking-[0.12em] text-faint" title="How hard the orchestra hits">
        Intensity
        <input
          className="range !w-[76px]"
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={intensity}
          style={{ '--v': `${intensity * 100}%`, '--tc': 'var(--a1)' } as CSSProperties}
          onChange={(e) => setIntensity(+e.target.value)}
        />
      </label>
    </div>
  );
}

function Pads() {
  const padKey = useStudio((s) => s.padKey);
  const held = useStudio((s) => s.held);
  const showCaps = useStudio((s) => s.kbTarget === 'pads');
  const { start, enter } = useGlide();
  const rows = [];
  for (let r = ROWS - 1; r >= 0; r--) {
    for (let c = 0; c < COLS; c++) {
      const midi = padMidi(r, c, padKey);
      const root = pcOf(midi - padKey.tonicPc) === 0;
      rows.push(
        <button
          key={`${r}:${c}`}
          className={`pad${root ? ' root' : ''}${held[midi] ? ' on' : ''}`}
          style={{ '--pc': ROW_TINT[r] } as CSSProperties}
          data-midi={midi}
          data-pad={`${r}-${c}`}
          tabIndex={-1}
          aria-label={`${noteLabel(midi)}${octaveOf(midi)}`}
          onPointerDown={(e) => start(e, midi)}
          onPointerEnter={(e) => enter(e, midi)}
        >
          {showCaps && <span className="cap">{PAD_CAPS[r][c]}</span>}
          <span className="nm">
            {noteLabel(midi)}
            <small>{octaveOf(midi)}</small>
          </span>
        </button>,
      );
    }
  }
  return <div className="pads">{rows}</div>;
}

const WHITE = [0, 2, 4, 5, 7, 9, 11];

function Piano() {
  const padKey = useStudio((s) => s.padKey);
  const held = useStudio((s) => s.held);
  const kbTarget = useStudio((s) => s.kbTarget);
  const octave = useStudio((s) => s.octave);
  const { start, enter } = useGlide();
  const whites: number[] = [];
  for (let m = PIANO_LO; m <= PIANO_HI; m++) if (WHITE.includes(m % 12)) whites.push(m);
  const w = 100 / whites.length;
  const capFor = (m: number) => (kbTarget === 'piano' ? PIANO_CAPS[m - 12 * (octave + 1)] ?? '' : '');
  const cls = (m: number) => `${held[m] ? ' on' : ''}${inScale(m, padKey) ? '' : ' out'}${pcOf(m - padKey.tonicPc) === 0 ? ' tonic' : ''}`;
  return (
    <div className="piano">
      {whites.map((m) => (
        <button key={m} className={`wk${cls(m)}`} data-midi={m} data-cap={capFor(m)} tabIndex={-1} aria-label={`${noteLabel(m)}${octaveOf(m)}`} onPointerDown={(e) => start(e, m)} onPointerEnter={(e) => enter(e, m)} />
      ))}
      {whites.map((m, i) =>
        m + 1 <= PIANO_HI && !WHITE.includes((m + 1) % 12) ? (
          <button
            key={m + 1}
            className={`bk${cls(m + 1)}`}
            style={{ left: `${(i + 1) * w - w * 0.3}%`, width: `${w * 0.6}%` }}
            data-midi={m + 1}
            data-cap={capFor(m + 1)}
            tabIndex={-1}
            aria-label={`${noteLabel(m + 1)}${octaveOf(m + 1)}`}
            onPointerDown={(e) => start(e, m + 1)}
            onPointerEnter={(e) => enter(e, m + 1)}
          />
        ) : null,
      )}
    </div>
  );
}

/** the instrument: motif tray, launchpad, piano */
export default function Deck() {
  const root = useRef<HTMLElement>(null);
  useEcho(root);
  return (
    <section className="deck glass flex flex-col gap-2.5 p-3.5" ref={root} onContextMenu={(e) => e.preventDefault()}>
      <Tray />
      <Controls />
      <Pads />
      <Piano />
    </section>
  );
}
