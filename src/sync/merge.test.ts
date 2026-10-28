import { describe, expect, it } from 'vitest';
import type { DailyEntry, StatsData } from '../game/stats';
import { emptyStats } from '../modes/run/stats';
import { betterDaily, mergeRunStats, mergeStats } from './merge';

const day = (over: Partial<DailyEntry> = {}): DailyEntry => ({ status: 'solved', ms: 300_000, mistakes: 0, hints: 0, solvedOn: '2026-10-28', ...over });
const stats = (over: Partial<StatsData> = {}): StatsData => ({ solves: {}, fails: {}, times: {}, daily: {}, recorded: [], ...over });

describe("a player's devices, together", () => {
  it('adds the counts and keeps the best time', () => {
    const phone = stats({ solves: { daily: 3, free: 1 }, times: { '9x9:2': { count: 2, totalMs: 600_000, bestMs: 250_000 } } });
    const laptop = stats({ solves: { daily: 2 }, fails: { run: 1 }, times: { '9x9:2': { count: 1, totalMs: 200_000, bestMs: 200_000 }, '6x6:1': { count: 1, totalMs: 90_000, bestMs: 90_000 } } });
    const both = mergeStats(phone, laptop);
    expect(both.solves).toEqual({ daily: 5, free: 1 });
    expect(both.fails).toEqual({ run: 1 });
    expect(both.times['9x9:2']).toEqual({ count: 3, totalMs: 800_000, bestMs: 200_000 });
    expect(both.times['6x6:1']).toEqual({ count: 1, totalMs: 90_000, bestMs: 90_000 });
  });

  it('counts a Daily played on two devices once, as its better result', () => {
    expect(betterDaily(day({ status: 'failed', ms: 100 }), day({ ms: 900_000 })).status).toBe('solved');
    expect(betterDaily(day({ ms: 400_000 }), day({ ms: 350_000 })).ms).toBe(350_000);
    expect(betterDaily(day({ mistakes: 2 }), day({ hints: 1 })).hints).toBe(1);
    const both = mergeStats(stats({ daily: { '2026-10-27': day({ ms: 400_000 }) } }), stats({ daily: { '2026-10-27': day({ ms: 380_000 }), '2026-10-28': day() } }));
    expect(Object.keys(both.daily).sort()).toEqual(['2026-10-27', '2026-10-28']);
    expect(both.daily['2026-10-27'].ms).toBe(380_000);
  });

  it('adds up runs and keeps their bests', () => {
    const a = { ...emptyStats(), started: 4, won: 1, bestFree: { score: 40_000, date: '2026-10-20' }, dailyBest: { '2026-10-27': { score: 9_000, cleared: 4, outcome: 'lost' as const } }, topAnte: 3, codex: { xWing: { n: 2, best: 300 } }, best: { technique: 'xWing' as const, points: 300 } };
    const b = { ...emptyStats(), started: 2, lost: 2, bestFree: { score: 55_000, date: '2026-10-26' }, dailyBest: { '2026-10-27': { score: 12_000, cleared: 5, outcome: 'lost' as const }, '2026-10-28': { score: 3_000, cleared: 2, outcome: 'lost' as const } }, topAnte: 2, codex: { xWing: { n: 1, best: 450 }, nakedSingle: { n: 40, best: 30 } }, best: { technique: 'xWing' as const, points: 450 } };
    const both = mergeRunStats(a, b);
    expect([both.started, both.won, both.lost]).toEqual([6, 1, 2]);
    expect(both.bestFree?.score).toBe(55_000);
    expect(both.dailyBest['2026-10-27'].score).toBe(12_000);
    expect(both.dailyBest['2026-10-28'].score).toBe(3_000);
    expect(both.topAnte).toBe(3);
    expect(both.codex).toEqual({ xWing: { n: 3, best: 450 }, nakedSingle: { n: 40, best: 30 } });
    expect(both.best?.points).toBe(450);
  });

  it('changes nothing when the other device holds nothing', () => {
    const mine = stats({ solves: { daily: 1 }, daily: { '2026-10-28': day() } });
    expect(mergeStats(mine, stats())).toEqual(mine);
    const runs = { ...emptyStats(), started: 1 };
    expect(mergeRunStats(runs, emptyStats())).toEqual(runs);
  });
});
