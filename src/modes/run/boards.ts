// The five boards of a run: size, difficulty, rule mix and score par.
import { makeRng } from '../../engine';
import type { ClueKind, Difficulty, GenerateOptions, Size } from '../../engine/types';
import type { GameMods } from '../../game/types';
import { ALL_KINDS, applyCards, type BoardPlan, type Card } from './cards';
import { roundTo, sizeScale } from './scale';

export const BOARD_COUNT = 5;

export interface BoardSpec {
  size: Size;
  difficulty: Difficulty;
  /** How many clue kinds the board mixes. */
  kinds: number;
  /** Global rules (diagonal, anti-knight) can join from this board on. */
  allowGlobal: boolean;
}

/**
 * Boards 1 to 4 are 6x6 for pace and rise from difficulty 1 to 3. The final board is a 9x9 at
 * difficulty 2 with three kinds: the biggest board of the run, at about a quarter of an hour,
 * so a whole run stays near forty minutes. Its par, base score and Tight clock grow with its
 * size (see scale.ts), and Hard turn is never offered before it, so it stays one sitting long.
 */
export const BOARD_SPECS: readonly BoardSpec[] = [
  { size: 6, difficulty: 1, kinds: 2, allowGlobal: false },
  { size: 6, difficulty: 2, kinds: 2, allowGlobal: false },
  { size: 6, difficulty: 2, kinds: 3, allowGlobal: true },
  { size: 6, difficulty: 3, kinds: 3, allowGlobal: true },
  { size: 9, difficulty: 2, kinds: 3, allowGlobal: true },
];

const GLOBAL: ClueKind[] = ['diagonal', 'antiKnight'];

/** Base score of a 6x6 board by difficulty (index 0 unused). */
export const BASE_SCORE = [0, 100, 160, 240, 340, 480] as const;
/** Par time in milliseconds of a 6x6 board by difficulty (index 0 unused). */
export const PAR_MS = [0, 150_000, 210_000, 270_000, 330_000, 420_000] as const;

const level = (d: number) => Math.max(1, Math.min(5, Math.round(d)));

/** Par time for a board of a size and difficulty, to the half minute: 10:00 for a 9x9 at difficulty 3. */
export function parFor(size: number, difficulty: number): number {
  return roundTo(PAR_MS[level(difficulty)] * sizeScale(size), 30_000);
}

/** Base score for a board of a size and difficulty, to the ten: 540 for a 9x9 at difficulty 3. */
export function baseFor(size: number, difficulty: number): number {
  return Math.round((BASE_SCORE[level(difficulty)] * sizeScale(size)) / 10) * 10;
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
  const options: GenerateOptions = {
    size: spec.size,
    seed: boardSeed(runSeed, boardIndex),
    rules: rulesFor(runSeed, boardIndex),
    difficulty: spec.difficulty,
    minKinds: spec.kinds,
    maxKinds: spec.kinds,
  };
  const mods: GameMods = { hearts, shield };
  return { options, mods };
}

/** Everything a board needs to start. Plain data, so a run can be saved with it. */
export interface BoardSetup {
  index: number;
  options: GenerateOptions;
  mods: GameMods;
  /** Cards in force on this board: the pick for it, then run cards. */
  cardIds: string[];
  /** Score multiplier, 1 or more. */
  mult: number;
  parMs: number;
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
    parMs: parFor(plan.options.size, plan.options.difficulty),
  };
}
