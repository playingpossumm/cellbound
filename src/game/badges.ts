// Badges: twenty-one of them with three levels each, read from the stats the app already keeps
// (every device's, for a player who is logged in), so whatever was played before badges counts.
// Pure, for tests; src/app/badges.tsx draws them as gems on the Stats screen, the result card and
// the Run's summary.
import { TECHNIQUES, type TechniqueId, type TechniqueTier } from '../engine/techniqueNames';
import type { RunStats } from '../modes/run/stats';
import { bestRunScore } from '../sync/rules';
import { formatTime } from './logic';
import type { DailyEntry, StatsData } from './stats';
import { bestStreak } from './streaks';

export type BadgeGroup = 'Time' | 'Method' | 'Score' | 'Run' | 'Other';

export type BadgeId =
  | 'streak'
  | 'regular'
  | 'quick'
  | 'clean'
  | 'hidden'
  | 'clues'
  | 'pointing'
  | 'pairs'
  | 'xwing'
  | 'wings'
  | 'chains'
  | 'score'
  | 'hit'
  | 'boss'
  | 'rules'
  | 'victor'
  | 'sweep'
  | 'fiendish'
  | 'fog'
  | 'variety'
  | 'scholar';

/** What the badges read: the game stats, the Run's, and the lessons finished in Learn. */
export interface BadgeInput {
  stats: StatsData;
  run: RunStats;
  lessons: number;
}

export interface BadgeDef {
  id: BadgeId;
  group: BadgeGroup;
  name: string;
  /** What it counts, in a sentence. */
  counts: string;
  /** What levels I, II and III need. */
  steps: readonly [number, number, number];
  /** A time, where less is better. */
  lower?: boolean;
  /** The unit of a count, for the progress line. */
  unit?: string;
  /** How a step or a value reads. */
  show?: (n: number) => string;
  /** The player's value now; null before there is one, as for a time never set. */
  value: (i: BadgeInput) => number | null;
}

/** Levels I, II and III, as the badges name them. */
export const NUMERALS = ['', 'I', 'II', 'III'] as const;

const MINUTE = 60_000;
const SKILLS = ['', 'Easy', 'Normal', 'Hard'];
/** 1000 becomes "1,000", whatever the device's language. */
export const thousands = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

const solved = (s: StatsData): DailyEntry[] => Object.values(s.daily).filter((e) => e.status === 'solved');

/** Run placements proved by a technique of these tiers, from the codex. */
function placed(run: RunStats, ...tiers: TechniqueTier[]): number {
  let n = 0;
  for (const [id, c] of Object.entries(run.codex)) if (c && tiers.includes(TECHNIQUES[id as TechniqueId]?.tier)) n += c.n;
  return n;
}

/** How many of a tally's keys have counted at least once. */
const kinds = (tally: Partial<Record<string, number>> | undefined) => Object.values(tally ?? {}).filter((n) => (n ?? 0) > 0).length;

