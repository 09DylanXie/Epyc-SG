import type { Inst } from '../types';

/**
 * Loudness targets for one mezzo-forte note of each instrument (loudest 100 ms window, dBFS RMS,
 * dry, before the hall and the mastering chain) and the register it is measured in.
 * GAIN below is derived from these by measurement on the /lab page — re-run it after changing a voice.
 */
export const TARGET: Record<Inst, [db: number, midi: number]> = {
  strings: [-21, 60], tremolo: [-23, 64], spiccato: [-22, 55], pizz: [-22, 55], cello: [-19, 50], violin: [-19, 72],
  horns: [-20, 55], trumpets: [-20, 65], lowBrass: [-19, 41], choirAh: [-23, 60], choirOo: [-25, 60], choirStac: [-21, 57],
  soprano: [-19, 74], piano: [-19, 60], felt: [-19, 60], harp: [-21, 62], zither: [-20, 62], bell: [-17, 57],
  glock: [-23, 84], celesta: [-22, 76], organ: [-23, 55], flute: [-20, 76], bamboo: [-19, 72], timpani: [-14, 41],
  braam: [-13, 33], sub: [-16, 33], synBass: [-17, 38], reese: [-17, 36], b808: [-13, 34], sawPad: [-25, 60],
  warmPad: [-25, 60], superSaw: [-23, 62], pluck: [-21, 67], arp: [-23, 67], lead: [-19, 72], ePiano: [-20, 60], guitar: [-18, 40], cowbell: [-18, 72],
  taikoLo: [-12, 60], taikoMid: [-13, 60], taikoHi: [-15, 60], boom: [-11, 60], impact: [-10, 60], snareOrch: [-15, 60],
  stick: [-22, 60], anvil: [-17, 60], gong: [-17, 60], crash: [-19, 60], swell: [-20, 60], kick: [-12, 60],
  kickDeep: [-12, 60], kickSoft: [-14, 60], snare: [-15, 60], snareLofi: [-16, 60], clap: [-17, 60], rim: [-20, 60],
  hat: [-26, 60], hatOpen: [-25, 60], shaker: [-28, 60], tick: [-26, 60], riser: [-18, 45], subDrop: [-15, 36], vinyl: [-36, 60],
};

/** strip input gains (calibrated; see TARGET) */
export const GAIN: Record<Inst, number> = {
  strings: 0.113, tremolo: 0.147, spiccato: 0.179, pizz: 0.382, cello: 0.207, violin: 0.214, horns: 0.123,
  trumpets: 0.146, lowBrass: 0.145, choirAh: 0.108, choirOo: 0.0719, choirStac: 0.351, soprano: 0.27, piano: 0.298,
  felt: 0.244, harp: 0.379, zither: 0.657, bell: 0.666, glock: 0.238, celesta: 0.249, organ: 0.111, flute: 0.206,
  bamboo: 0.219, timpani: 0.459, braam: 0.405, sub: 0.273, synBass: 0.306, reese: 0.139, b808: 0.378, sawPad: 0.0679,
  warmPad: 0.0732, superSaw: 0.0663, pluck: 0.183, arp: 0.157, lead: 0.172, ePiano: 0.206, guitar: 0.122, cowbell: 0.363, taikoLo: 0.525,
  taikoMid: 0.568, taikoHi: 0.456, boom: 0.578, impact: 0.619, snareOrch: 0.676, stick: 0.374, anvil: 0.321,
  gong: 0.667, crash: 0.55, swell: 0.51, kick: 0.596, kickDeep: 0.537, kickSoft: 0.473, snare: 0.625,
  snareLofi: 0.761, clap: 0.486, rim: 0.4, hat: 0.249, hatOpen: 0.214, shaker: 0.184, tick: 0.23, riser: 0.559,
  subDrop: 0.33, vinyl: 0.295,
};
