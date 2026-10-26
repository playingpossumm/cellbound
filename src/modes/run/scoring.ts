// Scoring one correct placement. Chips come from the tier of the technique that proves it (plus
// its Spectra levels); mult starts at 1, gains 1 for each unit and clue the digit finishes, then
// is multiplied by the flow, by every unit finished clean and by the technique boosts; the lenses
// fire in slot order; the all-scoring multipliers come last. Points are chips times mult,
// rounded, plus any flat points. Pure, so the popup, the tally and the tests share one sum.
import type { TechniqueId, TechniqueTier } from '../../engine/techniques';
import type { ClueKind, Digit } from '../../engine/types';
import type { BossRule } from './bosses';
import { effectiveLens, flowCapOf, type LensCtx } from './lenses';
import type { LensSlot, RewardId } from './model';
import { BOSS, CHIPS, CLEAN, FLOW, REWARD, SPECTRA_CHIPS } from './tuning';

export interface PlacementFacts {
  tier: TechniqueTier;
  technique: TechniqueId;
  digit: Digit;
  /**
   * player: the player's own digit. hint: placed by a hint, or typed while a hint pointed at it;
   * it scores nothing and ends the streak. reveal: filled in by a card or a rule; it scores
   * nothing and leaves the streak alone.
   */
  source: 'player' | 'hint' | 'reveal';
  /** Rows, columns and boxes the digit finished for the first time on this board. */
  units: number;
  /** How many of those it finished clean. */
  clean: number;
  /** Clues the digit finished, with a cage's total. */
  clues: { kind: ClueKind; total: number }[];
  /** On a clue single, the kind of clue that forced it. */
  clue?: ClueKind;
  /** The cell shares a row, column or box with the last scored placement. */
  inLine: boolean;
}

/** What the run brings to a placement's score. */
export interface ScoreSetup {
  /** Spectra level per tier. */
  levels: readonly number[];
  perks: Partial<Record<RewardId, number>>;
  lenses: readonly LensSlot[];
  hearts: number;
  /** The boss rule in force on the board. */
  rule: BossRule | null;
}

/** The streak behind the flow, and the Cascade chain. */
export interface Streak {
  streak: number;
  chain: number;
}

export interface PlacementScore {
  points: number;
  chips: number;
  /** The final mult, all multipliers in. */
  mult: number;
  /** The flow this placement scored at. */
  flow: number;
  /** Points added after chips times mult (Expert Pay). */
  flat: number;
  /** Lens slots that fired, in slot order. */
  fired: number[];
  next: Streak;
}

const perk = (s: ScoreSetup, id: RewardId) => s.perks[id] ?? 0;

/** The flow a placement scores at, from the streak before it. */
export function flowOf(streak: number, setup: Pick<ScoreSetup, 'perks' | 'lenses'>): number {
  const step = (setup.perks.hotStreak ?? 0) > 0 ? FLOW.hotStep : FLOW.step;
  return Math.min(flowCapOf(setup.lenses), round2(1 + step * Math.max(0, streak)));
}

/** Chips for a tier at its Spectra level. */
export function chipsFor(tier: number, levels: readonly number[]): number {
  return (CHIPS[tier] ?? 0) + (SPECTRA_CHIPS[tier] ?? 0) * (levels[tier] ?? 0);
}

/** The multiplier on all scoring: Prism Shards and Glass Hearts. */
export function allScoringOf(perks: Partial<Record<RewardId, number>>): number {
  return round2(1 + REWARD.prismShard * (perks.prismShard ?? 0) + REWARD.glassHeart * (perks.glassHeart ?? 0));
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

const nothing = (next: Streak): PlacementScore => ({ points: 0, chips: 0, mult: 0, flow: 1, flat: 0, fired: [], next });

export function scorePlacement(f: PlacementFacts, s: ScoreSetup, at: Streak): PlacementScore {
  if (f.source === 'reveal') return nothing(at);
  if (f.source === 'hint' || f.tier === 0) return nothing({ streak: 0, chain: 0 });

  let chips = chipsFor(f.tier, s.levels);
  let mult = 1 + f.units + f.clues.length;
  const flow = flowOf(at.streak, s);
  mult *= flow;
  mult *= (perk(s, 'cleanSweep') ? CLEAN.sweep : CLEAN.mult) ** f.clean;
  if (perk(s, 'fishbowl') && (f.tier === 6 || f.tier === 7)) mult *= REWARD.fishbowl;
  if (s.rule === 'fish' && f.tier >= BOSS.fishTier) mult *= BOSS.fishMult;
  const chain = perk(s, 'cascade') && f.inLine ? at.chain + 1 : 0;
  if (chain) mult *= 1 + REWARD.cascade * chain;

  const ctx: LensCtx = {
    tier: f.tier,
    technique: f.technique,
    digit: f.digit,
    units: f.units,
    clean: f.clean,
    clues: f.clues,
    clue: f.clue,
    flow,
    flowFull: flow >= flowCapOf(s.lenses),
    hearts: s.hearts,
  };
  const fired: number[] = [];
  s.lenses.forEach((_, k) => {
    const e = effectiveLens(s.lenses, k);
    const fx = e?.def.score?.(ctx, e.slot);
    if (!fx) return;
    chips += fx.chips ?? 0;
    mult += fx.mult ?? 0;
    mult *= fx.xmult ?? 1;
    fired.push(k);
  });
  mult *= allScoringOf(s.perks);

  const flat = f.tier >= REWARD.expertTier ? REWARD.expertPay * perk(s, 'expertPay') : 0;
  mult = round2(mult);
  return { points: Math.round(chips * mult) + flat, chips, mult, flow, flat, fired, next: { streak: at.streak + 1, chain } };
}
