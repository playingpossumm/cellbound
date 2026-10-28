// Sound: short notes made in the browser (Web Audio), the Motion Lab's. Each digit has its own note
// on a pentatonic scale, as it has its own colour, so a board plays the solve back as a tune; a
// digit the board marks as wrong buzzes low instead; a finished row, column or box runs up the
// scale with its wave; a Run's whole show, its tally, its cards and a won run climb a note at a
// time. The Sound switch in Settings silences all of it, and on an iPhone so does the ring switch.
// Nothing can play before the player has touched the page, so the first touch wakes the sound.
import { conflicts as engineConflicts } from '../engine';
import { cellDistance, fullGrid } from '../game/logic';
import { getSettings } from '../game/settings';
import { checksSolution, onPlacement, type PlacementEvent } from '../game/store';

type Ctx = AudioContext;

let ctx: Ctx | null = null;
let out: GainNode | null = null;

function audio(): Ctx | null {
  if (typeof window === 'undefined' || !getSettings().sound) return null;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  try {
    if (!ctx) {
      ctx = new AC();
      out = ctx.createGain();
      out.gain.value = 1.4;
      out.connect(ctx.destination);
    }
    if (ctx.state !== 'running') void ctx.resume().catch(() => undefined);
  } catch {
    return null;
  }
  return ctx;
}

// A touch, a click or a key wakes the sound (browsers start it suspended), and wakes it again
// after the phone has put it to sleep.
if (typeof window !== 'undefined') {
  for (const type of ['touchend', 'click', 'keydown'] as const) window.addEventListener(type, () => void audio(), { capture: true, passive: true });
}

interface Tone {
  /** Seconds. */
  dur?: number;
  /** Seconds from now. */
  at?: number;
  type?: OscillatorType;
  gain?: number;
  /** The pitch it ends on, as a multiple of where it starts. */
  slide?: number;
}

export function tone(freq: number, o: Tone = {}): void {
  const ac = audio();
  if (!ac || !out) return;
  const dur = o.dur ?? 0.08;
  const t = ac.currentTime + (o.at ?? 0);
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = o.type ?? 'triangle';
  osc.frequency.setValueAtTime(freq, t);
  if (o.slide) osc.frequency.exponentialRampToValueAtTime(freq * o.slide, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(o.gain ?? 0.045, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g);
  g.connect(out);
  osc.start(t);
  osc.stop(t + dur + 0.03);
}

/** A note, in semitones above C5. */
const note = (semi: number) => 523.25 * Math.pow(2, semi / 12);
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26];
/** The k-th note of the pentatonic scale from C5, held at the top of the scale. */
const step = (k: number) => note(PENTA[Math.max(0, Math.min(PENTA.length - 1, k))]);

/** A key under the finger: a tick, felt more than heard. */
export const soundKey = () => tone(1900, { type: 'sine', dur: 0.025, gain: 0.02 });
/** A digit placed: its own note, 1 the lowest. */
export const soundDigit = (d: number) => tone(step(d - 1), { dur: 0.09 });
/** A digit the board marks as wrong: a low buzz that falls. */
export const soundWrong = () => tone(150, { type: 'sawtooth', dur: 0.2, slide: 0.55, gain: 0.03 });
/** One note of a climb: a beat of a Run's show, a row of the tally. */
export const soundBeat = (k: number) => tone(step(k), { dur: 0.1 });
/** A chord on the k-th note: a sum's points, a board cleared. */
export const soundChord = (k: number, at = 0) => [k, k + 2, k + 4].forEach((s, i) => tone(step(s), { at: at + i * 0.05, dur: 0.16, gain: 0.03 }));
/** The score passing its target. */
export const soundChime = () => [7, 9, 11].forEach((s, i) => tone(step(s), { at: 0.1 + i * 0.07, dur: 0.2, gain: 0.03 }));
/** Coins counted in: a tick each, a dozen at most. */
export const soundCoins = (n: number) => {
  for (let c = 0; c < Math.min(12, n); c++) tone(2350 + c * 60, { type: 'sine', at: c * 0.055, dur: 0.05, gain: 0.02 });
};
/** A card dealt, the k-th of a hand. */
export const soundDeal = (k: number) => tone(step(2 + k), { at: (80 * k) / 1000, dur: 0.06, gain: 0.025 });
/** A card taken, lifting away. */
export const soundTake = () => tone(step(4), { dur: 0.22, slide: 1.5, gain: 0.03 });
/** Something landing in the loadout. */
export const soundLand = () => tone(step(7), { dur: 0.1 });
/** A won run: the nine rays in turn, then the chord. */
export const soundWin = () => {
  for (let k = 0; k < 9; k++) tone(step(k), { at: (k * 35) / 1000, dur: 0.16, gain: 0.028 });
  [0, 4, 7, 12].forEach((s, k) => tone(note(s), { at: 0.3 + k * 0.09, dur: 0.22, gain: 0.035 }));
};
/** The switch turned on: a note to say so. */
export const soundOn = () => tone(step(4), { dur: 0.09 });

/** Whether the board shows the digit just placed as wrong, as GameView marks it. */
function shownWrong(e: PlacementEvent): boolean {
  if (checksSolution(e.game)) return !e.correct;
  if (getSettings().mistakes === 'off') return false;
  try {
    return engineConflicts(e.puzzle, fullGrid(e.puzzle, e.game.values)).some((c) => c.cells.includes(e.cell));
  } catch {
    return false;
  }
}

/** A finished unit's wave climbs a note for each step it takes away from the digit (45 ms apart). */
function wave(e: PlacementEvent, cells: number[]) {
  const n = e.puzzle.size;
  const far = cells.reduce((m, j) => Math.max(m, cellDistance(n, e.cell, j)), 0);
  for (let d = 0; d <= far; d++) tone(step(d + 1), { at: (40 + d * 45) / 1000, dur: 0.12, gain: 0.03 });
}

onPlacement((e) => {
  if (e.source === 'reveal' || !getSettings().sound) return;
  if (shownWrong(e)) {
    soundWrong();
    return;
  }
  soundDigit(e.digit);
  if (e.game.status === 'solved') {
    wave(e, Array.from({ length: e.puzzle.size * e.puzzle.size }, (_, j) => j));
    soundChord(5, 0.5);
  } else if (e.units.length) {
    wave(e, e.units.flatMap((u) => u.cells));
  }
});
