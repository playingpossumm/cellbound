// The shapes of a Run: its state, the board in play, results, offers and the shop. Plain data,
// so a run saves as JSON and every transition (state.ts) is a pure function that tests can drive.
import type { TechniqueId } from '../../engine/techniques';
import type { GameMods } from '../../game/types';
import type { BoardKind } from './boards';
import type { BossRule } from './bosses';

export type Rarity = 'common' | 'uncommon' | 'rare';
/** Reward categories, each with its colour: hearts red, hints amber, mult violet, score green. */
export type Category = 'hearts' | 'hints' | 'mult' | 'score';

export type UnlockId = 'boss' | 'ante3' | 'win' | 'xwing' | 'chain' | 'clean' | 'daily3';

export type LensId =
  | 'loupe'
  | 'monocle'
  | 'spyglass'
  | 'fisheye'
  | 'telescope'
  | 'thermo'
  | 'cage'
  | 'arrow'
  | 'dot'
  | 'redShift'
  | 'blueShift'
  | 'undertow'
  | 'riptide'
  | 'clearGlass'
  | 'kaleidoscope'
  | 'coinPrism'
  | 'mint'
  | 'clutch'
  | 'glassCannon'
  | 'mirror';

export type RewardId =
  | 'mend'
  | 'bigHeart'
  | 'shield'
  | 'secondWind'
  | 'lifeLink'
  | 'insurance'
  | 'lantern'
  | 'peek'
  | 'sharpEye'
  | 'candidateGlass'
  | 'scout'
  | 'prismShard'
  | 'fishbowl'
  | 'hotStreak'
  | 'cleanSweep'
  | 'cascade'
  | 'bounty'
  | 'compound'
  | 'expertPay'
  | 'doubleOrNothing'
  | 'microscope'
  | 'glassHeart'
  | 'daredevil'
  | 'fogLamp'
  | 'bloodMoney'
  | 'overtime';

export type SpectraId = 'spectra1' | 'spectra2' | 'spectra3' | 'spectra4' | 'spectra5' | 'spectra6' | 'spectra7' | 'spectra8';
export type InkId = 'inkReveal' | 'inkClear' | 'inkHint' | 'inkVoid';
export type ItemId = SpectraId | InkId;

/** A lens in a slot. n is the lens's own counter, for a lens that grows (Kaleidoscope). */
export interface LensSlot {
  id: LensId;
  n?: number;
}

/** Placements, points and the best single placement per technique. */
export type TechTally = Partial<Record<TechniqueId, { n: number; points: number; top: number }>>;

export interface BestPlacement {
  technique: TechniqueId;
  points: number;
}

/**
 * select: the ante's three boards, the next one ready to play or skip.
 * board:  a board is in play (live).
 * tally:  the board is over and its tally is on screen.
 * reward: picking a card (after a cleared board, or a skipped board's tag).
 * shop:   after a boss.
 * done:   the run is over and its summary is on screen.
 */
export type RunPhase = 'select' | 'board' | 'tally' | 'reward' | 'shop' | 'done';
export type RunOutcome = 'won' | 'lost' | 'abandoned';

/** Coins a board pays when it is cashed out. */
export interface CashOut {
  board: number;
  overflow: number;
  interest: number;
  lenses: number;
  total: number;
}

/**
 * cleared: at or over the target. missed: under it, a heart lost. broken: a Glass board broke.
 * out: the hearts ran out on the board. skipped: skipped for a tag.
 */
export type BoardStatus = 'cleared' | 'missed' | 'broken' | 'out' | 'skipped';

export interface BoardResult {
  slot: number;
  status: BoardStatus;
  /** The clock ran out before the board was solved. */
  timedOut?: boolean;
  score: number;
  target: number;
  coins: CashOut | null;
  heartsLost: number;
  heartsAfter: number;
  mistakes: number;
  hintsUsed: number;
  elapsedMs: number;
  tech: TechTally;
  best: BestPlacement | null;
  /** Rows, columns and boxes finished clean. */
  clean: number;
  rule: BossRule | null;
}

