// Technique classification for Run scoring. CONTRACT: the Run mode builds
// against these types and exports; changes are additive only. The detector
// itself lives in ladder.ts (the cascade, classify and profile) and
// patterns.ts (tiers 4 to 8).
import { classifyJob, hardestJob, profileJob } from './client';
import { classify, classifyHardest, profile, type Classified } from './ladder';
import type { CellIndex, ClueKind, Digit, Puzzle } from './types';

/** 0 means nothing in the library proves the cell yet: a guess, or logic beyond the library. */
export type TechniqueTier = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export type TechniqueId =
  | 'unproven'
  | 'fullHouse'
  | 'nakedSingle'
  | 'hiddenSingle'
  | 'clueSingle'
  | 'lockedCandidates'
  | 'cageRule'
  | 'nakedPair'
  | 'hiddenPair'
  | 'nakedTriple'
  | 'hiddenTriple'
  | 'xWing'
  | 'skyscraper'
  | 'kite'
  | 'swordfish'
  | 'xyWing'
  | 'xyzWing'
  | 'wWing'
  | 'chain'
  | 'forcing';

/** Tier and display name of every technique. */
export const TECHNIQUES: Readonly<Record<TechniqueId, { tier: TechniqueTier; name: string }>> = {
  unproven: { tier: 0, name: 'Guess' },
  fullHouse: { tier: 1, name: 'Full house' },
  nakedSingle: { tier: 1, name: 'Single' },
  hiddenSingle: { tier: 2, name: 'Hidden single' },
  clueSingle: { tier: 3, name: 'Clue' },
  lockedCandidates: { tier: 4, name: 'Pointing' },
  cageRule: { tier: 4, name: 'Cage rule' },
  nakedPair: { tier: 5, name: 'Pair' },
  hiddenPair: { tier: 5, name: 'Hidden pair' },
  nakedTriple: { tier: 5, name: 'Triple' },
  hiddenTriple: { tier: 5, name: 'Hidden triple' },
  xWing: { tier: 6, name: 'X-Wing' },
  skyscraper: { tier: 6, name: 'Skyscraper' },
  kite: { tier: 6, name: 'Kite' },
  swordfish: { tier: 7, name: 'Swordfish' },
  xyWing: { tier: 7, name: 'XY-Wing' },
  xyzWing: { tier: 7, name: 'XYZ-Wing' },
  wWing: { tier: 7, name: 'W-Wing' },
  chain: { tier: 8, name: 'Chain' },
  forcing: { tier: 8, name: 'Forcing chain' },
};

export interface PlacementClass {
  tier: TechniqueTier;
  technique: TechniqueId;
  /** Display name, for example "X-Wing". */
  name: string;
  /** Cells that carried the deduction, for highlighting. */
  focus: CellIndex[];
  /**
   * Present on clue singles only: the kind of clue that forced the placement, for clue
   * lenses. 'kropki' also covers a pair with no dot when every dot is drawn.
   */
  clue?: ClueKind;
}

/** Expected placements per tier (index 0 to 8) when solving the board, for score targets. */
export interface TierProfile {
  /** A competent player taking easy deductions as they come. */
  typical: number[];
  /** A strong player playing hard deductions while they are still hard. */
  expert: number[];
}

function result(p: Puzzle, c: Classified): PlacementClass {
  const out: PlacementClass = {
    technique: c.technique,
    tier: TECHNIQUES[c.technique].tier,
    name: TECHNIQUES[c.technique].name,
    focus: c.focus,
  };
  if (c.clue !== undefined) out.clue = c.clue >= 0 ? p.clues[c.clue].kind : 'kropki';
  return out;
}

/**
 * The simplest technique that proves `digit` at `cell`, judged on the board before the
 * placement. `values` is the full grid (givens plus entries) before the placement, and
 * the player's notes play no part. Call it only for correct placements. Pure.
 *
 * For tiers 1 to 7 the tier is the smallest L such that applying every technique of tier
 * at most L, over and over, leaves the cell with only that digit; the technique is the
 * last deduction of tier L before that, and focus its cells. Tier 8 is held to a human
 * scale and must prove the cell itself: from the board closed at tier 7, one chain of at
 * most TIER8.links links leaves the cell with only its digit, or one forcing chain does
 * (a cell with two or three candidates, each of which within TIER8.rounds rounds breaks a
 * rule or puts the digit there; see patterns.ts). Nothing cascades after it, so a player
 * who finds the chain places its target and gets the consequences later as easier
 * placements. Anything else is a guess, tier 0. Entries that disagree with the solution are ignored, and a digit
 * that is not the solution is never proven. Limits count links and rounds, never time, so
 * the answer is the same on every device, and a cell once proven stays proven as correct
 * digits are added. On a 9x9 it usually takes well under a millisecond and at most tens
 * of milliseconds, so the UI should use the async form.
 */
export function classifyPlacement(p: Puzzle, values: Digit[], cell: CellIndex, digit: Digit): PlacementClass {
  return result(p, classify(p, values, cell, digit));
}

/** Async front door; runs on a worker when there is one. Same contract and answer as classifyPlacement. */
export async function classifyPlacementAsync(
  p: Puzzle,
  values: Digit[],
  cell: CellIndex,
  digit: Digit,
): Promise<PlacementClass> {
  return result(p, await classifyJob(p, values, cell, digit));
}

/**
 * The hardest technique that proves `digit` at `cell`, for the Run's Microscope: a placement that
 * more than one technique proves scores as the hardest. It looks on the board where
 * classifyPlacement found its answer, closed one tier below it, and a technique up to tier 7 counts
 * when one deduction of it leaves the cell with only that digit, or the digit with only that cell
 * in one of its houses. A cell that singles prove is looked at on the candidates the placed digits
 * leave, where only a hidden single or a clue can stand in for the single: patterns wait for the
 * singles, as on the ladder. The last open cell of a house stays a full house, and tier 8 is left
 * out, since a chain can stand in for any pattern. Never below classifyPlacement's answer, which
 * it keeps for a guess and for a placement only a chain or a forcing chain proves. Same arguments,
 * also pure and deterministic.
 */
export function hardestPlacement(p: Puzzle, values: Digit[], cell: CellIndex, digit: Digit): PlacementClass {
  return result(p, classifyHardest(p, values, cell, digit));
}

/** Async form of hardestPlacement; runs on a worker when there is one. Same answer. */
export async function hardestPlacementAsync(p: Puzzle, values: Digit[], cell: CellIndex, digit: Digit): Promise<PlacementClass> {
  return result(p, await hardestJob(p, values, cell, digit));
}

/**
 * Expected tier mix for solving the board from its givens. Deterministic for a puzzle.
 * Both players are simulated by the same ladder as classifyPlacement: the typical player
 * always places the easiest cell available, the expert the hardest one available, so its
 * hard placements count before they turn easy. Each array has 9 entries (tiers 0 to 8)
 * and sums to the number of empty cells.
 */
export function tierProfile(p: Puzzle): TierProfile {
  return profile(p);
}

/** Async form of tierProfile; runs on a worker when there is one. Same answer. */
export async function tierProfileAsync(p: Puzzle): Promise<TierProfile> {
  return profileJob(p);
}
