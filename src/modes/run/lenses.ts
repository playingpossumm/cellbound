// Lenses: the run's scoring engine. Up to five sit in slots and fire in slot order on every
// scoring placement, each adding marks, adding mult or multiplying the mult, usually on a
// condition. Every lens is data plus pure functions, so scoring.ts and the tests share them.
import type { TechniqueId, TechniqueTier } from '../../engine/techniques';
import type { ClueKind, Digit } from '../../engine/types';
import type { LensId, LensSlot, Rarity, RunState, UnlockId } from './model';
import { FLOW, HEARTS, LENS } from './tuning';

/** What a lens sees of a placement. */
export interface LensCtx {
  tier: TechniqueTier;
  technique: TechniqueId;
  digit: Digit;
  /** Rows, columns and boxes the placement finished, and how many of them clean. */
  units: number;
  clean: number;
  /** Clues the placement finished: a cage's total and an arrow's circle digit ride along. */
  clues: { kind: ClueKind; total: number }[];
  /** On a clue single, the kind of clue that forced it (the engine's PlacementClass.clue). */
  clue?: ClueKind;
  /** The flow on this placement, and whether it has reached its cap. */
  flow: number;
  flowFull: boolean;
  hearts: number;
}

/** What a lens adds: marks and mult are added, xmult multiplies the mult. */
export interface LensFx {
  marks?: number;
  mult?: number;
  xmult?: number;
}

/** What a lens sees of a cleared board when it is cashed out. */
export interface CashCtx {
  hintsLeft: number;
  cleanBoxes: number;
}

export type LensTone = 'marks' | 'mult' | 'coins' | 'hearts';

export interface LensDef {
  id: LensId;
  name: string;
  /** One line, plain English. */
  text: string;
  price: number;
  rarity: Rarity;
  /** Locked until this milestone. Starter lenses have none. */
  unlock?: UnlockId;
  /** What the lens's tile shows, for example "+6" or "×2". */
  badge(slot: LensSlot): string;
  /** The colour of the badge: marks blue, mult red, coins amber. */
  tone: LensTone;
  score?(ctx: LensCtx, slot: LensSlot): LensFx | null;
  /** Coins when a board is cashed out. */
  coins?(ctx: CashCtx, slot: LensSlot): number;
  /** The lens's counter after a box is finished. */
  onBox?(slot: LensSlot): LensSlot;
  /** The technique tiers the lens reads, so the shop leans on what the run has placed. Absent for the rest. */
  tiers?: readonly number[];
  /** A passive lens: the flow's cap while it is held. */
  flowCap?: number;
  /** A passive lens: the most hearts the player can hold while it is held. */
  maxHearts?: number;
}

const times = (x: number) => `×${x}`;
const plus = (x: number) => `+${x}`;
const round1 = (x: number) => Math.round(x * 10) / 10;

