/**
 * Amplify: a thin epic layer under someone's own recording. The recording itself is never changed;
 * this only writes what plays alongside it — drums on the beats the drummer actually played, a low
 * drone on the song's keynote (only when the key is clear), and a riser and an impact wherever the
 * song lifts. Every note is placed at a tracked time, so the layer drifts with the band.
 */
import type { SongMap } from './beat';
import { MAX_SECONDS } from './listen';
import { PC_NAMES } from './theory';
import { METERS, type Inst, type Insight, type NoteEv, type Score, type Section, type Bus } from './types';

export const AMPLIFY_ID = 'amplify';
/** below this pulse clarity (see SongMap.pulse) the beat is too uncertain to play drums on */
export const PULSE_MIN = 5;

export interface BackingInput {
  map: SongMap;
  name: string;
  seed: number;
  /** 0..1: how much there is of the layer */
  intensity: number;
  /** semitones off A440 (from the melody listener) */
  tune?: number;
  /** the whole recording's length: it always plays to its end, even past what was analysed */
  songSeconds?: number;
}

const mmss = (x: number) => `${Math.floor(x / 60)}:${String(Math.floor(x % 60)).padStart(2, '0')}`;

/** quiet, rising, full: how much the layer does in each stretch of the song */
type Level = 0 | 1 | 2;
const NAMES: Record<Level, string[]> = {
  0: ['Undercurrent', 'Hush', 'Still Water', 'Low Light'],
  1: ['Gathering', 'Rising', 'The March', 'Ascent'],
  2: ['Full Force', 'Thunder', 'Summit', 'Wildfire'],
};

