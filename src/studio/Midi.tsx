'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { useStudio } from './store';

type Status = 'off' | 'asking' | 'on' | 'none' | 'denied' | 'unsupported';
interface State {
  status: Status;
  device: string | null;
}

/** keep every note inside the range the orchestra is written for, by octaves */
const fold = (m: number) => {
  while (m < 36) m += 12;
  while (m > 96) m -= 12;
  return m;
};

// One connection for the page. A keyboard that is plugged in later is picked up as it appears.
let access: MIDIAccess | null = null;
let state: State = { status: 'off', device: null };
const subs = new Set<() => void>();
const subscribe = (f: () => void) => {
  subs.add(f);
  return () => {
    subs.delete(f);
  };
};
const idle: State = state;
const publish = (s: State) => {
  state = s;
  subs.forEach((f) => f());
};
const sounding = new Map<number, number>(); // raw key → folded note
const pedalled = new Set<number>();
let pedal = false;

const lift = (key: number) => {
  const m = sounding.get(key);
  if (m === undefined) return;
  sounding.delete(key);
  if (![...sounding.values()].includes(m)) useStudio.getState().release(m);
};

function onMessage(e: MIDIMessageEvent) {
  const d = e.data;
  if (!d || d.length < 2) return;
  const kind = d[0] & 0xf0;
  const key = d[1];
  const val = d[2] ?? 0;
  if (kind === 0x90 && val > 0) {
    pedalled.delete(key);
    if (sounding.has(key)) lift(key);
    const m = fold(key);
    sounding.set(key, m);
    useStudio.getState().press(m, 0.35 + 0.65 * (val / 127));
  } else if (kind === 0x80 || (kind === 0x90 && val === 0)) {
    if (pedal) pedalled.add(key);
    else lift(key);
  } else if (kind === 0xb0 && key === 64) {
    pedal = val >= 64;
    if (!pedal) {
      pedalled.forEach(lift);
      pedalled.clear();
    }
  } else if (kind === 0xb0 && (key === 120 || key === 123)) {
    [...sounding.keys()].forEach(lift);
    pedalled.clear();
  }
}

function bind() {
  if (!access) return;
  const names: string[] = [];
  access.inputs.forEach((input) => {
    input.onmidimessage = onMessage;
    if (input.state !== 'disconnected') names.push(input.name || 'MIDI keyboard');
  });
  if (!names.length) {
    [...sounding.keys()].forEach(lift);
    pedalled.clear();
    pedal = false;
  }
  publish(names.length ? { status: 'on', device: names.length > 1 ? `${names[0]} +${names.length - 1}` : names[0] } : { status: 'none', device: null });
}

async function connect(quiet = false): Promise<void> {
  const say = (msg: string) => !quiet && useStudio.getState().say(msg);
  if (typeof navigator === 'undefined' || !navigator.requestMIDIAccess) {
    publish({ status: 'unsupported', device: null });
    say('This browser has no MIDI support — use Chrome, Edge or Firefox to plug in a keyboard.');
    return;
  }
  if (access) {
    bind();
    if (state.status === 'none') say('No keyboard found yet. Plug one in (or switch it on) and it will connect by itself.');
    return;
  }
  publish({ status: 'asking', device: null });
  try {
    access = await navigator.requestMIDIAccess({ sysex: false });
  } catch {
    publish({ status: 'denied', device: null });
    say('MIDI access was blocked. Allow it for this site in the address bar, then press MIDI again.');
    return;
  }
  access.onstatechange = bind;
  bind();
  try {
    localStorage.setItem('epyc.midi', '1');
  } catch {}
  if (state.status === 'on') say(`${state.device} connected — play, then press Enter to forge.`);
  else say('MIDI is on. Plug in a keyboard (or switch it on) and it will connect by itself.');
}

/** plug in a piano: every key you play sounds in the current mode's voice and is written into the motif */
export default function Midi() {
  const s = useSyncExternalStore(subscribe, () => state, () => idle);
  useEffect(() => {
    // come back connected if this site was already given MIDI access
    let wanted = false;
    try {
      wanted = localStorage.getItem('epyc.midi') === '1';
    } catch {}
    if (wanted && !access && navigator.permissions?.query) {
      navigator.permissions
        .query({ name: 'midi' as PermissionName })
        .then((p) => {
          if (p.state === 'granted') void connect(true);
        })
        .catch(() => {});
    }
  }, []);

  const on = s.status === 'on';
  const label = on ? s.device! : s.status === 'asking' ? 'Connecting…' : s.status === 'none' ? 'MIDI · waiting' : 'MIDI';
  const title = on
    ? `${s.device} is connected: play it and your notes are recorded as the motif. Sustain pedal works.`
    : s.status === 'none'
      ? 'MIDI is on, but no keyboard is connected yet. Plug one in and it appears here.'
      : 'Connect an electric piano or MIDI keyboard and play your motif on it';
  return (
    <button className={`btn midi ${on ? 'on' : ''}`} onClick={() => void connect()} title={title} data-testid="midi" data-midi-status={s.status} aria-pressed={on}>
      <span className={`midi-dot ${on ? 'on' : s.status === 'none' || s.status === 'asking' ? 'wait' : ''}`} />
      <span className="max-w-[150px] truncate">{label}</span>
    </button>
  );
}
