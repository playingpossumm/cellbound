// Every number that tunes a Run, in one place. The targets follow the engine's tierProfile, so
// once the real technique detector lands they are recalibrated here: `npm run calibrate:run`
// plays sample boards and prints what these numbers give (scripts/calibrate-run.ts).

/** Chips a correct placement earns, by the tier of the technique that proves it (0 to 8). */
export const CHIPS: readonly number[] = [0, 10, 20, 30, 50, 80, 150, 250, 400];

/**
 * Extra chips per Spectra level, by tier. Singles are about nine placements in ten and a single is
 * worth 10 chips, so a level there is worth far more than a level anywhere else: at +10 a Singles
 * Spectrum was +50 to +65 percent of a run's score for 3 coins, and three of them tripled it. At +3
 * a level adds about a sixth, in line with a lens (npm run balance:run prints every buy).
 */
export const SPECTRA_CHIPS: readonly number[] = [0, 3, 10, 10, 25, 25, 50, 50, 50];
/** The highest level a tier can reach. */
export const SPECTRA_MAX = 9;

/** Flow: 1 plus `step` for each placement in the streak, up to `cap`. Hot Streak builds it at `hotStep`. */
export const FLOW = { step: 0.1, hotStep: 0.2, cap: 2 } as const;

/** A unit finished clean (no notes, hints or mistakes in it) multiplies mult by this; Clean Sweep by `sweep`. */
export const CLEAN = { mult: 1.5, sweep: 2 } as const;

/**
 * A board's target: the chips a typical player's tier mix earns (tierProfile.typical times CHIPS),
 * times `scale`, times the board's kind, times `anteGrowth` for every ante after the first.
 *
 * Calibrated on the engine's technique detector (npm run calibrate:run, 8 seeds): a typical player
 * scores about 2.6 to 3.1 times the typical chips, so the spec's starting point (scale 1, growth
 * 1.6) asked for a third of that on the first board. Scale 1.4 and growth 1.5 give a typical
 * player about 2.2, 1.6 and 1.3 times the targets of ante 1, 1.4, 1.0 and 0.8 of ante 2, and
 * 0.85, 0.65 and 0.55 of ante 3: the first ante is clear but not idle, the second boss wants the
 * first shop's buys, and ante 3 wants a build of lenses and Spectra, even from noteless play.
 */
export const TARGET = {
  scale: 1.4,
  kind: { small: 1, big: 1.25, boss: 1.5 },
  anteGrowth: 1.5,
  /**
   * A placement above this tier counts at this tier's chips in a target. A hard board can force a
   * chain on the typical player (14 of 24 final bosses do, once or twice), and at 400 chips a chain
   * would add about 1,900 to the target; capped, the board is still harder to play, and finding the
   * chain is a bonus rather than a requirement.
   */
  tierCap: 5,
} as const;

export const HEARTS = {
  start: 3,
  /** No card or rule takes the hearts past this. */
  max: 5,
  maxShield: 3,
  /** Hearts a broken Glass board costs. */
  glass: 2,
} as const;

/** Hint charges each board starts with. Lantern adds charges for the run. */
export const HINTS_PER_BOARD = 1;

export const COINS = {
  start: 4,
  board: { small: 3, big: 4, boss: 5 },
  /** One more coin for every full `overflowStep` of the target scored above it, up to `overflowMax`. */
  overflowStep: 0.1,
  overflowMax: 5,
  /** Interest: a coin for every `interestPer` coins held when a board is cashed out, up to `interestMax`. */
  interestPer: 5,
  interestMax: 5,
} as const;

export const SLOTS = { lenses: 5, consumables: 2 } as const;

export const SHOP = {
  lenses: 2,
  items: 2,
  rerollBase: 2,
  rerollStep: 1,
  /** A lens sells for this share of its price, rounded down. */
  sellShare: 0.5,
} as const;

export const OFFERS = {
  size: 3,
  /** After a boss: one more card, and at least one rare. */
  bossSize: 4,
  /** A skipped board's tag: a smaller pick, commons only. */
  tagSize: 2,
  /** A lens, Spectrum or card that reads tiers the run has never placed weighs this share of one that does. */
  unplaced: 0.35,
  rarity: { common: 6, uncommon: 3, rare: 1 },
  /** Heart cards weigh this much more for every missing heart. */
  perMissingHeart: 1,
  /** Hint cards weigh this much more for every hint used on the board just played, up to three. */
  perHintUsed: 0.75,
  /** A category left out of the last offer weighs this many times more, so every one comes round. */
  unseen: 1.6,
  /** Once a card of a category is drawn, the rest of that category weighs this share. */
  repeat: 0.1,
  /** Bargains weigh this share of a plain card. */
  bargain: 0.6,
} as const;

export const BOSS = {
  /** The clock: the high end of the board's time window times this, to the whole minute. */
  clock: 1.25,
  /** Fish Market tries this many boards for one whose expert profile reaches `fishTier`. */
  fishTries: 6,
  fishTier: 6,
  fishMult: 3,
  /** Thief hides this many givens, at least `thiefSpacing` cells apart. */
  thief: 6,
  thiefSpacing: 2,
  /** Orders of the hidden givens tried, each checked for a guess, before one fewer is hidden. */
  thiefTries: 4,
} as const;

/** Numbers on the reward cards. */
export const REWARD = {
  bounty: 500,
  /** Compound: each board starts with this share of the run score. */
  compound: 0.1,
  expertPay: 50,
  expertTier: 5,
  /** Prism Shard adds this to the multiplier on all scoring, per shard. */
  prismShard: 0.2,
  /** Glass Heart adds this to the multiplier on all scoring: three Prism Shards for a heart slot. */
  glassHeart: 0.6,
  fishbowl: 3,
  /** Cascade: each placement in line with the last adds this much more multiplier. */
  cascade: 0.1,
  lantern: 2,
  fogLamp: 3,
  bloodMoney: 8,
  /** Overtime: the next board pays this many times its coins. */
  overtime: 2,
} as const;

/**
 * Numbers on the lenses. A flow that stays full, singles and the digit 1 are what a board is made
 * of, so the lenses that read them were worth two to four times the rest: Loupe at +6 chips added
 * 40 percent of a run's score for 4 coins and Riptide at +3 mult added 85. They are set so a lens
 * that reads the common placements adds 15 to 30 percent and one that reads the rarer ones a
 * similar amount over a run (npm run balance:run).
 */
export const LENS = {
  loupe: 3,
  monocle: 2,
  spyglass: 2,
  fisheye: 5,
  telescope: 4,
  arrow: 2,
  dot: 20,
  redShift: 4,
  blueShift: 20,
  undertowCap: 2.5,
  riptide: 1,
  clearGlass: 3,
  kaleidoscope: 0.1,
  coinPrismMax: 5,
  mintMax: 3,
  clutch: 2,
  glassCannon: 2,
} as const;

export const PRICES = {
  spectra: 3,
  ink: { reveal: 3, clear: 2, hint: 2, void: 4 },
} as const;
