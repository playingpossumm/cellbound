// Getting a board's puzzle: one cache so re-entering a board never regenerates it, and a
// fixed ladder of retries so a generator failure cannot strand a run. The ladder is the
// same for everyone, so a daily run still gives every player the same boards.
import { fogFor } from '../../engine';
import { generateAsync } from '../../engine/client';
import type { GeneratedPuzzle, GenerateOptions } from '../../engine/types';
import type { FogSpec } from '../../engine/types';

type Generator = (o: GenerateOptions) => Promise<GeneratedPuzzle>;

/** The attempts to make, in order, for one board. */
export function attemptsFor(o: GenerateOptions): GenerateOptions[] {
  const easier = Math.max(1, o.difficulty - 1) as GenerateOptions['difficulty'];
  return [
    o,
    { ...o, seed: o.seed + ':b' },
    { ...o, seed: o.seed + ':c', difficulty: easier },
    { ...o, seed: o.seed + ':d', difficulty: easier, hiddenCageTotals: false },
    // A single rule, then classic rules, so a board always loads even if a rule mix cannot be built.
    { ...o, seed: o.seed + ':e', rules: o.rules.slice(0, 1), minKinds: 1, maxKinds: 1, difficulty: easier, hiddenCageTotals: false },
    { ...o, seed: o.seed + ':f', rules: [], minKinds: undefined, maxKinds: undefined, difficulty: easier, hiddenCageTotals: false },
  ];
}

export async function generateWithFallback(o: GenerateOptions, gen: Generator = generateAsync): Promise<GeneratedPuzzle> {
  let last: unknown;
  for (const attempt of attemptsFor(o)) {
    try {
      return await gen(attempt);
    } catch (e) {
      last = e;
    }
  }
  throw last instanceof Error ? last : new Error('Could not build the board');
}

const cache = new Map<string, Promise<GeneratedPuzzle>>();

export function loadBoard(o: GenerateOptions, gen: Generator = generateAsync): Promise<GeneratedPuzzle> {
  const key = JSON.stringify(o);
  let p = cache.get(key);
  if (!p) {
    p = generateWithFallback(o, gen);
    cache.set(key, p);
    p.catch(() => cache.delete(key));
  }
  return p;
}

/** Fog layout for a board that asked for fog: the generator's, or the engine default. */
export function fogOf(o: GenerateOptions, puzzle: GeneratedPuzzle): FogSpec | undefined {
  if (!o.fog) return undefined;
  return puzzle.fog ?? fogFor(puzzle);
}

/** The key the game store saves a board under. Unique per attempt, so a replay starts clean. */
export function gameKey(seed: string, index: number, createdAt: number): string {
  return `run:${seed.replace(/^run:/, '')}:${index}@${createdAt.toString(36)}`;
}
