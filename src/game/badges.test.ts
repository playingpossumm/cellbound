import { describe, expect, it } from 'vitest';
import { LYRA } from '../engine/fixtures';
import { LESSONS } from '../modes/learn/lessons';
import { emptyStats } from '../modes/run/stats';
import type { RunStats } from '../modes/run/stats';
import { BLANK_STATS } from '../sync/rules';
import { BADGE_LEVELS, BADGES, badgeStates, levelOf, progressOf, type BadgeId, type BadgeInput } from './badges';
import { addResult, type DailyEntry, type StatsData } from './stats';
import { getGame, resetStoreForTesting, solveForTesting, startGame } from './store';

const day = (date: string, over: Partial<DailyEntry> = {}): [string, DailyEntry] => [date, { status: 'solved', ms: 15 * 60_000, mistakes: 1, hints: 0, solvedOn: date, ...over }];
const input = (stats: Partial<StatsData> = {}, run: Partial<RunStats> = {}, lessons = 0): BadgeInput => ({
  stats: { ...BLANK_STATS, ...stats },
  run: { ...emptyStats(), ...run },
  lessons,
});
const levels = (i: BadgeInput) => Object.fromEntries(badgeStates(i).map((b) => [b.def.id, b.level])) as Record<BadgeId, number>;
const byId = (id: BadgeId) => BADGES.find((b) => b.id === id)!;

describe('badges', () => {
  it('are twenty-one, each with three steps that get harder', () => {
    expect(BADGES).toHaveLength(21);
    expect(new Set(BADGES.map((b) => b.id)).size).toBe(21);
    expect(BADGE_LEVELS).toBe(63);
    for (const b of BADGES) {
      const [a, m, z] = b.steps;
      if (b.lower) expect(a > m && m > z).toBe(true);
      else expect(a < m && m < z).toBe(true);
    }
  });

  it('start at nothing for a new player', () => {
    expect(Object.values(levels(input())).every((n) => n === 0)).toBe(true);
  });

  it('read the Dailies: a streak, how many, the fastest and the clean ones', () => {
    const daily = Object.fromEntries([
      ...['2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28'].map((d) => day(d)),
      day('2026-10-10', { ms: 11 * 60_000, mistakes: 0 }),
      day('2026-10-05', { status: 'failed', ms: 3 * 60_000, mistakes: 0 }),
    ]);
    const l = levels(input({ daily }));
    expect(l.streak).toBe(2);
    expect(l.regular).toBe(1);
    // 11 minutes is within 20 and 12; the failed one is not a solve, however fast.
    expect(l.quick).toBe(2);
    expect(l.clean).toBe(1);
  });

  it('read the Run: techniques by tier, the best score and placement, bosses, rules beaten and wins by difficulty', () => {
    const run: Partial<RunStats> = {
      codex: { hiddenSingle: { n: 260, best: 40 }, clueSingle: { n: 30, best: 50 }, xWing: { n: 1, best: 900 }, kite: { n: 9, best: 700 }, chain: { n: 0, best: 0 } },
      bestFree: { score: 18_000, date: '2026-10-27' },
      bestHard: { score: 52_000, date: '2026-10-28' },
      bestEasy: { score: 300_000, date: '2026-10-28' },
      best: { technique: 'xWing', points: 2_480 },
      bosses: 12,
      bossRules: { fog: 2, glass: 1, clock: 0 },
      won: 3,
      wonEasy: 2,
      wonHard: 0,
      cleanBoards: 0,
    };
    const l = levels(input({}, run));
    expect([l.hidden, l.clues, l.xwing, l.chains]).toEqual([2, 1, 2, 0]);
    // Easy runs never count toward the best score, as on the leaderboard.
    expect(l.score).toBe(2);
    expect(l.hit).toBe(2);
    expect(l.boss).toBe(2);
    expect(l.rules).toBe(1);
    expect(l.victor).toBe(2);
    expect(levels(input({}, { ...run, wonHard: 1 })).victor).toBe(3);
    expect(levels(input({}, { won: 1, wonEasy: 1 })).victor).toBe(1);
  });

  it('count Fiendish boards, fog boards (the old Fog mode too), rules solved and lessons', () => {
    const stats: Partial<StatsData> = {
      times: { '9x9:5': { count: 4, totalMs: 1, bestMs: 1 }, '6x6:5': { count: 2, totalMs: 1, bestMs: 1 }, '9x9:4': { count: 9, totalMs: 1, bestMs: 1 } },
      solves: { free: 3, fog: 4 } as StatsData['solves'],
      fog: 7,
      rules: { thermo: 2, arrow: 1, cage: 5, kropki: 1, xv: 0, renban: 3, diagonal: 1 },
    };
    const l = levels(input(stats, {}, 6));
    expect(l.fiendish).toBe(2);
    expect(l.fog).toBe(2);
    expect(l.variety).toBe(2);
    expect(l.scholar).toBe(2);
    expect(levels(input({}, {}, LESSONS.length)).scholar).toBe(3);
  });

  it('end the Scholar badge on the last lesson', () => {
    expect(byId('scholar').steps[2]).toBe(LESSONS.length);
  });

  it('take a time at or under its step, and count at or over it', () => {
    expect(levelOf(byId('quick'), null)).toBe(0);
    expect(levelOf(byId('quick'), 12 * 60_000)).toBe(2);
    expect(levelOf(byId('quick'), 20 * 60_000 + 1)).toBe(0);
    expect(levelOf(byId('boss'), 9)).toBe(1);
    expect(levelOf(byId('boss'), 10)).toBe(2);
  });

  it('say how far the next level is', () => {
    const states = badgeStates(input({ daily: Object.fromEntries([day('2026-10-28', { ms: 11 * 60_000 })]) }, { best: { technique: 'xWing', points: 2_480 }, won: 1, wonEasy: 1 }));
    const of = (id: BadgeId) => progressOf(states.find((b) => b.def.id === id)!);
    expect(of('hit')).toEqual({ share: 2_480 / 8_000, text: '2,480 of 8,000 points' });
    expect(of('quick').text).toBe('Best 11:00, level III at 8 min');
    expect(of('victor').text).toBe('Won on Easy, Normal next');
    expect(of('chains')).toEqual({ share: 0, text: '0 of 1 placed' });
    expect(progressOf({ def: byId('boss'), value: 80, level: 3 })).toEqual({ share: 1, text: 'Every level earned' });
  });
});

describe('what the badges count', () => {
  it('counts boards solved in fog and each rule a solved board had, leaving Learn’s practice boards out', () => {
    resetStoreForTesting();
    startGame({ key: 'badge-fog', mode: 'free', puzzle: LYRA, fog: { start: [0, 1, 2], radius: 1 }, resume: false });
    solveForTesting();
    const s = addResult(BLANK_STATS, getGame()!, '2026-10-28');
    expect(s.fog).toBe(1);
    const kinds = [...new Set(LYRA.clues.map((c) => c.kind))].sort();
    expect(Object.keys(s.rules ?? {}).sort()).toEqual(kinds);
    startGame({ key: 'badge-learn', mode: 'learn', puzzle: LYRA, resume: false });
    solveForTesting();
    expect(addResult(s, getGame()!, '2026-10-28').rules).toEqual(s.rules);
  });
});
