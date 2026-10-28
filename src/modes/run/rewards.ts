// Reward cards: one is picked after every cleared board (and from a skipped board's tag). A card
// either acts at once (a heart, coins, hints) or stays for the run as a perk. Bargains pay for
// their boon with a cost. Every card is data plus a pure effect on the run.
import type { Category, OfferKind, Rarity, RewardId, RunState, UnlockId } from './model';
import { maxHeartsOf } from './lenses';
import { FLOW, HEARTS, REWARD } from './tuning';

export interface RewardDef {
  id: RewardId;
  name: string;
  /** One line, plain English. */
  text: string;
  /** A bargain's cost, in one line. */
  cost?: string;
  category: Category;
  rarity: Rarity;
  unlock?: UnlockId;
  /** The technique tiers the card reads, so offers lean on what the run has placed. Absent for the rest. */
  tiers?: readonly number[];
  /** A perk stays for the run, and up to this many can stack. Absent for a card that acts once. */
  stack?: number;
  /** False when the card could do nothing now, so it is not offered. */
  usable?(run: RunState, kind: OfferKind): boolean;
  apply(run: RunState): RunState;
}

const owned = (run: RunState, id: RewardId) => run.perks[id] ?? 0;
const addPerk = (run: RunState, id: RewardId): RunState => ({ ...run, perks: { ...run.perks, [id]: owned(run, id) + 1 } });
const heal = (run: RunState, by: number): RunState => ({ ...run, hearts: Math.max(0, Math.min(maxHeartsOf(run), run.hearts + by)) });
const pct = (x: number) => `${Math.round(x * 100)}%`;

