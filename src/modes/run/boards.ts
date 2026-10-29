// The nine boards of a run: three antes of a Small, a Big and a Boss board. Every one is a 9x9
// crafted like a Daily to a window of the engine's estimated solving time (GenerateOptions.minutes),
// so a board takes about 6 to 15 minutes and the level and the time climb through the run
// (pace.test.ts holds the ladder to its windows).
import { makeRng } from '../../engine';
import type { ClueKind, Difficulty, GenerateOptions } from '../../engine/types';
import type { RunDifficulty } from './model';
import { DIFFICULTY } from './tuning';

export type BoardKind = 'small' | 'big' | 'boss';
export const KINDS: readonly BoardKind[] = ['small', 'big', 'boss'];
export const ANTES = 3;
export const SLOT_COUNT = ANTES * KINDS.length;

/** Estimated solving time, low and high end, in minutes for an experienced player. */
export type Window = [number, number];

export interface SlotSpec {
  ante: number;
  kind: BoardKind;
  difficulty: Difficulty;
  /** How many clue kinds the board mixes. */
  kinds: number;
  /** A global rule (diagonal, anti-knight) may take one of the kinds. */
  allowGlobal: boolean;
  minutes: Window;
}

/**
 * Ante 1 is gentle, gentle, easy; ante 2 easy, easy, medium; ante 3 medium, medium, hard. A hard
 * board cannot be cut much below 14 minutes with three rules, so the final boss mixes two.
 */
export const SLOT_SPECS: readonly SlotSpec[] = [
  { ante: 1, kind: 'small', difficulty: 1, kinds: 1, allowGlobal: false, minutes: [5, 6.5] },
  { ante: 1, kind: 'big', difficulty: 1, kinds: 2, allowGlobal: false, minutes: [6, 7.5] },
  { ante: 1, kind: 'boss', difficulty: 2, kinds: 2, allowGlobal: false, minutes: [7, 8.5] },
  { ante: 2, kind: 'small', difficulty: 2, kinds: 2, allowGlobal: true, minutes: [7.5, 9] },
  { ante: 2, kind: 'big', difficulty: 2, kinds: 3, allowGlobal: true, minutes: [8.5, 10] },
  { ante: 2, kind: 'boss', difficulty: 3, kinds: 2, allowGlobal: true, minutes: [11, 12.5] },
  { ante: 3, kind: 'small', difficulty: 3, kinds: 2, allowGlobal: true, minutes: [11, 12.5] },
  { ante: 3, kind: 'big', difficulty: 3, kinds: 3, allowGlobal: true, minutes: [11.5, 13] },
  { ante: 3, kind: 'boss', difficulty: 4, kinds: 2, allowGlobal: true, minutes: [13, 15] },
];

export const anteOf = (slot: number): number => Math.floor(slot / KINDS.length) + 1;

/**
 * The spec a slot's board is cut to at a difficulty: Normal's own, Easy's gentler and Hard's a
 * step on along the same ladder (DIFFICULTY.ladder). The slot keeps its own ante and kind.
 */
export function specFor(slot: number, difficulty: RunDifficulty = 'normal'): SlotSpec {
  const spec = SLOT_SPECS[DIFFICULTY.ladder[difficulty][slot] ?? slot];
  return { ...spec, ante: anteOf(slot), kind: KINDS[slot % KINDS.length] };
}
export const kindOf = (slot: number): BoardKind => KINDS[slot % KINDS.length];
export const slotOf = (ante: number, kind: BoardKind): number => (ante - 1) * KINDS.length + KINDS.indexOf(kind);
export const isBoss = (slot: number): boolean => kindOf(slot) === 'boss';

const LINES: ClueKind[] = ['thermo', 'arrow', 'cage', 'renban', 'whisper', 'kropki', 'xv'];
const GLOBAL: ClueKind[] = ['diagonal', 'antiKnight'];

export function boardSeed(runSeed: string, slot: number): string {
  return `${runSeed}:b${slot}`;
}

/** The rule mix of a board. Same seed, slot and difficulty always give the same list. */
export function rulesFor(runSeed: string, slot: number, difficulty: RunDifficulty = 'normal'): ClueKind[] {
  const spec = specFor(slot, difficulty);
  const rng = makeRng(`${runSeed}:rules:${slot}`);
  const picked: ClueKind[] = [];
  const takeFrom = (list: ClueKind[]) => {
    const left = list.filter((k) => !picked.includes(k));
    picked.push(left[Math.floor(rng() * left.length)]);
  };
  if (spec.allowGlobal && rng() < 0.4) takeFrom(GLOBAL);
  while (picked.length < spec.kinds) takeFrom(LINES);
  return picked;
}

/** What to generate for a board. A board's own cards (fog, a clock) never change it, so neither does its target. */
export function optionsFor(runSeed: string, slot: number, difficulty: RunDifficulty = 'normal'): GenerateOptions & { minutes: Window } {
  const spec = specFor(slot, difficulty);
  return {
    size: 9,
    seed: boardSeed(runSeed, slot),
    rules: rulesFor(runSeed, slot, difficulty),
    difficulty: spec.difficulty,
    minKinds: spec.kinds,
    maxKinds: spec.kinds,
    minutes: spec.minutes,
  };
}
