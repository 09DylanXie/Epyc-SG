/**
 * Reads a plain-English request about an imported song ("use 1:20 to 1:35", "something later",
 * "make it Phantom") into one action. Runs on this device; it understands a fixed set of requests
 * and says so rather than guessing at anything else.
 */

export type Request =
  | { kind: 'window'; from: number; to: number; size?: number }
  | { kind: 'shift'; dir: -1 | 1 }
  | { kind: 'size'; size: number }
  | { kind: 'next' }
  | { kind: 'option'; n: number }
  | { kind: 'list' }
  | { kind: 'reset' }
  | { kind: 'again' }
  | { kind: 'style'; id: string }
  | { kind: 'past-end'; at: number }
  | { kind: 'sections' }
  | { kind: 'help' };

export interface RequestContext {
  /** how much of the recording was listened to, in seconds */
  seconds: number;
  styles: { id: string; name: string }[];
}

export const mmss = (x: number) => `${Math.floor(x / 60)}:${String(Math.floor(x % 60)).padStart(2, '0')}`;

const UNIT_S = String.raw`(?:seconds?|secs?|s)(?![a-z])`;
const UNIT_M = String.raw`(?:minutes?|mins?|m)(?![a-z])`;
// 1:37 · 1m20s · 1 min 20 sec · 2 minutes · 90 seconds · 90s · (bare numbers only after a time word)
const TIME = new RegExp(
  [
    String.raw`(\d{1,2}):([0-5]\d(?:\.\d+)?)`,
    String.raw`(\d+(?:\.\d+)?)\s*${UNIT_M}\s*(?:and\s*)?(\d+(?:\.\d+)?)\s*(?:${UNIT_S})?`,
    String.raw`(\d+(?:\.\d+)?)\s*${UNIT_M}`,
    String.raw`(\d+(?:\.\d+)?)\s*${UNIT_S}`,
    String.raw`(\d+(?:\.\d+)?)`,
  ].join('|'),
  'g',
);
const TIME_WORD = /\b(from|to|at|around|near|between|and|after|before|until|till|since|starting|start|ending|by|about|roughly|-|–)\s*$/;

interface Found {
  t: number;
  at: number;
  end: number;
  bare: boolean;
}

function times(s: string): Found[] {
  const out: Found[] = [];
  for (const m of s.matchAll(TIME)) {
    const at = m.index ?? 0;
    let t: number;
    let bare = false;
    if (m[1] !== undefined) t = +m[1] * 60 + +m[2];
    else if (m[3] !== undefined) t = +m[3] * 60 + +m[4];
    else if (m[5] !== undefined) t = +m[5] * 60;
    else if (m[6] !== undefined) t = +m[6];
    else {
      // a bare number counts as seconds only right after a time word ("from 30 to 45")
      if (!TIME_WORD.test(s.slice(0, at))) continue;
      t = +m[7];
      bare = true;
    }
    out.push({ t, at, end: at + m[0].length, bare });
  }
  return out;
}

const STOP = new Set(['dark', 'with', 'into', 'make', 'mode']);