export const REWARDS: readonly RewardDef[] = [
  // Hearts
  {
    id: 'mend',
    name: 'Mend',
    text: 'Gain a heart.',
    category: 'hearts',
    rarity: 'common',
    usable: (run) => run.hearts < maxHeartsOf(run),
    apply: (run) => heal(run, 1),
  },
  {
    id: 'bigHeart',
    name: 'Big Heart',
    text: 'One more heart slot, and a heart to fill it.',
    category: 'hearts',
    rarity: 'uncommon',
    usable: (run) => run.maxHearts < HEARTS.max,
    apply: (run) => heal({ ...run, maxHearts: Math.min(HEARTS.max, run.maxHearts + 1) }, 1),
  },
  {
    id: 'shield',
    name: 'Shield',
    text: 'Your next mistake costs nothing.',
    category: 'hearts',
    rarity: 'common',
    usable: (run) => run.shield < HEARTS.maxShield,
    apply: (run) => ({ ...run, shield: Math.min(HEARTS.maxShield, run.shield + 1) }),
  },
  {
    id: 'secondWind',
    name: 'Second Wind',
    text: 'Once a run, losing your last heart leaves you one.',
    category: 'hearts',
    rarity: 'rare',
    stack: 1,
    usable: (run) => !run.secondWindUsed,
    apply: (run) => addPerk(run, 'secondWind'),
  },
  {
    id: 'lifeLink',
    name: 'Life Link',
    text: 'A box finished clean heals a heart.',
    category: 'hearts',
    rarity: 'uncommon',
    stack: 1,
    apply: (run) => addPerk(run, 'lifeLink'),
  },
  {
    id: 'insurance',
    name: 'Insurance',
    text: `A mistake costs ${REWARD.insurance} coins instead of a heart, while you have them.`,
    category: 'hearts',
    rarity: 'uncommon',
    stack: 1,
    apply: (run) => addPerk(run, 'insurance'),
  },

  // Hints
  {
    id: 'lantern',
    name: 'Lantern',
    text: `+${REWARD.lantern} hints for the run.`,
    category: 'hints',
    rarity: 'common',
    apply: (run) => ({ ...run, hintPool: run.hintPool + REWARD.lantern }),
  },
  {
    id: 'peek',
    name: 'Peek',
    text: 'Every board starts with one more cell filled in.',
    category: 'hints',
    rarity: 'common',
    stack: 3,
    apply: (run) => addPerk(run, 'peek'),
  },
  {
    id: 'sharpEye',
    name: 'Sharp Eye',
    text: 'The first hint on each board is free and places its digit.',
    category: 'hints',
    rarity: 'uncommon',
    stack: 1,
    apply: (run) => addPerk(run, 'sharpEye'),
  },
  {
    id: 'candidateGlass',
    name: 'Candidate Glass',
    text: 'Every board starts with notes in its emptiest box.',
    category: 'hints',
    rarity: 'uncommon',
    stack: 1,
    apply: (run) => addPerk(run, 'candidateGlass'),
  },
  {
    id: 'scout',
    name: 'Scout',
    text: 'Every shop before a boss opens with what answers its rule.',
    category: 'hints',
    rarity: 'common',
    stack: 1,
    apply: (run) => addPerk(run, 'scout'),
  },

  // Multiplier
  {
    id: 'prismShard',
    name: 'Prism Shard',
    text: `×${1 + REWARD.prismShard} on all scoring. Shards add up.`,
    category: 'mult',
    rarity: 'uncommon',
    stack: 5,
    apply: (run) => addPerk(run, 'prismShard'),
  },
  {
    id: 'fishbowl',
    name: 'Fishbowl',
    text: `X-Wings, wings and their kin score ×${REWARD.fishbowl}.`,
    tiers: [6, 7],
    category: 'mult',
    rarity: 'rare',
    unlock: 'xwing',
    stack: 1,
    apply: (run) => addPerk(run, 'fishbowl'),
  },
  {
    id: 'hotStreak',
    name: 'Hot Streak',
    text: `Flow builds twice as fast and goes ${FLOW.hotRise} higher.`,
    category: 'mult',
    rarity: 'uncommon',
    stack: 1,
    apply: (run) => addPerk(run, 'hotStreak'),
  },
  {
    id: 'cleanSweep',
    name: 'Clean Sweep',
    text: 'A unit finished clean gives ×2 instead of ×1.5.',
    category: 'mult',
    rarity: 'uncommon',
    stack: 1,
    apply: (run) => addPerk(run, 'cleanSweep'),
  },
  {
    id: 'cascade',
    name: 'Cascade',
    text: `A placement in the row, column or box of the last one adds ×${REWARD.cascade}, building up to ×${REWARD.cascadeMax}.`,
    category: 'mult',
    rarity: 'rare',
    stack: 1,
    apply: (run) => addPerk(run, 'cascade'),
  },

  // Score
  {
    id: 'bounty',
    name: 'Bounty',
    text: `+${REWARD.bounty} to the run score.`,
    category: 'score',
    rarity: 'common',
    apply: (run) => ({ ...run, bonus: run.bonus + REWARD.bounty, score: run.score + REWARD.bounty }),
  },
  {
    id: 'compound',
    name: 'Compound',
    text: `Every board starts with ${pct(REWARD.compound)} of your run score.`,
    category: 'score',
    rarity: 'rare',
    unlock: 'win',
    stack: 1,
    apply: (run) => addPerk(run, 'compound'),
  },
  {
    id: 'expertPay',
    name: 'Expert Pay',
    text: `+${REWARD.expertPay} points for every pair, triple or harder placement.`,
    tiers: [5, 6, 7, 8],
    category: 'score',
    rarity: 'uncommon',
    stack: 2,
    apply: (run) => addPerk(run, 'expertPay'),
  },
  {
    id: 'doubleOrNothing',
    name: 'Double or Nothing',
    text: "No mistakes on the next board doubles this board's score. A mistake loses it.",
    category: 'score',
    rarity: 'uncommon',
    usable: (run, kind) => {
      const last = run.results[run.results.length - 1];
      return kind !== 'tag' && !run.pending && !!last && last.status === 'cleared' && last.score > 0;
    },
    apply: (run) => {
      const last = run.results[run.results.length - 1];
      return last ? { ...run, pending: { slot: last.slot, score: last.score } } : run;
    },
  },

  // Bargains
  {
    id: 'glassHeart',
    name: 'Glass Heart',
    text: `×${1 + REWARD.glassHeart} on all scoring.`,
    cost: 'One heart slot fewer.',
    category: 'mult',
    rarity: 'rare',
    stack: 2,
    usable: (run) => run.maxHearts > 1,
    apply: (run) => heal({ ...addPerk(run, 'glassHeart'), maxHearts: Math.max(1, run.maxHearts - 1) }, 0),
  },
  {
    id: 'daredevil',
    name: 'Daredevil',
    text: `×${REWARD.daredevil} on all scoring.`,
    cost: 'Mistakes cost twice the hearts.',
    category: 'mult',
    rarity: 'uncommon',
    stack: 1,
    apply: (run) => addPerk(run, 'daredevil'),
  },
  {
    id: 'microscope',
    name: 'Microscope',
    text: 'A placement more than one technique proves scores as the hardest.',
    cost: 'One heart slot fewer.',
    category: 'score',
    rarity: 'rare',
    stack: 1,
    usable: (run) => run.maxHearts > 1,
    apply: (run) => heal({ ...addPerk(run, 'microscope'), maxHearts: Math.max(1, run.maxHearts - 1) }, 0),
  },
  {
    id: 'fogLamp',
    name: 'Fog Lamp',
    text: `+${REWARD.fogLamp} hints for the run.`,
    cost: 'The next board is in fog.',
    category: 'hints',
    rarity: 'common',
    apply: (run) => ({ ...run, hintPool: run.hintPool + REWARD.fogLamp, next: { ...run.next, fog: true } }),
  },
  {
    id: 'bloodMoney',
    name: 'Blood Money',
    text: `+${REWARD.bloodMoney} coins.`,
    cost: 'Lose a heart.',
    category: 'score',
    rarity: 'common',
    usable: (run) => run.hearts > 1,
    apply: (run) => heal({ ...run, coins: run.coins + REWARD.bloodMoney }, -1),
  },
  {
    id: 'overtime',
    name: 'Overtime',
    text: `The next board pays ${REWARD.overtime} times its coins.`,
    cost: 'It has a clock.',
    category: 'score',
    rarity: 'uncommon',
    apply: (run) => ({ ...run, next: { ...run.next, clock: true, coinTimes: REWARD.overtime } }),
  },
];

const byId = new Map(REWARDS.map((r) => [r.id, r]));

export function rewardById(id: string): RewardDef | undefined {
  return byId.get(id as RewardId);
}

export function isBargain(def: RewardDef): boolean {
  return !!def.cost;
}

/** True when the card can be offered to this run: open, not maxed out, and able to act. */
export function canOffer(def: RewardDef, run: RunState, kind: OfferKind): boolean {
  if (def.stack !== undefined && owned(run, def.id) >= def.stack) return false;
  return def.usable ? def.usable(run, kind) : true;
}

/** Cards the milestones have opened (starter cards always). */
export function rewardPool(unlocked: ReadonlySet<UnlockId>, starterOnly: boolean): RewardDef[] {
  return REWARDS.filter((r) => !r.unlock || (!starterOnly && unlocked.has(r.unlock)));
}