export function composeBacking(input: BackingInput): Score {
  const { map } = input;
  const I = Math.max(0, Math.min(1, input.intensity));
  const bpm = Math.round(map.bpm);
  const spb = 60 / bpm;
  const at = (sec: number) => sec / spb;
  const beats = map.beats;
  const lastBeat = beats[beats.length - 1];
  const ibi = 60 / map.bpm;
  const beatTime = (i: number) => (i < beats.length ? beats[i] : lastBeat + (i - beats.length + 1) * ibi);

  // bars of four from the first downbeat; a song in half time gets bars of four half-notes
  const nBars = Math.max(1, map.barDb.length);
  const barAt = (k: number) => beatTime(map.first + 4 * k);

  // how loud each bar is, from the quietest (0) to the loudest (1) stretch of this song
  const db = map.barDb.length ? map.barDb : [0];
  const sorted = [...db].sort((a, b) => a - b);
  const lo = sorted[Math.floor(sorted.length * 0.15)];
  const hi = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))];
  const span = Math.max(3, hi - lo);
  const e = db.map((x) => Math.max(0, Math.min(1, (x - lo) / span)));
  // three-bar median: one loud fill shouldn't open the floodgates
  const smooth = e.map((_, k) => [e[k - 1] ?? e[k], e[k], e[k + 1] ?? e[k]].sort((a, b) => a - b)[1]);
  const lv: Level[] = smooth.map((x) => (x < 0.4 ? 0 : x < 0.75 ? 1 : 2));
  // stretches shorter than four bars join the one before
  const runs: { level: Level; from: number; bars: number }[] = [];
  for (let k = 0; k < lv.length; k++) {
    const r = runs[runs.length - 1];
    if (r && r.level === lv[k]) r.bars++;
    else runs.push({ level: lv[k], from: k, bars: 1 });
  }
  for (let i = 1; i < runs.length; ) {
    if (runs[i].bars < 4) {
      runs[i - 1].bars += runs[i].bars;
      runs.splice(i, 1);
      if (i < runs.length && runs[i].level === runs[i - 1].level) {
        runs[i - 1].bars += runs[i].bars;
        runs.splice(i, 1);
      }
    } else i++;
  }
  if (runs.length > 1 && runs[0].bars < 4) {
    runs[1].from = 0;
    runs[1].bars += runs[0].bars;
    runs.shift();
  }

  // a drone needs only a keynote that is safe to hold, not a certain key (older maps lack droneSafe)
  const pitched = map.droneSafe ?? map.keySure;
  // hits on a beat the song doesn't keep would be worse than none: without a clear pulse the layer
  // keeps to the drone and the lifts
  const steady = (map.pulse ?? Infinity) >= PULSE_MIN;
  const tune = input.tune ?? 0;
  // only one note is ever held, so no key is claimed: a minor song can read as its relative major,
  // or one that leans on its V chord as that chord's key, and the held note is safe either way
  const note = PC_NAMES[map.tonicPc];
  const keyName = `holding ${note}`;
  // the keynote low in the strings and in the middle of the choir, in the recording's own tuning
  const lowT = 36 + map.tonicPc + tune;
  const midT = 48 + map.tonicPc + tune + (map.tonicPc > 7 ? -12 : 0) + 12;
  const vel = (v: number) => v * (0.55 + 0.6 * I);

  const out: NoteEv[] = [];
  const emit = (t: number, d: number, i: Inst, m: number, v: number, b: Bus, s: number, extra: Partial<NoteEv> = {}) =>
    out.push({ t: at(t), d: Math.max(0.05, d / spb), i, m, v: vel(v), b, s, ...extra });

  const used: Record<Level, number> = { 0: 0, 1: 0, 2: 0 };
  const sections: Section[] = [];
  const lifts: number[] = [];
  // the layer stops where the analysis does; the recording itself always plays to its own end
  const seconds = Math.min(map.seconds, lastBeat + 2 * ibi);
  const songEnd = Math.max(seconds, input.songSeconds ?? map.seconds);
  runs.forEach((r, si) => {
    const start = si === 0 ? 0 : barAt(r.from);
    const end = si === runs.length - 1 ? songEnd : barAt(r.from + r.bars);
    const n = used[r.level]++;
    const pool = NAMES[r.level];
    const name = pool[n % pool.length] + (n >= pool.length ? ` ${Math.floor(n / pool.length) + 1}` : '');
    const kind = r.level === 2 ? 'climax' : r.level === 1 ? (runs[si + 1]?.level === 2 ? 'build' : 'theme') : si === 0 ? 'intro' : 'break';
    const say =
      r.level === 0
        ? pitched
          ? 'Your song, with a low string drone on its keynote underneath.'
          : 'Your song on its own here: the layer waits.'
        : !steady
          ? pitched
            ? 'The drone grows with the song; no drums, since its beat isn’t steady enough to follow.'
            : 'Your song on its own here: its beat isn’t steady enough to play drums along with.'
          : r.level === 1
            ? 'Taiko on every downbeat, following the drummer.'
            : `Full force: booms, taiko${pitched ? ' and choir' : ''} under the loudest part.`;
    const voices = [
      ...(pitched ? ['strings'] : []),
      ...(r.level >= 1 && steady ? ['taiko'] : []),
      ...(r.level === 2 ? [...(steady ? ['boom'] : []), ...(pitched && I >= 0.35 ? ['choir'] : [])] : []),
    ];
    sections.push({ name, kind, startBar: r.from, bars: r.bars, startBeat: at(start), beats: at(end) - at(start), energy: [0.25, 0.55, 0.9][r.level], lift: 0, keyName: pitched ? keyName : 'free', say: [say], voices });

    // drone: re-bowed every two bars so it never runs dry, a little louder as the song lifts
    if (pitched) {
      const dv = [0.2, 0.27, 0.34][r.level];
      for (let k = 0; k < r.bars; k += 2) {
        const t0 = si === 0 && k === 0 ? 0 : barAt(r.from + k);
        const t1 = Math.min(end, seconds, barAt(r.from + k + 2));
        if (t1 - t0 < 0.3) continue;
        const d = t1 - t0 + 0.25;
        emit(t0, d, 'strings', lowT, dv, 'pad', si, { a: k === 0 ? 1 : undefined });
        emit(t0, d, 'strings', lowT + 12, dv * 0.7, 'pad', si);
        if (r.level === 2 && I >= 0.35) {
          emit(t0, d, 'choirOo', midT, 0.3, 'choir', si);
          emit(t0, d, 'choirOo', midT - 12, 0.24, 'choir', si);
        }
      }
    }
    // drums on the tracked beats
    if (r.level >= 1 && steady) {
      for (let k = 0; k < r.bars; k++) {
        const bar = r.from + k;
        for (let q = 0; q < 4; q++) {
          const t = beatTime(map.first + 4 * bar + q);
          if (t >= end - 0.02 || t >= seconds) break;
          if (r.level === 1) {
            if (q === 0) emit(t, 0.5, 'taikoLo', 45, 0.5, 'drums', si, { vis: 1 });
            else if (q === 2) emit(t, 0.4, 'taikoLo', 45, 0.3, 'drums', si);
            if (q === 0 && k % 4 === 0) emit(t, 1, pitched ? 'timpani' : 'taikoLo', pitched ? lowT : 45, 0.42, 'drums', si);
          } else {
            if (q === 0 && k % 2 === 0) emit(t, 1.2, 'boom', 36, 0.78, 'drums', si, { vis: 2 });
            if (q === 0 || q === 2) emit(t, 0.5, 'taikoLo', 45, q === 0 ? 0.62 : 0.46, 'drums', si, q === 0 ? { vis: 1 } : {});
            if ((q === 1 || q === 3) && I >= 0.35) emit(t, 0.3, 'taikoMid', 50, 0.34, 'drums', si);
          }
        }
      }
    }
    // the way in: a swell into the middle, a riser and an impact into the loudest part
    if (si > 0) {
      const prev = runs[si - 1].level;
      if (r.level === 2 && prev < 2) {
        const rise = Math.max(0.5, start - barAt(Math.max(0, r.from - 2)));
        emit(start - rise, rise, 'riser', 60, 0.55, 'fx', si - 1);
        emit(start, 2, 'impact', 36, 0.85, 'fx', si, { vis: 2 });
        emit(start, 2, 'subDrop', 36, 0.6, 'fx', si);
        emit(start, 2, 'crash', 60, 0.42, 'drums', si);
        if (pitched) emit(start, 2.5, 'braam', lowT, 0.55, 'fx', si);
        lifts.push(start);
      } else if (r.level === 1 && prev === 0) {
        const rise = Math.max(0.4, start - barAt(Math.max(0, r.from - 1)));
        emit(start - rise, rise, 'swell', 60, 0.4, 'fx', si - 1);
      }
    }
  });
  out.sort((a, b) => a.t - b.t);

  const loudBars = lv.filter((x) => x === 2).length;
  const insights: Insight[] = [
    {
      title: `Amplify · ${input.name}`,
      body: steady
        ? `Your recording plays exactly as it is — nothing in it is changed. I followed its beat (about ${bpm} BPM) through ${nBars} bars and laid a thin layer underneath: ${pitched ? 'a low string drone, ' : ''}taiko on the downbeats when the song picks up, and booms${pitched && I >= 0.35 ? ', choir' : ''} and impacts in its loudest ${loudBars} bars.`
        : `Your recording plays exactly as it is — nothing in it is changed. Underneath it: ${pitched ? 'a low string drone that grows with the song, ' : ''}and a riser and impact wherever it gets louder.`,
    },
    steady
      ? {
          title: 'Following the drummer',
          body: 'The hits are placed on each beat I tracked in the recording, not on a fixed grid, so if the band speeds up or slows down the layer goes with it.',
        }
      : {
          title: 'No steady beat',
          body: 'I couldn’t hear a beat steady enough to play drums along with, so there are none: only the held note and an impact where the song swells. Drums a little off the song’s own rhythm would make it sound worse, not bigger.',
        },
    pitched
      ? { title: `Drone · ${note}`, body: `${note} is the note your song seems to settle on, and the note a semitone above it, the one that would rub hardest, is much quieter, so the strings hold ${note} low${I >= 0.35 ? ' and the choir doubles it in its loudest parts' : ''}. Just that one note, never a chord, to keep out of the way of the song’s own harmony. It’s a best guess from listening, not a key I’m sure of.` }
      : { title: 'Drone · none', body: 'I couldn’t find a note that would sit safely under the whole song, so the layer has no pitched notes at all, only drums and impacts. Nothing in it can clash with the song.' },
    lifts.length
      ? { title: 'Where it lifts', body: `The song gets louder at ${lifts.map(mmss).join(', ')}, so each of those gets a riser and an impact as it arrives.` }
      : { title: 'Where it lifts', body: 'The song stays at about the same level all the way through, so the layer does too.' },
  ];
  if (map.seconds >= MAX_SECONDS - 1 && songEnd > seconds + 1)
    insights.push({ title: 'Length', body: `I listened to the first ${mmss(seconds)}, so the layer stops there. Your song plays on to its end (${mmss(songEnd)}) exactly as it is.` });

  const totalBeats = at(songEnd);
  return {
    title: `${input.name} · Amplified`,
    styleId: AMPLIFY_ID,
    seed: input.seed,
    bpm,
    meter: METERS['4/4'],
    tonicPc: map.tonicPc,
    mode: map.minor ? 'aeolian' : 'ionian',
    keyName: pitched ? keyName : 'no drone',
    totalBars: nBars,
    totalBeats,
    musicSec: songEnd,
    durationSec: songEnd + 1.5,
    sections,
    chords: [],
    events: out,
    melody: [],
    dna: [],
    insights,
    input: [],
    baseTonic: 60 + map.tonicPc,
    progression: pitched ? `Drone on ${note}` : 'Drums only',
    origin: { name: input.name, from: 0, to: songEnd },
    song: { name: input.name, seconds: songEnd, rms: map.rms },
  };
}
