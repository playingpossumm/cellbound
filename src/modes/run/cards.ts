// Run cards: boons, curses and bargains. Every card is data plus a pure effect
// on the next board's plan (generator options and game modifiers).
import { makeRng } from '../../engine';
import type { ClueKind, Difficulty, GenerateOptions } from '../../engine/types';
import type { GameMods } from '../../game/types';
import { roundTo, sizeScale } from './scale';

export const START_HEARTS = 3;
export const MAX_HEARTS = 5;
export const MAX_SHIELD = 3;
/** The Tight clock on a 6x6 board. */
export const TIGHT_CLOCK_MS = 4 * 60 * 1000;

/** The Tight clock for a board, scaled by its size to the whole minute: 4 minutes on a 6x6, 9 on a 9x9. */
export function clockFor(size: number): number {
  return roundTo(TIGHT_CLOCK_MS * sizeScale(size), 60_000);
}

const clockMinutes = (size: number) => clockFor(size) / 60_000;
/** The hardest difficulty a Run board can reach. */
export const MAX_RUN_DIFFICULTY: Difficulty = 4;

export const ALL_KINDS: ClueKind[] = [
  'thermo',
  'arrow',
  'cage',
  'renban',
  'whisper',
  'kropki',
  'xv',
  'diagonal',
  'antiKnight',
];

export type Rarity = 'common' | 'uncommon' | 'rare';
export type CardKind = 'boon' | 'curse' | 'bargain';
export type UnlockId = 'first-run' | 'board-3' | 'full-hearts' | 'cursed-board' | 'daily-3';

/** What the next board will be: what to generate and how to play it. */
export interface BoardPlan {
  options: GenerateOptions;
  mods: GameMods;
}

export interface Card {
  id: string;
  name: string;
  /** One line, plain English. True of every board the card can reach. */
  text: string;
  /** The line for a board of a known size, when a number in it depends on the size. */
  textFor?: (size: number) => string;
  rarity: Rarity;
  kind: CardKind;
  /** Added to the board's score multiplier (0.25 means plus 25 percent). Zero for boons. */
  mult: number;
  /** Locked until this milestone is reached. Starter cards have none. */
  unlock?: UnlockId;
  /** A run card stays in force on every later board; a board card is used once. */
  lasts: 'board' | 'run';
  /** Cards with a higher order apply later, so a ward can undo a curse. */
  order: number;
  /** Two cards of one family are never offered together. */
  family: string;
  /** Not offered before the final board. */
  skipOnFinal?: boolean;
  effect(plan: BoardPlan): BoardPlan;
}

const hearts = (p: BoardPlan) => p.mods.hearts ?? START_HEARTS;
const shield = (p: BoardPlan) => p.mods.shield ?? 0;

function withMods(p: BoardPlan, m: Partial<GameMods>): BoardPlan {
  return { options: p.options, mods: { ...p.mods, ...m } };
}
function withOptions(p: BoardPlan, o: Partial<GenerateOptions>): BoardPlan {
  return { options: { ...p.options, ...o }, mods: p.mods };
}
const compose =
  (...fns: Array<(p: BoardPlan) => BoardPlan>) =>
  (p: BoardPlan) =>
    fns.reduce((acc, f) => f(acc), p);

// ---- effects shared by single cards and bargains --------------------------------

const addHeart = (p: BoardPlan) => withMods(p, { hearts: Math.min(MAX_HEARTS, hearts(p) + 1) });
const addShield = (p: BoardPlan) => withMods(p, { shield: Math.min(MAX_SHIELD, shield(p) + 1) });
const reveal = (n: number) => (p: BoardPlan) => withMods(p, { reveal: (p.mods.reveal ?? 0) + n });
const fog = (p: BoardPlan) => withOptions(p, { fog: true });
const noNotes = (p: BoardPlan) => withMods(p, { noNotes: true, autoNotes: false });
const dim = (p: BoardPlan) => withMods(p, { noHighlights: true });
const clock = (p: BoardPlan) => withMods(p, { timeLimitMs: clockFor(p.options.size) });
const autoNotes = (p: BoardPlan) => withMods(p, { autoNotes: true, noNotes: false });

/** Cage totals hidden. A cage is forced into the rule list so the curse always bites. */
export function blankCages(p: BoardPlan): BoardPlan {
  const rules = p.options.rules.includes('cage')
    ? p.options.rules.slice()
    : [...p.options.rules.slice(0, Math.max(0, p.options.rules.length - 1)), 'cage' as ClueKind];
  return withOptions(p, { rules, hiddenCageTotals: true });
}

