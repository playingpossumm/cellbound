// localStorage for the Run: one key, one versioned object, and every access guarded, because
// storage can be missing, full or blocked (private windows, previews). The first Run kept its
// saves under cellbound:run:v1. That key is read for its run count only and never written: its
// run in progress is not resumed, and its runs still count.
import { BOSS_RULES } from './bosses';
import type { RunDifficulty, RunState } from './model';
import { emptyStats, type RunStats } from './stats';

export const RUN_KEY = 'cellbound:run:v2';
export const LEGACY_KEY = 'cellbound:run:v1';

export interface RunStorage {
  v: 2;
  /** The unfinished run, if any. */
  current: RunState | null;
  /** The run that ended most recently, for the summary on the Run home. */
  last: RunState | null;
  stats: RunStats;
  /** The difficulty last picked for a free run on this device; Normal when absent. */
  pick?: RunDifficulty;
}

export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export function emptyStorage(): RunStorage {
  return { v: 2, current: null, last: null, stats: emptyStats() };
}

function browserStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const PHASES = ['select', 'board', 'tally', 'reward', 'shop', 'done'];
const LEVELS: readonly unknown[] = ['easy', 'normal', 'hard'] satisfies RunDifficulty[];
const numbers = (x: unknown, length: number) => Array.isArray(x) && x.length === length && x.every((v) => v === null || isNum(v));

/** A shape check deep enough that a damaged save cannot crash a screen. */
export function isRunState(x: unknown): x is RunState {
  if (!isObj(x) || x.v !== 2) return false;
  const live = x.live;
  const liveOk =
    live === null ||
    (isObj(live) &&
      typeof live.key === 'string' &&
      isNum(live.slot) &&
      isNum(live.score) &&
      isNum(live.target) &&
      isNum(live.hearts) &&
      Array.isArray(live.scored) &&
      Array.isArray(live.units) &&
      Array.isArray(live.clues) &&
      Array.isArray(live.stolen) &&
      isObj(live.tech) &&
      isObj(live.hints) &&
      isObj(live.mods));
  return (
    liveOk &&
    typeof x.seed === 'string' &&
    (x.daily === null || typeof x.daily === 'string') &&
    (x.difficulty === undefined || LEVELS.includes(x.difficulty)) &&
    isNum(x.slot) &&
    x.slot >= 0 &&
    x.slot < 9 &&
    PHASES.includes(x.phase as string) &&
    isNum(x.hearts) &&
    isNum(x.maxHearts) &&
    isNum(x.shield) &&
    isNum(x.coins) &&
    isNum(x.hintPool) &&
    isNum(x.score) &&
    isNum(x.bonus) &&
    numbers(x.levels, 9) &&
    numbers(x.targets, 9) &&
    Array.isArray(x.bosses) &&
    x.bosses.length === 3 &&
    x.bosses.every((b) => BOSS_RULES.includes(b as never)) &&
    Array.isArray(x.lenses) &&
    x.lenses.every((l) => isObj(l) && typeof l.id === 'string') &&
    Array.isArray(x.items) &&
    Array.isArray(x.results) &&
    x.results.every((r) => isObj(r) && isNum(r.slot) && typeof r.status === 'string' && isNum(r.score) && isObj(r.tech)) &&
    Array.isArray(x.lastCats) &&
    isObj(x.perks) &&
    isObj(x.next) &&
    (x.offer === null || (isObj(x.offer) && Array.isArray(x.offer.cards))) &&
    (x.shop === null || (isObj(x.shop) && Array.isArray(x.shop.lenses) && Array.isArray(x.shop.items))) &&
    (x.pending === null || (isObj(x.pending) && isNum(x.pending.score)))
  );
}

function sanitizeStats(x: unknown): RunStats {
  const base = emptyStats();
  if (!isObj(x)) return base;
  const num = (v: unknown, d: number) => (isNum(v) ? v : d);
  const bestOf = (v: unknown) => (isObj(v) && isNum(v.score) ? { score: v.score, date: String(v.date ?? '') } : null);
  const dailyBest: RunStats['dailyBest'] = {};
  if (isObj(x.dailyBest)) {
    for (const [date, r] of Object.entries(x.dailyBest)) {
      if (isObj(r) && isNum(r.score)) {
        dailyBest[date] = {
          score: r.score,
          cleared: num(r.cleared, 0),
          outcome: r.outcome === 'won' || r.outcome === 'lost' || r.outcome === 'abandoned' ? r.outcome : 'lost',
        };
      }
    }
  }
  const codex: RunStats['codex'] = {};
  if (isObj(x.codex)) {
    for (const [id, c] of Object.entries(x.codex)) {
      if (isObj(c) && isNum(c.n)) codex[id as keyof RunStats['codex']] = { n: c.n, best: num(c.best, 0) };
    }
  }
  const best = isObj(x.best) && typeof x.best.technique === 'string' && isNum(x.best.points) ? (x.best as unknown as RunStats['best']) : null;
  const ranked: Record<string, unknown> = isObj(x.ranked) ? x.ranked : {};
  return {
    started: num(x.started, 0),
    won: num(x.won, 0),
    wonEasy: num(x.wonEasy, 0),
    wonHard: num(x.wonHard, 0),
    lost: num(x.lost, 0),
    abandoned: num(x.abandoned, 0),
    bestFree: bestOf(x.bestFree),
    bestEasy: bestOf(x.bestEasy),
    bestHard: bestOf(x.bestHard),
    dailyBest,
    topAnte: num(x.topAnte, 0),
    bosses: num(x.bosses, 0),
    cleanBoards: num(x.cleanBoards, 0),
    codex,
    best,
    ranked: {
      bosses: num(ranked.bosses, 0),
      bossRules: isObj(ranked.bossRules) ? (Object.fromEntries(Object.entries(ranked.bossRules).filter(([k, n]) => BOSS_RULES.includes(k as never) && isNum(n))) as RunStats['ranked']['bossRules']) : {},
      cleanBoards: num(ranked.cleanBoards, 0),
      tiers: Array.from({ length: 9 }, (_, t) => (Array.isArray(ranked.tiers) ? num(ranked.tiers[t], 0) : 0)),
      best: num(ranked.best, 0),
    },
  };
}

export function loadRunStorage(storage: StorageLike | null = browserStorage()): RunStorage {
  if (!storage) return emptyStorage();
  try {
    const raw = storage.getItem(RUN_KEY);
    if (!raw) return emptyStorage();
    const parsed: unknown = JSON.parse(raw);
    if (!isObj(parsed) || parsed.v !== 2) return emptyStorage();
    return {
      v: 2,
      current: isRunState(parsed.current) ? parsed.current : null,
      last: isRunState(parsed.last) ? parsed.last : null,
      stats: sanitizeStats(parsed.stats),
      ...(LEVELS.includes(parsed.pick) ? { pick: parsed.pick as RunDifficulty } : {}),
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

/** Runs the first Run counted, read from its own key, which is left as it is. */
export function legacyRuns(storage: StorageLike | null = browserStorage()): number {
  if (!storage) return 0;
  try {
    const raw = storage.getItem(LEGACY_KEY);
    if (!raw) return 0;
    const parsed: unknown = JSON.parse(raw);
    const started = isObj(parsed) && isObj(parsed.stats) ? parsed.stats.started : 0;
    return isNum(started) && started > 0 ? Math.floor(started) : 0;
  } catch {
    return 0;
  }
}
