// The leaderboard's rules, shared by the app and its server: what a name and a PIN may be, the
// four boards, and where a player's stats place them. Pure, and free of the stores.
import type { DailyEntry, StatsData } from '../game/stats';
import { bestStreak } from '../game/streaks';
import type { RunStats } from '../modes/run/stats';

/** From 2 to 16 letters, digits, spaces and . _ -, starting with a letter or a digit. */
const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} ._-]{1,15}$/u;
const PIN_RE = /^\d{4}$/;

/** A name as shown: trimmed, with single spaces. */
export const cleanName = (name: string) => name.trim().replace(/\s+/g, ' ');
/** A name as stored, so "Ana" and "ana " are one player. */
export const nameKey = (name: string) => cleanName(name).toLowerCase();
export const validName = (name: string) => NAME_RE.test(cleanName(name));
export const validPin = (pin: string) => PIN_RE.test(pin);

export type BoardKind = 'daily' | 'drun' | 'best' | 'streak';
export const BOARD_KINDS: readonly BoardKind[] = ['daily', 'drun', 'best', 'streak'];
/** The Daily ranks by time, lowest first; the others by score or days, highest first. */
export const LOWEST_WINS: Record<BoardKind, boolean> = { daily: true, drun: false, best: false, streak: false };

/** A row of a board. A Daily row carries its mistakes and hints. */
export interface BoardRow {
  rank: number;
  name: string;
  value: number;
  mistakes?: number;
  hints?: number;
  /** The player asking. */
  you?: boolean;
}

export type Boards = { date: string } & Record<BoardKind, BoardRow[]>;

/** What a device sends up: its own stats, without the list of games it has counted. */
export interface Snapshot {
  stats: Omit<StatsData, 'recorded'>;
  run: RunStats;
}

export const BLANK_STATS: StatsData = { solves: {}, fails: {}, times: {}, daily: {}, recorded: [] };
export const BLANK_RUN: RunStats = {
  started: 0,
  won: 0,
  lost: 0,
  abandoned: 0,
  bestFree: null,
  dailyBest: {},
  topAnte: 0,
  bosses: 0,
  cleanBoards: 0,
  codex: {},
  best: null,
};

/** Where a player's stats place them, for the boards of the given dates. */
export interface Standing {
  daily: Record<string, Pick<DailyEntry, 'ms' | 'mistakes' | 'hints'>>;
  drun: Record<string, number>;
  /** The best run score, a Daily run's or a free one's; 0 before any run. */
  best: number;
  /** The longest run of Dailies solved on their day. */
  streak: number;
}

export function standingOf(stats: StatsData, run: RunStats, dates: readonly string[]): Standing {
  const daily: Standing['daily'] = {};
  const drun: Standing['drun'] = {};
  for (const d of dates) {
    // A Daily counts on its board only when it was solved on its own day, as for a streak.
    const e = stats.daily[d];
    if (e && e.status === 'solved' && e.solvedOn === d) daily[d] = { ms: e.ms, mistakes: e.mistakes, hints: e.hints };
    const r = run.dailyBest[d];
    if (r) drun[d] = r.score;
  }
  const best = Math.max(run.bestFree?.score ?? 0, ...Object.values(run.dailyBest).map((r) => r.score));
  return { daily, drun, best, streak: bestStreak(stats.daily) };
}