/** One more rule on the board, picked with the board seed so everyone sees the same one. */
export function crowded(p: BoardPlan): BoardPlan {
  const have = p.options.rules;
  const spare = ALL_KINDS.filter((k) => !have.includes(k) && k !== 'diagonal' && k !== 'antiKnight');
  const extra = spare.length ? spare[Math.floor(makeRng(p.options.seed + ':crowded')() * spare.length)] : undefined;
  const kinds = Math.min(4, (p.options.maxKinds ?? have.length) + 1);
  return withOptions(p, {
    rules: extra ? [...have, extra] : have.slice(),
    minKinds: kinds,
    maxKinds: kinds,
  });
}

const harder = (p: BoardPlan) =>
  withOptions(p, { difficulty: Math.min(MAX_RUN_DIFFICULTY, p.options.difficulty + 1) as Difficulty });
const easier = (p: BoardPlan) =>
  withOptions(p, { difficulty: Math.max(1, p.options.difficulty - 1) as Difficulty });

// ---- the cards ---------------------------------------------------------------------

export const CARDS: Card[] = [
  // Boons
  {
    id: 'lantern',
    name: 'Lantern',
    text: 'Three cells are filled in for you on the next board.',
    rarity: 'common',
    kind: 'boon',
    mult: 0,
    lasts: 'board',
    order: 10,
    family: 'reveal',
    effect: reveal(3),
  },
  {
    id: 'second-wind',
    name: 'Second wind',
    text: 'Gain a heart, up to 5. At 5 hearts, gain a shield instead.',
    rarity: 'uncommon',
    kind: 'boon',
    mult: 0,
    lasts: 'board',
    order: 10,
    family: 'heart',
    effect: (p) => (hearts(p) >= MAX_HEARTS ? addShield(p) : addHeart(p)),
  },
  {
    id: 'shield',
    name: 'Shield',
    text: 'Your next wrong digit costs nothing. The shield waits until you need it.',
    rarity: 'common',
    kind: 'boon',
    mult: 0,
    lasts: 'board',
    order: 10,
    family: 'shield',
    effect: addShield,
  },
  {
    id: 'easy-road',
    name: 'Easy road',
    text: 'The next board is one step easier.',
    rarity: 'common',
    kind: 'boon',
    mult: 0,
    lasts: 'board',
    order: 10,
    family: 'difficulty',
    effect: easier,
  },
  {
    id: 'insight',
    name: 'Insight',
    text: 'Candidate notes are filled in for you on the next board.',
    rarity: 'uncommon',
    kind: 'boon',
    mult: 0,
    unlock: 'board-3',
    lasts: 'board',
    order: 10,
    family: 'notes',
    effect: autoNotes,
  },
  {
    id: 'clear-sight',
    name: 'Clear sight',
    text: 'For the rest of the run, no curse can switch off your highlights.',
    rarity: 'uncommon',
    kind: 'boon',
    mult: 0,
    unlock: 'first-run',
    lasts: 'run',
    order: 90,
    family: 'ward',
    effect: (p) => withMods(p, { noHighlights: false }),
  },
  {
    id: 'steady-hand',
    name: 'Steady hand',
    text: 'For the rest of the run, you start every board with a shield.',
    rarity: 'rare',
    kind: 'boon',
    mult: 0,
    unlock: 'full-hearts',
    lasts: 'run',
    order: 90,
    family: 'shield',
    effect: (p) => withMods(p, { shield: Math.max(1, shield(p)) }),
  },
  {
    id: 'beacon',
    name: 'Beacon',
    text: 'Six cells are filled in for you on the next board.',
    rarity: 'rare',
    kind: 'boon',
    mult: 0,
    unlock: 'daily-3',
    lasts: 'board',
    order: 10,
    family: 'reveal',
    effect: reveal(6),
  },

  // Curses
  {
    id: 'fog',
    name: 'Fog',
    text: 'The next board is wrapped in fog. Correct digits clear the cells around them.',
    rarity: 'uncommon',
    kind: 'curse',
    mult: 0.5,
    lasts: 'board',
    order: 0,
    family: 'fog',
    effect: fog,
  },
  {
    id: 'blank-cages',
    name: 'Blank cages',
    text: 'The next board has cages, and their totals are hidden.',
    rarity: 'common',
    kind: 'curse',
    mult: 0.3,
    lasts: 'board',
    order: 0,
    family: 'cages',
    effect: blankCages,
  },
  {
    id: 'no-notes',
    name: 'No notes',
    text: 'You cannot write notes on the next board.',
    rarity: 'common',
    kind: 'curse',
    mult: 0.3,
    lasts: 'board',
    order: 0,
    family: 'notes',
    effect: noNotes,
  },
  {
    id: 'tight-clock',
    name: 'Tight clock',
    text: 'You have 4 minutes, or 9 on the final board. When time runs out the run ends.',
    textFor: (size) => `You have ${clockMinutes(size)} minutes to finish the next board. When time runs out the run ends.`,
    rarity: 'uncommon',
    kind: 'curse',
    mult: 0.4,
    lasts: 'board',
    order: 0,
    family: 'clock',
    effect: clock,
  },
  {
    id: 'dim',
    name: 'Dim',
    text: 'Highlights are off on the next board.',
    rarity: 'common',
    kind: 'curse',
    mult: 0.3,
    lasts: 'board',
    order: 0,
    family: 'highlights',
    effect: dim,
  },
  {
    id: 'crowded',
    name: 'Crowded',
    text: 'The next board uses one more rule.',
    rarity: 'uncommon',
    kind: 'curse',
    mult: 0.3,
    lasts: 'board',
    order: 0,
    family: 'rules',
    effect: crowded,
  },
  {
    id: 'hard-turn',
    name: 'Hard turn',
    text: 'The next board is one step harder.',
    rarity: 'common',
    kind: 'curse',
    mult: 0.4,
    lasts: 'board',
    order: 0,
    family: 'difficulty',
    // The final 9x9 is the longest board of the run; a harder one would not fit a sitting.
    skipOnFinal: true,
    effect: harder,
  },

  // Bargains: a curse and a boon in one card
  {
    id: 'night-walk',
    name: 'Night walk',
    text: 'Fog on the next board, but you gain a heart.',
    rarity: 'uncommon',
    kind: 'bargain',
    mult: 0.2,
    lasts: 'board',
    order: 0,
    family: 'fog',
    effect: compose(fog, addHeart),
  },
  {
    id: 'blind-faith',
    name: 'Blind faith',
    text: 'The next board has cages with hidden totals, but five cells are filled in.',
    rarity: 'rare',
    kind: 'bargain',
    mult: 0.1,
    lasts: 'board',
    order: 0,
    family: 'cages',
    effect: compose(blankCages, reveal(5)),
  },
  {
    id: 'hush',
    name: 'Hush',
    text: 'No notes on the next board, but you gain a shield.',
    rarity: 'common',
    kind: 'bargain',
    mult: 0.1,
    lasts: 'board',
    order: 0,
    family: 'notes',
    effect: compose(noNotes, addShield),
  },
  {
    id: 'sprint',
    name: 'Sprint',
    text: '4 minutes for the next board, 9 for the final, or the run ends. You gain a heart.',
    textFor: (size) => `${clockMinutes(size)} minutes to finish the next board or the run ends, but you gain a heart.`,
    rarity: 'uncommon',
    kind: 'bargain',
    mult: 0.2,
    lasts: 'board',
    order: 0,
    family: 'clock',
    effect: compose(clock, addHeart),
  },
  {
    id: 'dusk',
    name: 'Dusk',
    text: 'Highlights are off, but three cells are filled in.',
    rarity: 'common',
    kind: 'bargain',
    mult: 0.1,
    lasts: 'board',
    order: 0,
    family: 'highlights',
    effect: compose(dim, reveal(3)),
  },
  {
    id: 'packed-house',
    name: 'Packed house',
    text: 'One more rule on the next board, with notes filled in.',
    rarity: 'rare',
    kind: 'bargain',
    mult: 0.2,
    unlock: 'cursed-board',
    lasts: 'board',
    order: 0,
    family: 'rules',
    effect: compose(crowded, autoNotes),
  },
];

