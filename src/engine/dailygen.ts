// Makes a Daily from scratch: the generators the stored months were made
// with, and the fallback for months that are not stored. The app loads this
// module only for such a month, so its main bundle does not carry the 9x9
// crafting code.
import { craftDaily } from './craft';
import { dailyName, dailySpec, isNineDaily, legacySpec } from './daily';
import { boxDims, generatePuzzle } from './generator';
import type { Puzzle } from './types';

/** Generates the daily for a date from scratch. Deterministic. */
export function generateDaily(date: string): Puzzle {
  if (!isNineDaily(date)) return generateLegacy(date);
  const spec = dailySpec(date);
  const [lo, hi] = spec.minutes!;
  const b = craftDaily(`daily:${date}`, { difficulty: spec.difficulty, kinds: spec.rules, seconds: [lo * 60, hi * 60] });
  return {
    id: `daily-${date}`,
    seed: `daily:${date}`,
    size: 9,
    ...boxDims(9),
    givens: b.givens,
    solution: b.solution,
    clues: b.clues,
    difficulty: b.difficulty,
    score: b.score,
    name: dailyName(date),
  };
}

/** The Dailies before NINE_FROM, exactly as they were generated. */
function generateLegacy(date: string): Puzzle {
  const spec = legacySpec(date);
  let best: Puzzle | null = null;
  for (let k = 0; k < 6; k++) {
    const p = generatePuzzle({
      size: spec.size,
      seed: k ? `daily:${date}#${k}` : `daily:${date}`,
      rules: spec.rules,
      difficulty: spec.difficulty,
      minKinds: spec.minKinds,
      maxKinds: spec.maxKinds,
    });
    if (!best || Math.abs(p.difficulty - spec.difficulty) < Math.abs(best.difficulty - spec.difficulty)) best = p;
    if (p.difficulty === spec.difficulty) break;
  }
  return { ...best!, id: `daily-${date}`, seed: `daily:${date}`, name: dailyName(date) };
}
