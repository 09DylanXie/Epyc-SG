import { MODES, degToMidi, pcOf, type ModeId } from '@/engine/theory';

/** physical keys of the pad grid, bottom row first (event.code, so any keyboard layout works) */
export const PAD_CODES: string[][] = [
  ['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', 'Comma'],
  ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK'],
  ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI'],
  ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8'],
];
export const PAD_CAPS: string[][] = [
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M', ','],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K'],
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I'],
  ['1', '2', '3', '4', '5', '6', '7', '8'],
];
export const ROWS = 4;
export const COLS = 8;

export interface PadKey {
  tonicPc: number;
  mode: ModeId;
}

/** tonic of the bottom row: somewhere between B♭1 and A2 */
const baseTonic = (pc: number) => 34 + ((pc - 10 + 12) % 12);

/** every pad is a note of the scale: columns walk up it, each row starts an octave higher */
export function padMidi(row: number, col: number, key: PadKey): number {
  return degToMidi(col, baseTonic(key.tonicPc) + 12 * row, MODES[key.mode].scale);
}

export function allPadMidis(key: PadKey): number[] {
  const out: number[] = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) out.push(padMidi(r, c, key));
  return out;
}

export const inScale = (midi: number, key: PadKey) => MODES[key.mode].scale.includes(pcOf(midi - key.tonicPc));

const CODE_TO_PAD = new Map<string, [number, number]>();
PAD_CODES.forEach((row, r) => row.forEach((code, c) => CODE_TO_PAD.set(code, [r, c])));
export const padForCode = (code: string) => CODE_TO_PAD.get(code);

/** the piano strip: C3 … C6 */
export const PIANO_LO = 48;
export const PIANO_HI = 84;

/** classic two-row "typing piano": A S D F… are white keys from C, W E T Y U… the black ones */
const PIANO_CODES: Record<string, number> = {
  KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6, KeyG: 7, KeyY: 8, KeyH: 9, KeyU: 10, KeyJ: 11,
  KeyK: 12, KeyO: 13, KeyL: 14, KeyP: 15, Semicolon: 16, Quote: 17,
};
export const pianoForCode = (code: string, octave: number): number | undefined => {
  const st = PIANO_CODES[code];
  return st === undefined ? undefined : 12 * (octave + 1) + st;
};
export const PIANO_CAPS: Record<number, string> = {
  0: 'A', 1: 'W', 2: 'S', 3: 'E', 4: 'D', 5: 'F', 6: 'T', 7: 'G', 8: 'Y', 9: 'H', 10: 'U', 11: 'J', 12: 'K', 13: 'O', 14: 'L', 15: 'P', 16: ';', 17: "'",
};
