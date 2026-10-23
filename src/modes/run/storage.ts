// localStorage for Run: one key, one versioned object. Every access is wrapped, because
// storage can be missing, full or blocked (private windows, previews).
import { emptyStats, type RunStats } from './stats';
import type { RunState } from './state';

export const RUN_KEY = 'cellbound:run:v1';

export interface RunStorage {
  v: 1;
  /** The unfinished run, if any. */
  current: RunState | null;
  /** The run that ended most recently, for the summary on the Run home. */
  last: RunState | null;
  stats: RunStats;
}

export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export function emptyStorage(): RunStorage {
  return { v: 1, current: null, last: null, stats: emptyStats() };
}

function browserStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** Light shape check so a damaged save cannot crash the screen. */
export function isRunState(x: unknown): x is RunState {
  if (!isObj(x) || x.v !== 1) return false;
  return (
    typeof x.seed === 'string' &&
    typeof x.index === 'number' &&
    typeof x.hearts === 'number' &&
    typeof x.shield === 'number' &&
    typeof x.score === 'number' &&
    typeof x.phase === 'string' &&
    Array.isArray(x.results) &&
    Array.isArray(x.perks) &&
    Array.isArray(x.offer) &&
    isObj(x.setup) &&
    isObj(x.setup.options) &&
    isObj(x.setup.mods)
  );
}

function sanitizeStats(x: unknown): RunStats {
  const base = emptyStats();
  if (!isObj(x)) return base;
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const best = isObj(x.bestFree) && typeof x.bestFree.score === 'number' ? x.bestFree : null;
  const daily: RunStats['dailyBest'] = {};
  if (isObj(x.dailyBest)) {
    for (const [date, r] of Object.entries(x.dailyBest)) {
      if (isObj(r) && typeof r.score === 'number') {
        daily[date] = {
          score: r.score,
          boards: num(r.boards, 0),
          outcome: r.outcome === 'finished' || r.outcome === 'failed' || r.outcome === 'abandoned' ? r.outcome : 'failed',
        };
      }
    }
  }
  return {
    started: num(x.started, 0),
    finished: num(x.finished, 0),
    failed: num(x.failed, 0),
    abandoned: num(x.abandoned, 0),
    bestFree: best ? { score: best.score as number, date: String(best.date ?? '') } : null,
    dailyBest: daily,
    topBoard: num(x.topBoard, 0),
    bestHearts: num(x.bestHearts, 0),
    cursedCleared: num(x.cursedCleared, 0),
  };
}

export function loadRunStorage(storage: StorageLike | null = browserStorage()): RunStorage {
  if (!storage) return emptyStorage();
  try {
    const raw = storage.getItem(RUN_KEY);
    if (!raw) return emptyStorage();
    const parsed: unknown = JSON.parse(raw);
    if (!isObj(parsed) || parsed.v !== 1) return emptyStorage();
    return {
      v: 1,
      current: isRunState(parsed.current) ? parsed.current : null,
      last: isRunState(parsed.last) ? parsed.last : null,
      stats: sanitizeStats(parsed.stats),
    };
  } catch {
    return emptyStorage();
  }
}

export function saveRunStorage(data: RunStorage, storage: StorageLike | null = browserStorage()): boolean {
  if (!storage) return false;
  try {
    storage.setItem(RUN_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}
