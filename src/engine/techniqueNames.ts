// The techniques the detector names, with their tiers: a small table the app reads without loading
// the detector itself, which stays behind a lazy import. techniques.ts re-exports all of it.

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