const byId = new Map(CARDS.map((c) => [c.id, c]));

/** A card's line for a board of the given size, or its general line when the size is not known. */
export function cardText(card: Card, size?: number): string {
  return size !== undefined && card.textFor ? card.textFor(size) : card.text;
}

export function cardById(id: string): Card | undefined {
  return byId.get(id);
}

/** Cards that are curses or bargains carry a multiplier. */
export function isCursed(card: Card): boolean {
  return card.kind !== 'boon';
}

/**
 * Applies cards to a plan, lowest order first. Ties keep the order given, so the
 * result never depends on how the caller built the list.
 */
export function applyCards(plan: BoardPlan, cards: Card[]): BoardPlan {
  return cards
    .map((c, i) => ({ c, i }))
    .sort((a, b) => a.c.order - b.c.order || a.i - b.i)
    .reduce((acc, { c }) => c.effect(acc), plan);
}

/** Score multiplier for a board: 1 plus the sum of the curse bonuses. */
export function multiplierOf(cards: Card[]): number {
  const total = cards.reduce((sum, c) => sum + c.mult, 0);
  return Math.round((1 + total) * 100) / 100;
}

/** Cards available to a player: starter cards plus the ones their milestones opened. */
export function cardPool(unlocked: ReadonlySet<UnlockId>, starterOnly: boolean): Card[] {
  return CARDS.filter((c) => !c.unlock || (!starterOnly && unlocked.has(c.unlock)));
}

export function cardsByKind(kind: CardKind): Card[] {
  return CARDS.filter((c) => c.kind === kind);
}
