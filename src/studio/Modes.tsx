'use client';

import { useState, type CSSProperties } from 'react';
import { STYLES, STYLE_LIST } from '@/engine/styles';
import { Mark, Trash } from './icons';
import { useStudio } from './store';
import { clock } from './util';

const vars = (p: readonly string[]) => ({ '--w1': p[0], '--w2': p[1], '--w3': p[2] }) as CSSProperties;

/** the generation modes — pick one and the same notes are scored in that language — and the library */
export default function Modes() {
  const styleId = useStudio((s) => s.styleId);
  const library = useStudio((s) => s.library);
  const busy = useStudio((s) => s.phase === 'forging');
  const setWorld = useStudio((s) => s.setWorld);
  const openPiece = useStudio((s) => s.openPiece);
  const removePiece = useStudio((s) => s.removePiece);
  const [tab, setTab] = useState<'modes' | 'library'>('modes');
  const active = STYLES[styleId];

  return (
    <aside className="rail rail-l modes glass">
      <div className="modes-head">
        <div className="brand flex items-center gap-3">
          <Mark />
          <div>
            <div className="font-display text-[17px] font-semibold leading-none tracking-[0.34em]">EPYC SG</div>
            <div className="mt-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-faint">Personal AI composer</div>
          </div>
        </div>
        <div className="seg-ctl modes-tabs">
          <button className={`flex-1 ${tab === 'modes' ? 'on' : ''}`} onClick={() => setTab('modes')}>
            Modes
          </button>
          <button className={`flex-1 ${tab === 'library' ? 'on' : ''}`} onClick={() => setTab('library')}>
            Library{library.length ? ` · ${library.length}` : ''}
          </button>
        </div>
        {tab === 'modes' && (
          <p className="modes-blurb">
            <b>{active.name}</b> — {active.tagline}
          </p>
        )}
      </div>

      {tab === 'modes' ? (
        <div className="scroll modes-list" role="radiogroup" aria-label="Generation mode">
          {STYLE_LIST.map((w) => (
            <button
              key={w.id}
              className={`world ${w.id === styleId ? 'on' : ''}`}
              style={vars(w.palette)}
              onClick={() => setWorld(w.id)}
              disabled={busy}
              role="radio"
              aria-checked={w.id === styleId}
              data-world={w.id}
              title={w.tagline}
            >
              <span className="orb" />
              <span className="min-w-0">
                <span className="block truncate text-[13.5px] font-bold leading-tight">{w.name}</span>
                <span className="block truncate text-[11.5px] font-medium text-dim">{w.genre}</span>
                {w.id === styleId && <span className="world-tag mt-1 block text-[11px] leading-snug text-faint">{w.tagline}</span>}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="scroll modes-list">
          {!library.length && (
            <p className="col-span-full px-3 py-4 text-[12.5px] leading-relaxed text-faint">
              Nothing here yet. Every piece you forge is kept on this device, ready to replay, re-score or download.
            </p>
          )}
          {library.map((p) => {
            const w = STYLES[p.styleId];
            if (!w) return null;
            return (
              <div key={p.id} className="group relative min-w-0">
                <button className="world pr-10" style={vars(w.palette)} onClick={() => openPiece(p)} disabled={busy}>
                  <span className="orb" />
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-bold leading-tight">{p.title}</span>
                    <span className="block truncate text-[11px] font-medium text-dim">
                      {w.name} · {p.keyName} · {clock(p.seconds)}
                    </span>
                  </span>
                </button>
                <button
                  className="tbtn absolute right-1.5 top-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                  onClick={() => removePiece(p.id)}
                  aria-label={`Remove ${p.title}`}
                  title="Remove from library"
                >
                  <Trash size={15} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </aside>
  );
}
