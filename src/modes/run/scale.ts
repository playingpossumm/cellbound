// How a board's time window sets a run's numbers. Every Run board is cut to an estimated solving
// time for an experienced player (BoardSpec.minutes, from the engine's effort model), so the
// window already says how much work a board is: par is its middle, the Tight clock a minute more,
// and the base score is 30 points a minute. Kept apart from boards.ts and cards.ts, which both use it.

/** Estimated solving time, low and high end, in minutes. */
export type Window = [number, number];

/** Base score for every minute a board is cut to take. */
export const POINTS_PER_MINUTE = 30;

const tenth = (x: number) => Math.round(x * 10) / 10;

export function middle(w: Window): number {
  return (w[0] + w[1]) / 2;
}

/** ms rounded to the nearest step, never below one step. */
export function roundTo(ms: number, step: number): number {
  return Math.max(step, Math.round(ms / step) * step);
}

/** Par: the middle of the window, to the half minute. */
export function parOf(w: Window): number {
  return roundTo(middle(w) * 60_000, 30_000);
}

/** The Tight clock: a minute more than par, up to the whole minute. */
export function clockOf(w: Window): number {
  return Math.ceil(parOf(w) / 60_000 + 1) * 60_000;
}

/** Base score: 30 points a minute of the middle of the window, to the ten. */
export function baseOf(w: Window): number {
  return Math.round((middle(w) * POINTS_PER_MINUTE) / 10) * 10;
}

/** The window stretched (f above 1) or shrunk (f below 1), to the tenth of a minute. */
export function scaleWindow(w: Window, f: number): Window {
  return [tenth(w[0] * f), tenth(w[1] * f)];
}
