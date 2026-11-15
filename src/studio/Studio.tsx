'use client';

import { useEffect, useState } from 'react';
import { STAND_INS } from '@/engine/audio/graph';
import { exportTiming, player } from '@/engine/audio/player';
import { STYLES } from '@/engine/styles';
import Deck from './Deck';
import ExportDialog from './ExportDialog';
import Mind from './Mind';
import Stage from './Stage';
import Modes from './Modes';
import Player from './Player';
import Visualizer from './Visualizer';
import { padForCode, padMidi, pianoForCode } from './keys';
import { fx, pace } from './loop';
import { forgeTiming, useStudio } from './store';

/** computer keyboard → pads (or piano), transport and forge */
function useKeyboard() {
  useEffect(() => {
    const down = new Map<string, number>();
    // How focus last moved. The browser's own :focus-visible is no use here: it starts matching a
    // mouse-clicked button the moment any key goes down, which is exactly when we need to ask.
    let tabbed = false;
    const onPointer = () => {
      tabbed = false;
    };
    // a menu picked with the mouse hands the keyboard straight back to the pads
    const onChange = (e: Event) => {
      if (!tabbed && e.target instanceof HTMLSelectElement) e.target.blur();
    };
    const onDown = (e: KeyboardEvent) => {
      if (e.code === 'Tab') tabbed = true;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const st = useStudio.getState();
      if (st.exp.open) {
        if (e.code === 'Escape') st.openExport(false);
        return;
      }
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === 'SELECT' || tag === 'TEXTAREA' || el?.isContentEditable) return;
      if (tag === 'INPUT' && (el as HTMLInputElement).type !== 'range') return;
      const act = e.code === 'Space' || e.code === 'Enter';
      // a button reached with Tab keeps its normal Space / Enter behaviour; one that was clicked
      // must not swallow the next Space or Enter
      if (act && tag === 'BUTTON' && tabbed) return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (!e.repeat) st.toggle();
        return;
      }
      if (e.code === 'Enter') {
        e.preventDefault();
        if (!e.repeat) void st.forge();
        return;
      }
      if (e.code === 'Backspace') {
        e.preventDefault();
        st.undo();
        return;
      }
      if (e.code === 'Escape') {
        if (st.cinema) st.setCinema(false);
        return;
      }
      if (e.repeat) return;
      let midi: number | undefined;
      if (st.kbTarget === 'pads') {
        const pad = padForCode(e.code);
        if (pad) midi = padMidi(pad[0], pad[1], st.padKey);
      } else {
        if (e.code === 'KeyZ') return st.shiftOctave(-1);
        if (e.code === 'KeyX') return st.shiftOctave(1);
        midi = pianoForCode(e.code, st.octave);
      }
      if (midi === undefined) return;
      e.preventDefault();
      down.set(e.code, midi);
      st.press(midi);
    };
    const onUp = (e: KeyboardEvent) => {
      const midi = down.get(e.code);
      if (midi === undefined) return;
      down.delete(e.code);
      if (![...down.values()].includes(midi)) useStudio.getState().release(midi);
    };
    const onBlur = () => {
      down.clear();
      useStudio.getState().releaseAll();
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    window.addEventListener('pointerdown', onPointer, true);
    window.addEventListener('change', onChange, true);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('pointerdown', onPointer, true);
      window.removeEventListener('change', onChange, true);
    };
  }, []);
}

/** drop a song anywhere on the studio to take its melody */
function useFileDrop() {
  const [over, setOver] = useState(false);
  useEffect(() => {
    let depth = 0;
    const hasFile = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');
    const enter = (e: DragEvent) => {
      if (!hasFile(e)) return;
      depth++;
      setOver(true);
    };
    const leave = (e: DragEvent) => {
      if (!hasFile(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) setOver(false);
    };
    const overFn = (e: DragEvent) => {
      if (!hasFile(e)) return;
      e.preventDefault();
      e.dataTransfer!.dropEffect = 'copy';
    };
    const drop = (e: DragEvent) => {
      if (!hasFile(e)) return;
      e.preventDefault();
      depth = 0;
      setOver(false);
      const file = [...(e.dataTransfer?.files ?? [])].find((x) => x.type.startsWith('audio/') || /\.(mp3|wav|m4a|ogg|flac|aac)$/i.test(x.name));
      if (file) void useStudio.getState().importFile(file);
      else useStudio.getState().say('Drop an audio file (MP3, WAV, M4A or OGG) and I will take its melody.');
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', overFn);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', overFn);
      window.removeEventListener('drop', drop);
    };
  }, []);
  return over;
}

function Toast() {
  const toast = useStudio((s) => s.toast);
  if (!toast) return null;
  return (
    <div className="toast" role="status" key={toast}>
      {toast}
    </div>
  );
}

export default function Studio() {
  const styleId = useStudio((s) => s.styleId);
  const cinema = useStudio((s) => s.cinema);
  const style = STYLES[styleId];

  useEffect(() => {
    useStudio.getState().init();
    // handy in the console: __epyc.player, __epyc.store.getState()
    (window as unknown as { __epyc: unknown }).__epyc = { player, store: useStudio, fx, pace, forgeTiming, exportTiming, standIns: STAND_INS };
  }, []);
  useEffect(() => {
    const root = document.documentElement.style;
    root.setProperty('--a1', style.palette[0]);
    root.setProperty('--a2', style.palette[1]);
    root.setProperty('--a3', style.palette[2]);
  }, [style]);
  useKeyboard();
  const dropping = useFileDrop();

  return (
    <>
      <Visualizer />
      <div className={`studio${cinema ? ' cinema' : ''}`}>
        <Modes />
        <div className="centre">
          <Stage />
          <Player />
          <Deck />
        </div>
        <Mind />
      </div>
      <ExportDialog />
      <Toast />
      {dropping && (
        <div className="drop-veil" aria-hidden>
          <div>
            <b>Drop a song</b>
            <span>I&apos;ll take its melody and write a {style.name} piece around it</span>
          </div>
        </div>
      )}
    </>
  );
}
