// What a player's devices hold together. Each device keeps its own stats and sends them up as they
// are; the server keeps one copy per device, and a device shows its own stats with the others'
// added in. Counts add up, bests keep the better one, and a Daily played on two devices counts
// once, as its better result. Pure, so the server and the app merge the same way.
import type { DailyEntry, StatsData } from '../game/stats';
import type { DailyRecord, RankedStats, RunStats } from '../modes/run/stats';

const add = <K extends string>(a: Partial<Record<K, number>>, b: Partial<Record<K, number>>): Partial<Record<K, number>> => {
  const out: Partial<Record<K, number>> = { ...a };
  for (const [k, v] of Object.entries(b) as [K, number][]) out[k] = (out[k] ?? 0) + v;
  return out;
};

/** The better of two results for the same Daily: solved over failed, then faster, then cleaner. */
export function betterDaily(a: DailyEntry, b: DailyEntry): DailyEntry {
  if (a.status !== b.status) return a.status === 'solved' ? a : b;
  if (a.ms !== b.ms) return a.ms < b.ms ? a : b;
  return a.mistakes + a.hints <= b.mistakes + b.hints ? a : b;
}

export function mergeStats(a: StatsData, b: StatsData): StatsData {
  const times = { ...a.times };
  for (const [k, t] of Object.entries(b.times)) {
    const s = times[k];
    times[k] = s ? { count: s.count + t.count, totalMs: s.totalMs + t.totalMs, bestMs: !s.count ? t.bestMs : !t.count ? s.bestMs : Math.min(s.bestMs, t.bestMs) } : t;
  }
  const daily = { ...a.daily };
  for (const [date, e] of Object.entries(b.daily)) daily[date] = daily[date] ? betterDaily(daily[date], e) : e;
  // The badges' counts, only where a device has them, so stats without any stay as they were.
  const fog = (a.fog ?? 0) + (b.fog ?? 0);
  const rules = a.rules || b.rules ? add(a.rules ?? {}, b.rules ?? {}) : undefined;
  return { solves: add(a.solves, b.solves), fails: add(a.fails, b.fails), times, daily, recorded: a.recorded, ...(fog ? { fog } : {}), ...(rules ? { rules } : {}) };
}

const higher = <T extends { score: number }>(a: T | null, b: T | null): T | null => (!a ? b : !b ? a : b.score > a.score ? b : a);

/** The badges' counts of two devices; a device last synced before 2026-10-31 sent none. */
function mergeRanked(a: RankedStats | undefined, b: RankedStats | undefined): RankedStats {
  return {
    bosses: (a?.bosses ?? 0) + (b?.bosses ?? 0),
    bossRules: add(a?.bossRules ?? {}, b?.bossRules ?? {}),
    cleanBoards: (a?.cleanBoards ?? 0) + (b?.cleanBoards ?? 0),
    tiers: Array.from({ length: 9 }, (_, t) => (a?.tiers?.[t] ?? 0) + (b?.tiers?.[t] ?? 0)),
    best: Math.max(a?.best ?? 0, b?.best ?? 0),
  };
}

export function mergeRunStats(a: RunStats, b: RunStats): RunStats {
  const dailyBest: Record<string, DailyRecord> = { ...a.dailyBest };
  for (const [date, r] of Object.entries(b.dailyBest)) dailyBest[date] = higher(dailyBest[date] ?? null, r)!;
  const codex: RunStats['codex'] = { ...a.codex };
  for (const [id, c] of Object.entries(b.codex) as [keyof RunStats['codex'], { n: number; best: number }][]) {
    const s = codex[id];
    codex[id] = s ? { n: s.n + c.n, best: Math.max(s.best, c.best) } : c;
  }
  return {
    started: a.started + b.started,
    won: a.won + b.won,
    wonEasy: a.wonEasy + b.wonEasy,
    wonHard: (a.wonHard ?? 0) + (b.wonHard ?? 0),
    lost: a.lost + b.lost,
    abandoned: a.abandoned + b.abandoned,
    bestFree: higher(a.bestFree, b.bestFree),
    bestEasy: higher(a.bestEasy, b.bestEasy),
    bestHard: higher(a.bestHard, b.bestHard),
    dailyBest,
    topAnte: Math.max(a.topAnte, b.topAnte),
    bosses: a.bosses + b.bosses,
    cleanBoards: a.cleanBoards + b.cleanBoards,
    codex,
    best: !a.best ? b.best : !b.best ? a.best : b.best.points > a.best.points ? b.best : a.best,
    ranked: mergeRanked(a.ranked, b.ranked),
  };
}