export const BADGES: readonly BadgeDef[] = [
  { id: 'streak', group: 'Time', name: 'Streak', counts: 'Dailies solved on their own day, in a row.', steps: [3, 7, 30], unit: 'days', value: (i) => bestStreak(i.stats.daily) },
  { id: 'regular', group: 'Time', name: 'Regular', counts: 'Dailies solved.', steps: [7, 30, 100], unit: 'Dailies', value: (i) => solved(i.stats).length },
  {
    id: 'quick',
    group: 'Time',
    name: 'Quick',
    counts: 'A Daily solved within the time.',
    steps: [20 * MINUTE, 12 * MINUTE, 8 * MINUTE],
    lower: true,
    show: (ms) => `${Math.round(ms / MINUTE)} min`,
    value: (i) => {
      const times = solved(i.stats).map((e) => e.ms);
      return times.length ? Math.min(...times) : null;
    },
  },
  {
    id: 'clean',
    group: 'Method',
    name: 'Clean',
    counts: 'Dailies solved with no mistakes and no hints.',
    steps: [1, 10, 50],
    unit: 'clean Dailies',
    value: (i) => solved(i.stats).filter((e) => !e.mistakes && !e.hints).length,
  },
  { id: 'hidden', group: 'Method', name: 'Hidden singles', counts: 'Hidden singles placed in runs.', steps: [50, 250, 1000], unit: 'placed', value: (i) => placed(i.run, 2) },
  { id: 'clues', group: 'Method', name: 'Clues', counts: 'Digits a clue proves, placed in runs.', steps: [25, 100, 500], unit: 'placed', value: (i) => placed(i.run, 3) },
  { id: 'pointing', group: 'Method', name: 'Pointing', counts: 'Digits proved by pointing or a cage rule, placed in runs.', steps: [10, 50, 200], unit: 'placed', value: (i) => placed(i.run, 4) },
  { id: 'pairs', group: 'Method', name: 'Pairs', counts: 'Digits proved by a pair or a triple, placed in runs.', steps: [5, 25, 100], unit: 'placed', value: (i) => placed(i.run, 5) },
  { id: 'xwing', group: 'Method', name: 'X-Wings', counts: 'Digits proved by an X-Wing or its kin, placed in runs.', steps: [1, 10, 50], unit: 'placed', value: (i) => placed(i.run, 6) },
  { id: 'wings', group: 'Method', name: 'Wings', counts: 'Digits proved by a wing or a Swordfish, placed in runs.', steps: [1, 5, 25], unit: 'placed', value: (i) => placed(i.run, 7) },
  { id: 'chains', group: 'Method', name: 'Chains', counts: 'Digits proved by a chain, placed in runs.', steps: [1, 5, 25], unit: 'placed', value: (i) => placed(i.run, 8) },
  { id: 'score', group: 'Score', name: 'High score', counts: 'The best score of a run on Normal or Hard, or a daily run.', steps: [20_000, 50_000, 100_000], unit: 'points', value: (i) => bestRunScore(i.run) },
  { id: 'hit', group: 'Score', name: 'Big hit', counts: 'The most one placement has scored.', steps: [500, 2000, 8000], unit: 'points', value: (i) => i.run.best?.points ?? 0 },
  { id: 'boss', group: 'Run', name: 'Boss', counts: 'Boss boards beaten.', steps: [1, 10, 50], unit: 'bosses', value: (i) => i.run.bosses },
  { id: 'rules', group: 'Run', name: 'Rulebreaker', counts: 'Different boss rules beaten.', steps: [2, 4, 6], unit: 'rules', value: (i) => kinds(i.run.bossRules) },
  {
    id: 'victor',
    group: 'Run',
    name: 'Victor',
    counts: 'A run won, on each difficulty.',
    steps: [1, 2, 3],
    show: (n) => SKILLS[n],
    // The hardest difficulty won: a daily run is played on Normal.
    value: (i) => (i.run.wonHard > 0 ? 3 : i.run.won > i.run.wonEasy ? 2 : i.run.wonEasy > 0 ? 1 : 0),
  },
  { id: 'sweep', group: 'Run', name: 'Clean sweep', counts: 'Run boards finished with every box clean.', steps: [1, 5, 20], unit: 'boards', value: (i) => i.run.cleanBoards },
  {
    id: 'fiendish',
    group: 'Other',
    name: 'Fiendish',
    counts: 'Boards solved at Fiendish.',
    steps: [1, 5, 25],
    unit: 'boards',
    value: (i) => Object.entries(i.stats.times).reduce((n, [k, t]) => n + (k.endsWith(':5') ? t.count : 0), 0),
  },
  {
    id: 'fog',
    group: 'Other',
    name: 'Fog',
    counts: 'Boards solved in fog.',
    steps: [1, 10, 50],
    unit: 'boards',
    // Before Fog moved into Free play, its boards counted as their own mode.
    value: (i) => (i.stats.fog ?? 0) + ((i.stats.solves as Partial<Record<string, number>>).fog ?? 0),
  },
  { id: 'variety', group: 'Other', name: 'Variety', counts: 'Different rules in the boards you have solved.', steps: [3, 6, 9], unit: 'rules', value: (i) => kinds(i.stats.rules) },
  { id: 'scholar', group: 'Other', name: 'Scholar', counts: 'Lessons finished in Learn.', steps: [3, 6, 10], unit: 'lessons', value: (i) => i.lessons },
];

export interface BadgeState {
  def: BadgeDef;
  value: number | null;
  /** 0 before level I, up to 3. */
  level: number;
}

/** The level a value reaches. */
export function levelOf(def: BadgeDef, value: number | null): number {
  if (value === null) return 0;
  return def.steps.filter((s) => (def.lower ? value <= s : value >= s)).length;
}

export function badgeStates(i: BadgeInput): BadgeState[] {
  return BADGES.map((def) => {
    const value = def.value(i);
    return { def, value, level: levelOf(def, value) };
  });
}

/** A step or a value in the badge's own words. */
export const showOf = (def: BadgeDef, n: number): string => (def.show ? def.show(n) : thousands(n));

/** How far the next level is: a share from 0 to 1, and the line that says it. */
export function progressOf(b: BadgeState): { share: number; text: string } {
  const { def, value, level } = b;
  if (level >= 3) return { share: 1, text: 'Every level earned' };
  const next = def.steps[level];
  if (def.id === 'victor') return { share: level / 3, text: level ? `Won on ${SKILLS[level]}, ${SKILLS[level + 1]} next` : 'Win a run on Easy' };
  if (def.lower) {
    if (value === null) return { share: 0, text: `Level I at ${showOf(def, next)}` };
    return { share: Math.min(1, next / value), text: `Best ${formatTime(value)}, level ${NUMERALS[level + 1]} at ${showOf(def, next)}` };
  }
  const now = value ?? 0;
  return { share: Math.min(1, now / next), text: `${thousands(now)} of ${showOf(def, next)} ${def.unit ?? ''}`.trim() };
}

/** Every level of every badge. */
export const BADGE_LEVELS = BADGES.length * 3;