export const LENSES: readonly LensDef[] = [
  {
    id: 'loupe',
    name: 'Loupe',
    text: `Singles and hidden singles: +${LENS.loupe} marks.`,
    price: 4,
    rarity: 'common',
    tiers: [1, 2],
    tone: 'marks',
    badge: () => plus(LENS.loupe),
    score: (c) => (c.tier === 1 || c.tier === 2 ? { marks: LENS.loupe } : null),
  },
  {
    id: 'monocle',
    name: 'Monocle',
    text: `Clue, pointing and cage placements: +${LENS.monocle} mult.`,
    price: 5,
    rarity: 'common',
    tiers: [3, 4],
    tone: 'mult',
    badge: () => plus(LENS.monocle),
    score: (c) => (c.tier === 3 || c.tier === 4 ? { mult: LENS.monocle } : null),
  },
  {
    id: 'spyglass',
    name: 'Spyglass',
    text: `Pairs and triples: ×${LENS.spyglass} mult.`,
    price: 6,
    rarity: 'uncommon',
    tiers: [5],
    tone: 'mult',
    badge: () => times(LENS.spyglass),
    score: (c) => (c.tier === 5 ? { xmult: LENS.spyglass } : null),
  },
  {
    id: 'fisheye',
    name: 'Fisheye',
    text: `X-Wings, wings and their kin: +${LENS.fisheye} mult.`,
    price: 8,
    rarity: 'rare',
    unlock: 'xwing',
    tiers: [6, 7],
    tone: 'mult',
    badge: () => plus(LENS.fisheye),
    score: (c) => (c.tier === 6 || c.tier === 7 ? { mult: LENS.fisheye } : null),
  },
  {
    id: 'telescope',
    name: 'Telescope',
    text: `Chains: ×${LENS.telescope} mult.`,
    price: 8,
    rarity: 'rare',
    unlock: 'chain',
    tiers: [8],
    tone: 'mult',
    badge: () => times(LENS.telescope),
    score: (c) => (c.tier === 8 ? { xmult: LENS.telescope } : null),
  },
  {
    id: 'thermo',
    name: 'Thermo Lens',
    text: 'A digit a thermometer proves adds itself to the mult.',
    price: 5,
    rarity: 'common',
    tone: 'mult',
    badge: () => '+n',
    score: (c) => (c.clue === 'thermo' ? { mult: c.digit } : null),
  },
  {
    id: 'cage',
    name: 'Cage Lens',
    text: 'A finished cage adds its total to the marks.',
    price: 5,
    rarity: 'common',
    tone: 'marks',
    badge: () => '+Σ',
    score: (c) => {
      const total = c.clues.filter((x) => x.kind === 'cage').reduce((s, x) => s + x.total, 0);
      return total ? { marks: total } : null;
    },
  },
  {
    id: 'arrow',
    name: 'Arrow Lens',
    text: `A finished arrow: ×${LENS.arrow} mult.`,
    price: 6,
    rarity: 'uncommon',
    tone: 'mult',
    badge: () => times(LENS.arrow),
    score: (c) => {
      const k = c.clues.filter((x) => x.kind === 'arrow').length;
      return k ? { xmult: LENS.arrow ** k } : null;
    },
  },
  {
    id: 'dot',
    name: 'Dot Lens',
    text: `+${LENS.dot} marks for each dot, X or V finished.`,
    price: 4,
    rarity: 'common',
    tone: 'marks',
    badge: () => plus(LENS.dot),
    score: (c) => {
      const k = c.clues.filter((x) => x.kind === 'kropki' || x.kind === 'xv').length;
      return k ? { marks: LENS.dot * k } : null;
    },
  },
  {
    id: 'redShift',
    name: 'Red Shift',
    text: `Placing a 9: +${LENS.redShift} mult.`,
    price: 4,
    rarity: 'common',
    tone: 'mult',
    badge: () => plus(LENS.redShift),
    score: (c) => (c.digit === 9 ? { mult: LENS.redShift } : null),
  },
  {
    id: 'blueShift',
    name: 'Blue Shift',
    text: `Placing a 1: +${LENS.blueShift} marks.`,
    price: 4,
    rarity: 'common',
    tone: 'marks',
    badge: () => plus(LENS.blueShift),
    score: (c) => (c.digit === 1 ? { marks: LENS.blueShift } : null),
  },
  {
    id: 'undertow',
    name: 'Undertow',
    text: `Flow can build to ×${LENS.undertowCap}.`,
    price: 6,
    rarity: 'uncommon',
    tone: 'mult',
    badge: () => times(LENS.undertowCap),
    flowCap: LENS.undertowCap,
    // It shows as firing while it lifts the flow past the usual cap.
    score: (c) => (c.flow > FLOW.cap ? {} : null),
  },
  {
    id: 'riptide',
    name: 'Riptide',
    text: `+${LENS.riptide} mult while the flow is full.`,
    price: 6,
    rarity: 'uncommon',
    tone: 'mult',
    badge: () => plus(LENS.riptide),
    score: (c) => (c.flowFull ? { mult: LENS.riptide } : null),
  },
  {
    id: 'clearGlass',
    name: 'Clear Glass',
    text: `+${LENS.clearGlass} mult for each unit finished clean.`,
    price: 6,
    rarity: 'uncommon',
    unlock: 'clean',
    tone: 'mult',
    badge: () => plus(LENS.clearGlass),
    score: (c) => (c.clean ? { mult: LENS.clearGlass * c.clean } : null),
  },
  {
    id: 'kaleidoscope',
    name: 'Kaleidoscope',
    text: `Gains +${LENS.kaleidoscope} mult for every box you finish.`,
    price: 8,
    rarity: 'rare',
    unlock: 'boss',
    tone: 'mult',
    badge: (s) => plus(round1((s.n ?? 0) * LENS.kaleidoscope)),
    score: (_c, s) => ((s.n ?? 0) > 0 ? { mult: round1((s.n ?? 0) * LENS.kaleidoscope) } : null),
    onBox: (s) => ({ ...s, n: (s.n ?? 0) + 1 }),
  },
  {
    id: 'coinPrism',
    name: 'Coin Prism',
    text: `A coin for each hint left when a board is cashed out, up to ${LENS.coinPrismMax}.`,
    price: 4,
    rarity: 'common',
    unlock: 'daily3',
    tone: 'coins',
    badge: () => '+1',
    coins: (c) => Math.min(LENS.coinPrismMax, c.hintsLeft),
  },
  {
    id: 'mint',
    name: 'Mint',
    text: `A coin for each box finished clean, up to ${LENS.mintMax} a board.`,
    price: 5,
    rarity: 'uncommon',
    tone: 'coins',
    badge: () => '+1',
    coins: (c) => Math.min(LENS.mintMax, c.cleanBoxes),
  },
  {
    id: 'clutch',
    name: 'Clutch',
    text: `×${LENS.clutch} mult on your last heart.`,
    price: 6,
    rarity: 'uncommon',
    unlock: 'ante3',
    tone: 'hearts',
    badge: () => times(LENS.clutch),
    score: (c) => (c.hearts === 1 ? { xmult: LENS.clutch } : null),
  },
  {
    id: 'glassCannon',
    name: 'Glass Cannon',
    text: `×${LENS.glassCannon} mult, but you can hold only 1 heart.`,
    price: 7,
    rarity: 'rare',
    unlock: 'ante3',
    tone: 'hearts',
    badge: () => times(LENS.glassCannon),
    maxHearts: 1,
    score: () => ({ xmult: LENS.glassCannon }),
  },
  {
    id: 'mirror',
    name: 'Mirror',
    text: 'Copies the lens to its left.',
    price: 9,
    rarity: 'rare',
    unlock: 'win',
    tone: 'mult',
    badge: () => '←',
  },
];

