// Score targets. A board's target is the marks a typical player's tier mix earns on it (the
// engine's tierProfile times the marks table), scaled by the board's kind and its ante, so it
// follows the board itself: a harder board asks for more. All the factors live in tuning.ts.
import type { TierProfile } from '../../engine/techniques';
import { anteOf, kindOf } from './boards';
import type { RunDifficulty } from './model';
import { DIFFICULTY, MARKS, TARGET } from './tuning';

/** Marks that a count of placements per tier earns toward a target, at Spectra level 0, tiers above TARGET.tierCap counted at its marks. */
export function marksOfTiers(counts: readonly number[], cap: number = TARGET.tierCap): number {
  return counts.reduce((sum, k, t) => sum + Math.max(0, k) * (MARKS[Math.min(t, cap)] ?? 0), 0);
}

/** The factor a slot puts on the typical marks: its kind, then the growth of every ante past the first. */
export function slotFactor(slot: number): number {
  return TARGET.scale * TARGET.kind[kindOf(slot)] * TARGET.anteGrowth ** (anteOf(slot) - 1);
}

/** A round number to aim at: to the 10 under 1,000, the 50 under 10,000, then the 100. */
export function roundTarget(x: number): number {
  const step = x < 1000 ? 10 : x < 10_000 ? 50 : 100;
  return Math.max(step, Math.round(x / step) * step);
}

/** A board's target: its typical marks times the slot's factor and the run's difficulty. */
export function targetFor(slot: number, profile: TierProfile, difficulty: RunDifficulty = 'normal'): number {
  return roundTarget(marksOfTiers(profile.typical) * slotFactor(slot) * DIFFICULTY.target[difficulty]);
}
