// How a placement's sum plays out in the score band, from its tally (live.ts). Pure, so the band,
// the lens row and the tests read one plan.
import type { TallyFx } from './live';

/** A placement of this tier or harder plays the whole show in the band. */
export const SHOW_TIER = 5;

/** One step of the show: what the sum shows, and when, from the moment it appears. */
export interface Beat {
  at: number;
  marks: number;
  mult: number | null;
  points: boolean;
}

/**
 * How a placement's sum plays out (the Motion Lab's Lively). Most placements show marks, mult and
 * points at once, their lenses fire 60 ms apart and their points fly from the popup. A pair or
 * harder plays beat by beat, 300 ms apart: the marks, the mult, each lens that fired, what scales
 * all scoring, then the points, which fly from the band. Without motion there are no beats.
 */
export function planOf(t: TallyFx, motion: boolean) {
  const full = motion && t.tier >= SHOW_TIER;
  if (!full) return { full, beats: [] as Beat[], lensAt: (k: number) => k * 60, hold: 700, flyAt: 0 };
  const sums: Omit<Beat, 'at'>[] = [
    { marks: t.base.marks, mult: null, points: false },
    { marks: t.base.marks, mult: t.base.mult, points: false },
    ...t.steps.map((s) => ({ marks: s.marks, mult: s.mult, points: false })),
  ];
  const last = sums[sums.length - 1];
  if (last.marks !== t.marks || last.mult !== t.mult) sums.push({ marks: t.marks, mult: t.mult, points: false });
  sums.push({ marks: t.marks, mult: t.mult, points: true });
  const beats = sums.map((b, i) => ({ ...b, at: 240 + i * 300 }));
  const lensAt = (k: number) => 240 + (2 + k) * 300;
  return { full, beats, lensAt, hold: lensAt(Math.max(0, t.steps.length - 1)) + 600, flyAt: beats[beats.length - 1].at + 420 };
}