export function parseRequest(text: string, ctx: RequestContext): Request {
  const s = ' ' + text.toLowerCase().replace(/[“”"']/g, '').replace(/\s+/g, ' ').trim() + ' ';
  const len = ctx.seconds;
  const win = (from: number, to: number, size?: number): Request => {
    if (from >= len - 0.5) return { kind: 'past-end', at: from };
    return { kind: 'window', from: Math.max(0, from), to: Math.min(len, Math.max(to, from + 2)), size };
  };
  const size = /\b(longer|more notes|bigger|extend)\b/.test(s) ? 11 : /\b(shorter|fewer notes|less notes|smaller|just a few)\b/.test(s) ? 4 : undefined;

  if (/\b(help|what can (you|i)|how do (i|you)|commands?)\b|^\s*\?\s*$/.test(s)) return { kind: 'help' };

  const opt = s.match(/\b(?:option|phrase|choice|number|no\.?|#)\s*(\d{1,2})\b/);
  if (opt) return { kind: 'option', n: +opt[1] };

  if (/\b(start over|start again|from scratch|begin again)\b/.test(s)) return { kind: 'reset' };
  // the first / last minute
  const whole = s.match(/\b(first|opening|last|final)\s+(minute|min|half minute)\b/);
  if (whole) {
    const n = whole[2] === 'half minute' ? 30 : 60;
    return /first|opening/.test(whole[1]) ? win(0, n, size) : win(len - n, len, size);
  }
  // first / last N seconds
  const edge = s.match(/\b(first|opening|last|final)\s+(\d+(?:\.\d+)?)\s*(s|secs?|seconds?|m|mins?|minutes?)?\b/);
  if (edge) {
    const n = +edge[2] * (edge[3] && edge[3].startsWith('m') ? 60 : 1);
    return /first|opening/.test(edge[1]) ? win(0, n, size) : win(len - n, len, size);
  }

  const found = times(s);
  const soonest = Math.min(...found.map((f) => f.t));
  if (found.length && soonest >= len - 0.5) return { kind: 'past-end', at: soonest };
  if (found.length >= 2) {
    const [a, b] = [found[0].t, found[1].t].sort((x, y) => x - y);
    return win(a, b, size);
  }
  if (found.length === 1) {
    const t = found[0].t;
    const before = s.slice(0, found[0].at);
    if (/\b(after|from|since|starting|start at|onwards?|past)\s*(the\s*)?$/.test(before) || /^\s*(on|onwards)\b/.test(s.slice(found[0].end))) return win(t, t + 15, size);
    if (/\b(before|until|till|up to|leading up to|by)\s*(the\s*)?$/.test(before)) return win(t - 15, t, size);
    // "at 1:37": a phrase that starts close to there
    return win(t - 2, t + 10, size);
  }

  if (/\b(chorus|verse|bridge|hook|drop|pre-chorus|refrain|solo)\b/.test(s)) return { kind: 'sections' };
  if (/\b(beginning|start|intro|opening)\b/.test(s)) return win(0, Math.min(30, len), size);
  if (/\b(end|ending|outro|finish|last (part|bit|section))\b/.test(s)) return win(len - 30, len, size);
  if (/\b(middle|halfway|half way)\b/.test(s)) return win(len / 2 - 15, len / 2 + 15, size);
  if (/\b(earlier|before that|before this|sooner)\b/.test(s)) return { kind: 'shift', dir: -1 };
  if (/\b(later|after that|after this|further on)\b/.test(s)) return { kind: 'shift', dir: 1 };

  for (const st of ctx.styles) {
    const name = st.name.toLowerCase();
    if (s.includes(' ' + name + ' ') || s.includes(' ' + st.id.toLowerCase() + ' ')) return { kind: 'style', id: st.id };
  }
  for (const st of ctx.styles) {
    const words = st.name.toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 4 && !STOP.has(w));
    if (words.some((w) => new RegExp(String.raw`\b${w.replace(/s$/, '')}s?\b`).test(s))) return { kind: 'style', id: st.id };
  }

  if (size) return { kind: 'size', size };
  if (/\b(list|options|show (me )?(the )?(phrases|melodies)|what (else|other|did you hear)|which (phrases|melodies))\b/.test(s)) return { kind: 'list' };
  if (/\b(reset|original|go back|your (pick|choice|first)|first one|undo)\b/.test(s)) return { kind: 'reset' };
  if (/\b(another|next|different|something else|other one|other melody|skip)\b/.test(s)) return { kind: 'next' };
  if (/\b(again|re-?roll|re-?forge|new arrangement|re-?arrange|remake|redo|shuffle)\b/.test(s)) return { kind: 'again' };
  return { kind: 'help' };
}

const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export const noteNames = (notes: number[]) => notes.map((m) => NAMES[((m % 12) + 12) % 12]).join(' ');
