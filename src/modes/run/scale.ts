// How a board's size scales a run's numbers. A board is about as much work as its cell count, so
// a 9x9 counts as 2.25 boards of 6x6: its par time, its base score and the Tight clock all grow
// by that much. Kept apart from boards.ts and cards.ts, which both use it.

/** A board's work relative to a 6x6: 1 for a 6x6, 2.25 for a 9x9. */
export function sizeScale(size: number): number {
  return (size * size) / 36;
}

/** ms rounded to the nearest step, never below one step. */
export function roundTo(ms: number, step: number): number {
  return Math.max(step, Math.round(ms / step) * step);
}
