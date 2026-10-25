// The five boards of a run: every one a 9x9, each cut to an estimated solving time that rises
// through the run, with its level, rule mix, par and base score.
import { makeRng } from '../../engine';
import type { ClueKind, Difficulty, GenerateOptions, Size } from '../../engine/types';
import type { GameMods } from '../../game/types';
import { ALL_KINDS, applyCards, type BoardPlan, type Card, type RunOptions } from './cards';
import { baseOf, parOf, type Window } from './scale';

export const BOARD_COUNT = 5;

export interface BoardSpec {
  size: Size;
  difficulty: Difficulty;
  /** How many clue kinds the board mixes. */
  kinds: number;
  /** Global rules (diagonal, anti-knight) can join from this board on. */
  allowGlobal: boolean;
  /**
   * The estimated solving time the board is cut to, in minutes for an experienced player, from the
   * engine's effort model (src/engine/effort.ts). It also sets the board's par, base and Tight clock.
   */
  minutes: Window;
}

/**
 * Every board is a 9x9, and each one asks a little more than the last: a gentle board with one
 * rule, three easy boards with two, two and three rules, then a medium final (a level is the
 * hardest technique a board needs). The time climbs from about six minutes to about twelve, a
 * minute or two a board, so a whole run is about 45 minutes for an experienced player (pace.test.ts).
 * A medium board cannot be cut much below eleven minutes, which is why only the final is medium.
 */
export const BOARD_SPECS: readonly BoardSpec[] = [
  { size: 9, difficulty: 1, kinds: 1, allowGlobal: false, minutes: [5, 6.5] },
  { size: 9, difficulty: 2, kinds: 2, allowGlobal: false, minutes: [6.5, 7.5] },
  { size: 9, difficulty: 2, kinds: 2, allowGlobal: true, minutes: [8, 9] },
  { size: 9, difficulty: 2, kinds: 3, allowGlobal: true, minutes: [9.5, 10.5] },
  { size: 9, difficulty: 3, kinds: 3, allowGlobal: true, minutes: [11.5, 12.5] },
];

const GLOBAL: ClueKind[] = ['diagonal', 'antiKnight'];

/** Base score of a board's slot in the run. Cards that make a board easier or harder never change it. */
export function baseFor(boardIndex: number): number {
  return baseOf(BOARD_SPECS[boardIndex].minutes);
}

export function boardSeed(runSeed: string, boardIndex: number): string {
  return runSeed + ':' + boardIndex;
}

/** The rule mix of a board. Same seed and index always give the same list. */
export function rulesFor(runSeed: string, boardIndex: number): ClueKind[] {
  const spec = BOARD_SPECS[boardIndex];
  const rng = makeRng(`${runSeed}:rules:${boardIndex}`);
  const lines = ALL_KINDS.filter((k) => !GLOBAL.includes(k));
  const picked: ClueKind[] = [];
  const takeFrom = (list: ClueKind[]) => {
    const left = list.filter((k) => !picked.includes(k));
    picked.push(left[Math.floor(rng() * left.length)]);
  };
  if (spec.allowGlobal && rng() < 0.4) takeFrom(GLOBAL);
  while (picked.length < spec.kinds) takeFrom(lines);
  return picked;
}

/** The plan for a board before any card touches it. */
export function basePlan(runSeed: string, boardIndex: number, hearts: number, shield: number): BoardPlan {
  const spec = BOARD_SPECS[boardIndex];
  const options: RunOptions = {
    size: spec.size,
    seed: boardSeed(runSeed, boardIndex),
    rules: rulesFor(runSeed, boardIndex),
    difficulty: spec.difficulty,
    minKinds: spec.kinds,
    maxKinds: spec.kinds,
    minutes: spec.minutes,
  };
  const mods: GameMods = { hearts, shield };
  return { options, mods };
}

/** Everything a board needs to start. Plain data, so a run can be saved with it. */
export interface BoardSetup {
  index: number;
  /** What to generate. Boards set up before every Run board was a 9x9 have no time window here. */
  options: GenerateOptions;
  mods: GameMods;
  /** Cards in force on this board: the pick for it, then run cards. */
  cardIds: string[];
  /** Score multiplier, 1 or more. */
  mult: number;
  /** The middle of the board's time window, after its cards. */
  parMs: number;
  /** The base score of the board's slot. Boards set up before every Run board was a 9x9 have none and take their slot's. */
  base?: number;
}

export function setupBoard(
  runSeed: string,
  boardIndex: number,
  hearts: number,
  shield: number,
  cards: Card[],
  mult: number,
): BoardSetup {
  const plan = applyCards(basePlan(runSeed, boardIndex, hearts, shield), cards);
  return {
    index: boardIndex,
    options: plan.options,
    mods: plan.mods,
    cardIds: cards.map((c) => c.id),
    mult,
    parMs: parOf(plan.options.minutes),
    base: baseFor(boardIndex),
  };
}
