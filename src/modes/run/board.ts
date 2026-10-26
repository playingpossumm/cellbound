// Getting a board ready: its puzzle (from one cache, so re-entering a board never regenerates it,
// with a fixed ladder of retries so a generator failure cannot strand a run), its target from the
// engine's tier profile, and what its boss rule needs: Fish Market's board, Thief's hidden givens.
// The ladder of retries is the same for everyone, so a daily run gives every player the same boards.
import { fogFor } from '../../engine';
import { generateAsync } from '../../engine/client';
import { tierProfileAsync, type TierProfile } from '../../engine/techniques';
import type { FogSpec, GeneratedPuzzle, GenerateOptions, Puzzle, PuzzleShape } from '../../engine/types';
import { optionsFor } from './boards';
import { pickFishBoard, thiefCells } from './bosses';
import type { RunState } from './model';
import { ruleOf } from './state';
import { targetFor } from './targets';

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

/** A board ready to show and to play. */
export interface Prepared {
  slot: number;
  puzzle: GeneratedPuzzle;
  profile: TierProfile;
  target: number;
  /** Thief's hidden givens. */
  stolen: number[];
}

export interface PrepareDeps {
  gen?: Generator;
  profileOf?: (p: Puzzle) => TierProfile | Promise<TierProfile>;
  isUnique?: (shape: PuzzleShape) => boolean;
}

const prepared = new Map<string, Promise<Prepared>>();

/** Builds a slot's board and works out its target. Same run seed and slot, same board, same target. */
export function prepareBoard(run: Pick<RunState, 'seed' | 'bosses'>, slot: number, deps: PrepareDeps = {}): Promise<Prepared> {
  const key = `${run.seed}|${slot}|${run.bosses.join(',')}`;
  const ready = deps.gen || deps.profileOf || deps.isUnique ? undefined : prepared.get(key);
  if (ready) return ready;
  const job = (async (): Promise<Prepared> => {
    const options = optionsFor(run.seed, slot);
    const rule = ruleOf(run, slot);
    const load = (o: GenerateOptions) => loadBoard(o, deps.gen);
    // The profile runs on the engine's worker, so the screen never waits for it.
    const profileOf = deps.profileOf ?? tierProfileAsync;
    let puzzle: GeneratedPuzzle;
    let profile: TierProfile;
    if (rule === 'fish') ({ puzzle, profile } = await pickFishBoard(options, load, profileOf));
    else {
      puzzle = await load(options);
      profile = await profileOf(puzzle);
    }
    const stolen = rule === 'thief' ? thiefCells(puzzle, undefined, deps.isUnique) : [];
    return { slot, puzzle, profile, target: targetFor(slot, profile), stolen };
  })();
  if (!deps.gen && !deps.profileOf && !deps.isUnique) {
    prepared.set(key, job);
    job.catch(() => prepared.delete(key));
  }
  return job;
}

/** The fog over a board played in fog: the engine's layout for this very board, so its target stands. */
export function fogOf(puzzle: Puzzle): FogSpec {
  return fogFor(puzzle);
}

/** The key the game store saves a board under. Unique per run, so a replay starts clean. */
export function gameKey(seed: string, slot: number, createdAt: number): string {
  return `run2:${seed.replace(/^run:/, '')}:${slot}@${createdAt.toString(36)}`;
}
