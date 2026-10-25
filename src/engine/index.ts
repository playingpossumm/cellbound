// Engine API: pure TypeScript, no React. The UI calls the heavy parts through
// the worker client in client.ts.
import { findConflicts } from './conflicts';
import { craftPuzzle } from './craft';
import { dailyPuzzleFor } from './daily';
import { fogLayout } from './fog';
import { generatePuzzle } from './generator';
import { hintFor } from './hint';
import { makeRng as seededRng } from './rng';
import { candidatesFor, countSolutionsShape, solveShape } from './solver';
import type {
  Conflict,
  Digit,
  FogSpec,
  GeneratedPuzzle,
  GenerateOptions,
  HintStep,
  Puzzle,
  PuzzleShape,
} from './types';

export * from './types';
export { gradeShape as grade } from './logic';
export { dailySpec } from './daily';
export { CONSTELLATIONS } from './constellations';

/** Deterministic PRNG from a string seed, returning floats in [0, 1). */
export function makeRng(seed: string): () => number {
  return seededRng(seed);
}

/**
 * Generate a puzzle. Synchronous; the UI calls it through the worker client. A 9x9 with a time
 * window (opts.minutes) is crafted to it; anything else comes from the generator.
 */
export function generate(opts: GenerateOptions): GeneratedPuzzle {
  const p: GeneratedPuzzle = opts.minutes && opts.size === 9 ? craftPuzzle(opts) : generatePuzzle(opts);
  if (opts.fog && !p.fog) p.fog = fogFor(p);
  return p;
}

/** Count solutions up to limit. */
export function countSolutions(p: PuzzleShape, limit = 2): number {
  return countSolutionsShape(p, limit);
}

/** The unique solution, or null when there is none (or more than one). */
export function solve(p: PuzzleShape): Digit[] | null {
  return solveShape(p);
}

/** Rule breaks among filled cells. values is the full grid (givens plus entries). */
export function conflicts(p: Puzzle, values: Digit[]): Conflict[] {
  return findConflicts(p, values);
}

/** Candidate bitmask per cell (bit d set means d is still possible). */
export function candidates(p: Puzzle, values: Digit[]): number[] {
  return candidatesFor(p, values);
}

/** One deduction as three escalating steps, or null when none is found. */
export function hint(p: Puzzle, values: Digit[], notes?: number[]): HintStep[] | null {
  return hintFor(p, values, notes);
}

/** Local calendar date as YYYY-MM-DD. */
export function dailyDate(d: Date = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** The shared puzzle for a date. Async because the real engine lazy-loads precomputed months. */
export async function dailyPuzzle(date: string): Promise<Puzzle> {
  return dailyPuzzleFor(date);
}

export function dailyRunSeed(date: string): string {
  return `run:${date}`;
}

/** Fog layout for a puzzle. */
export function fogFor(p: Puzzle): FogSpec {
  return fogLayout(p);
}