const byId = new Map(LENSES.map((l) => [l.id, l]));

export function lensById(id: string): LensDef | undefined {
  return byId.get(id as LensId);
}

/** The lens a slot really runs: a Mirror runs the first lens to its left that is not a Mirror. */
export function effectiveLens(slots: readonly LensSlot[], k: number): { def: LensDef; slot: LensSlot } | null {
  for (let j = k; j >= 0; j--) {
    const def = lensById(slots[j].id);
    if (!def) return null;
    if (def.id !== 'mirror') return { def, slot: slots[j] };
  }
  return null;
}

/** The flow's cap with these lenses held. */
export function flowCapOf(slots: readonly LensSlot[]): number {
  let cap: number = FLOW.cap;
  slots.forEach((_, k) => {
    const e = effectiveLens(slots, k);
    if (e?.def.flowCap) cap = Math.max(cap, e.def.flowCap);
  });
  return cap;
}

/** The most hearts a run can hold: its heart slots, unless a lens caps them. */
export function maxHeartsOf(run: Pick<RunState, 'maxHearts' | 'lenses'>): number {
  let max = Math.min(HEARTS.max, run.maxHearts);
  run.lenses.forEach((_, k) => {
    const e = effectiveLens(run.lenses, k);
    if (e?.def.maxHearts !== undefined) max = Math.min(max, e.def.maxHearts);
  });
  return Math.max(1, max);
}

/** Lenses that the milestones have opened (starter lenses always). */
export function lensPool(unlocked: ReadonlySet<UnlockId>, starterOnly: boolean): LensDef[] {
  return LENSES.filter((l) => !l.unlock || (!starterOnly && unlocked.has(l.unlock)));
}

/** What a lens sells for. */
export function sellPrice(def: LensDef, share: number): number {
  return Math.max(1, Math.floor(def.price * share));
}
