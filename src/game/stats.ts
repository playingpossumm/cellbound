// Solve statistics, Daily history and streaks.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { GameState, ModeId } from './types';
import { localDate, shiftDate } from './logic';
import { safeStorage } from './storage';

export interface TimeStat {
  count: number;
  totalMs: number;
  bestMs: number;
}

export interface DailyEntry {
  status: 'solved' | 'failed';
  ms: number;
  mistakes: number;
  hints: number;
  /** Local date the game ended on; a streak day needs solvedOn equal to the puzzle date. */
  solvedOn: string;
}

export interface StatsData {
  solves: Partial<Record<ModeId, number>>;
  fails: Partial<Record<ModeId, number>>;
  /** Keyed by `${size}x${size}:${difficulty}`. */
  times: Record<string, TimeStat>;
  /** Keyed by puzzle date YYYY-MM-DD. */
  daily: Record<string, DailyEntry>;
  /** Save keys already counted, newest last. */
  recorded: string[];
}

const EMPTY: StatsData = { solves: {}, fails: {}, times: {}, daily: {}, recorded: [] };

interface StatsStore extends StatsData {
  record(g: GameState, today?: string): void;
  clear(): void;
}

export function timeKey(size: number, difficulty: number): string {
  return `${size}x${size}:${difficulty}`;
}

/** Adds one finished game to the stats. Pure, for tests. */
export function addResult(s: StatsData, g: GameState, today: string = localDate()): StatsData {
  if (g.status !== 'solved' && g.status !== 'failed') return s;
  if (s.recorded.includes(g.key)) return s;
  const next: StatsData = {
    solves: { ...s.solves },
    fails: { ...s.fails },
    times: { ...s.times },
    daily: { ...s.daily },
    recorded: [...s.recorded, g.key].slice(-400),
  };
  if (g.status === 'solved') {
    next.solves[g.mode] = (next.solves[g.mode] ?? 0) + 1;
    const k = timeKey(g.puzzle.size, g.puzzle.difficulty);
    const t = next.times[k] ?? { count: 0, totalMs: 0, bestMs: 0 };
    next.times[k] = {
      count: t.count + 1,
      totalMs: t.totalMs + g.elapsedMs,
      bestMs: t.count ? Math.min(t.bestMs, g.elapsedMs) : g.elapsedMs,
    };
  } else {
    next.fails[g.mode] = (next.fails[g.mode] ?? 0) + 1;
  }
  if (g.mode === 'daily') {
    const date = g.key.startsWith('daily:') ? g.key.slice(6) : today;
    next.daily[date] = {
      status: g.status,
      ms: g.elapsedMs,
      mistakes: g.mistakes,
      hints: g.hintsUsed,
      solvedOn: today,
    };
  }
  return next;
}

function streakDay(daily: Record<string, DailyEntry>, date: string): boolean {
  const e = daily[date];
  return !!e && e.status === 'solved' && e.solvedOn === date;
}

/** Consecutive solved Dailies ending today, or yesterday when today is not solved yet. */
export function currentStreak(daily: Record<string, DailyEntry>, today: string = localDate()): number {
  let day = streakDay(daily, today) ? today : shiftDate(today, -1);
  let n = 0;
  while (streakDay(daily, day)) {
    n++;
    day = shiftDate(day, -1);
  }
  return n;
}

export function bestStreak(daily: Record<string, DailyEntry>): number {
  const days = Object.keys(daily).filter((d) => streakDay(daily, d)).sort();
  let best = 0;
  let run = 0;
  let prev = '';
  for (const d of days) {
    run = prev && shiftDate(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

function sanitize(raw: unknown): StatsData {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<StatsData>;
  const obj = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  return {
    solves: obj(r.solves) as StatsData['solves'],
    fails: obj(r.fails) as StatsData['fails'],
    times: obj(r.times) as StatsData['times'],
    daily: obj(r.daily) as StatsData['daily'],
    recorded: Array.isArray(r.recorded) ? r.recorded.filter((k) => typeof k === 'string') : [],
  };
}

export const useStats = create<StatsStore>()(
  persist(
    (set) => ({
      ...EMPTY,
      record: (g, today) => set((s) => addResult(sanitize(s), g, today)),
      clear: () => set({ ...EMPTY }),
    }),
    {
      name: 'cellbound:v1:stats',
      version: 1,
      storage: safeStorage,
      partialize: (s) => sanitize(s),
      migrate: (persisted) => sanitize(persisted),
      merge: (persisted, current) => ({ ...current, ...sanitize(persisted) }),
    },
  ),
);
