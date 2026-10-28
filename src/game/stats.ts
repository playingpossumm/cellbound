// Solve statistics, Daily history and streaks.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ClueKind } from '../engine/types';
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
  /** Boards solved in fog, in any mode. */
  fog?: number;
  /** Boards solved with each rule, outside Learn. */
  rules?: Partial<Record<ClueKind, number>>;
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
    ...(s.fog ? { fog: s.fog } : {}),
    ...(s.rules ? { rules: { ...s.rules } } : {}),
  };
  if (g.status === 'solved') {
    next.solves[g.mode] = (next.solves[g.mode] ?? 0) + 1;
    if (g.fog) next.fog = (s.fog ?? 0) + 1;
    // Learn's practice boards teach one rule each, so they leave Variety to real boards.
    if (g.mode !== 'learn') {
      const rules = { ...(s.rules ?? {}) };
      for (const k of new Set(g.puzzle.clues.map((c) => c.kind))) rules[k] = (rules[k] ?? 0) + 1;
      next.rules = rules;
    }
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

// The streaks live in streaks.ts, which the leaderboard's server shares.
export { bestStreak, currentStreak } from './streaks';

function sanitize(raw: unknown): StatsData {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<StatsData>;
  const obj = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  return {
    solves: obj(r.solves) as StatsData['solves'],
    fails: obj(r.fails) as StatsData['fails'],
    times: obj(r.times) as StatsData['times'],
    daily: obj(r.daily) as StatsData['daily'],
    recorded: Array.isArray(r.recorded) ? r.recorded.filter((k) => typeof k === 'string') : [],
    ...(typeof r.fog === 'number' ? { fog: r.fog } : {}),
    ...(r.rules ? { rules: obj(r.rules) as StatsData['rules'] } : {}),
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
