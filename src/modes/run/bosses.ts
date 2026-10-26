// Boss rules: one per boss board, drawn from the run seed. Fog, Mute and Clock reuse the game
// store's fog, no-notes and clock; Thief hides givens that come back as cells next to them are
// solved; Glass breaks the board on a mistake; Fish Market picks a board with a hard deduction.
import { countSolutions, makeRng } from '../../engine';
import { tierProfileAsync, type TierProfile } from '../../engine/techniques';
import type { CellIndex, GeneratedPuzzle, GenerateOptions, Puzzle, PuzzleShape } from '../../engine/types';
import { hashString } from '../../game/logic';
import { ANTES, type Window } from './boards';
import { BOSS, HEARTS } from './tuning';

export type BossRule = 'fog' | 'mute' | 'thief' | 'glass' | 'clock' | 'fish';
export const BOSS_RULES: readonly BossRule[] = ['fog', 'mute', 'thief', 'glass', 'clock', 'fish'];

export const BOSS_NAMES: Record<BossRule, string> = {
  fog: 'Fog',
  mute: 'Mute',
  thief: 'Thief',
  glass: 'Glass',
  clock: 'Clock',
  fish: 'Fish Market',
};

/** The rule in plain words. The clock names its minutes when they are known. */
export function bossText(rule: BossRule, clockMinutes?: number): string {
  switch (rule) {
    case 'fog':
      return 'The board starts under fog. A correct digit clears the cells around it.';
    case 'mute':
      return 'No notes on this board.';
    case 'thief':
      return 'Some givens are hidden. Each one comes back when a cell next to it is solved.';
    case 'glass':
      return `A mistake breaks the board: ${HEARTS.glass} hearts lost and no reward.`;
    case 'clock':
      return clockMinutes ? `The board ends when its ${clockMinutes} minutes run out.` : 'The board ends when its clock runs out.';
    case 'fish':
      return `The board hides an X-Wing or harder, and those placements score ×${BOSS.fishMult}.`;
  }
}

/**
 * The boss rule of each ante: three different rules. Fish Market needs a hard board, so it can
 * only be the last boss.
 */
export function bossesFor(runSeed: string): BossRule[] {
  const rng = makeRng(`${runSeed}:bosses`);
  const out: BossRule[] = [];
  const last = BOSS_RULES[Math.floor(rng() * BOSS_RULES.length)];
  const rest = BOSS_RULES.filter((r) => r !== last && r !== 'fish');
  for (let a = 0; a < ANTES - 1; a++) {
    const k = Math.floor(rng() * rest.length);
    out.push(rest.splice(k, 1)[0]);
  }
  out.push(last);
  return out;
}

/** The clock of a board: the high end of its time window times BOSS.clock, to the whole minute. */
export function clockMs(minutes: Window): number {
  return Math.ceil(minutes[1] * BOSS.clock) * 60_000;
}

/** Placements of tier BOSS.fishTier or harder a strong player makes on the board. */
export function fishIn(profile: TierProfile, tier: number = BOSS.fishTier): number {
  return profile.expert.slice(tier).reduce((a, b) => a + b, 0);
}

export interface FishPick {
  puzzle: GeneratedPuzzle;
  profile: TierProfile;
  /** Which try it was, 0 for the board's own seed. */
  attempt: number;
}

/**
 * Fish Market's board: the board's own seed first, then up to BOSS.fishTries seeds in a fixed
 * order, taking the first whose expert profile holds a tier 6 or harder deduction. When none does,
 * the try with the most (the first on a tie) is kept, so a run always has its board.
 */
export async function pickFishBoard(
  base: GenerateOptions,
  load: (o: GenerateOptions) => Promise<GeneratedPuzzle>,
  profileOf: (p: Puzzle) => TierProfile | Promise<TierProfile> = tierProfileAsync,
  tries: number = BOSS.fishTries,
): Promise<FishPick> {
  let best: FishPick | null = null;
  let bestFish = -1;
  for (let k = 0; k < tries; k++) {
    const options = k ? { ...base, seed: `${base.seed}:fish${k}` } : base;
    let puzzle: GeneratedPuzzle;
    try {
      puzzle = await load(options);
    } catch {
      continue;
    }
    const profile = await profileOf(puzzle);
    const fish = fishIn(profile);
    if (fish > bestFish) {
      best = { puzzle, profile, attempt: k };
      bestFish = fish;
    }
    if (fish > 0) break;
  }
  if (!best) throw new Error('No board for the Fish Market');
  return best;
}

const unique = (shape: PuzzleShape) => countSolutions(shape, 2) === 1;

/**
 * Thief's hidden givens: up to `count` of them, in an order fixed by the board, at least
 * BOSS.thiefSpacing cells apart, each taken only if the board still has a single solution
 * without it.
 */
export function thiefCells(p: Puzzle, count: number = BOSS.thief, isUnique: (shape: PuzzleShape) => boolean = unique): CellIndex[] {
  const n = p.size;
  const far = (a: number, b: number) => Math.max(Math.abs(Math.floor(a / n) - Math.floor(b / n)), Math.abs((a % n) - (b % n))) >= BOSS.thiefSpacing;
  const order = p.givens
    .map((d, i) => (d ? i : -1))
    .filter((i) => i >= 0)
    .sort((a, b) => hashString(`${p.seed}:thief:${a}`) - hashString(`${p.seed}:thief:${b}`));
  const taken: CellIndex[] = [];
  const givens = p.givens.slice();
  for (const c of order) {
    if (taken.length >= count) break;
    if (!taken.every((t) => far(t, c))) continue;
    givens[c] = 0;
    if (isUnique({ ...p, givens })) taken.push(c);
    else givens[c] = p.givens[c];
  }
  return taken.sort((a, b) => a - b);
}

/** The board as Thief deals it: the hidden givens taken out. */
export function withStolen(p: Puzzle, stolen: readonly CellIndex[]): Puzzle {
  if (!stolen.length) return p;
  return { ...p, id: `${p.id}-thief`, givens: p.givens.map((d, i) => (stolen.includes(i) ? 0 : d)) };
}

/** Hidden givens next to cell i (the eight around it), which come back when i is solved. */
export function returning(n: number, stolen: readonly CellIndex[], i: CellIndex): CellIndex[] {
  const r = Math.floor(i / n);
  const c = i % n;
  return stolen.filter((s) => s !== i && Math.max(Math.abs(Math.floor(s / n) - r), Math.abs((s % n) - c)) === 1);
}