/** The board in play: its running score and everything that scoring and the hearts need. */
export interface LiveBoard {
  /** The game store's save key for this board. */
  key: string;
  slot: number;
  target: number;
  score: number;
  /** Points the board started with (Compound), part of score. */
  head: number;
  streak: number;
  /** Cascade: placements in line with the one before, in a row. */
  chain: number;
  last: number | null;
  /** Cells that have scored (or been filled for nothing): a cell scores once a board. */
  scored: number[];
  /** Units and clue parts already counted, so undo and redo cannot count them twice. */
  units: string[];
  clues: string[];
  hearts: number;
  shield: number;
  heartsLost: number;
  mistakes: number;
  tech: TechTally;
  best: BestPlacement | null;
  clean: number;
  cleanBoxes: number;
  boxes: number;
  /** The boss rule in force: null on a Small or Big board, or once a Void ink lifted it. */
  rule: BossRule | null;
  /** Thief: cells whose givens are still hidden. */
  stolen: number[];
  /** Glass broke. */
  broken?: boolean;
  /** Hint charges the board started with: its own, the run's, and a free quick one. */
  hints: { board: number; pool: number; quick: number; extra: number };
  /** Overtime pays this many times the coins. */
  coinTimes: number;
  /** The board is played under fog (the Fog rule or Fog Lamp). */
  fog: boolean;
  /** The game modifiers the board started with. */
  mods: GameMods;
  /** Placements applied, for popups and tests. */
  seq: number;
}

export type OfferKind = 'reward' | 'boss' | 'tag';

export interface Offer {
  kind: OfferKind;
  /** The board the offer follows. */
  slot: number;
  cards: RewardId[];
}

export interface ShopState {
  /** The ante just finished. */
  ante: number;
  rerolls: number;
  /** Stock left: a sold-out place is null. */
  lenses: (LensId | null)[];
  items: (ItemId | null)[];
}

/** Changes a card puts on the next board played. */
export interface NextBoard {
  fog?: boolean;
  clock?: boolean;
  coinTimes?: number;
}

export interface RunState {
  v: 2;
  seed: string;
  /** The date of a daily run, or null for a free run. */
  daily: string | null;
  createdAt: number;
  /** A daily run played again after the first attempt. It never changes the daily best. */
  replay?: boolean;
  /** Milestones already reached when the run began, to tell what the run itself unlocked. */
  unlockedAtStart?: UnlockId[];
  phase: RunPhase;
  /** The board in play or next: 0 to 8, three per ante. */
  slot: number;
  hearts: number;
  /** Heart slots, before any lens caps them. */
  maxHearts: number;
  shield: number;
  coins: number;
  /** Hint charges kept for the run (Lantern, Fog Lamp). */
  hintPool: number;
  lenses: LensSlot[];
  items: ItemId[];
  /** Cards that stay for the run, with how many of each. */
  perks: Partial<Record<RewardId, number>>;
  /** Spectra level per tier, 0 to 8. */
  levels: number[];
  /** The boss rule of each ante. */
  bosses: BossRule[];
  /** Each board's target once its board is built. */
  targets: (number | null)[];
  next: NextBoard;
  /** Double or Nothing: the board whose score rides on the next board. */
  pending: { slot: number; score: number } | null;
  /** Second Wind has saved the run. */
  secondWindUsed: boolean;
  results: BoardResult[];
  /** Board scores plus bonuses. */
  score: number;
  /** The bonuses alone: Bounty and Double or Nothing. */
  bonus: number;
  live: LiveBoard | null;
  offer: Offer | null;
  shop: ShopState | null;
  /** Categories in the last offer, so a missing one weighs more next time. */
  lastCats: Category[];
  /** Hints used on the board just played, for the offer that follows it. */
  hintsLast: number;
  outcome: RunOutcome | null;
  /** Set by the store once the stats include this run. */
  recorded: boolean;
}

export type { BoardKind, BossRule };
