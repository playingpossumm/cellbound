import { describe, expect, it } from 'vitest';
import { dailySpec } from '../engine/daily';
import { LYRA } from '../engine/fixtures';
import { LESSONS } from '../modes/learn/lessons';
import { emptyRanked, emptyStats, type RankedStats, type RunStats } from '../modes/run/stats';
import { BLANK_STATS } from '../sync/rules';
import { BADGE_LEVELS, BADGES, badgeStates, levelOf, progressOf, showOf, type BadgeId, type BadgeInput } from './badges';
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
const ranked = (over: Partial<RankedStats>): RankedStats => ({ ...emptyRanked(), ...over });

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
    expect(l.streak).toBe(1);
    expect(l.regular).toBe(1);
    // Saturday's 15 minutes is 52 percent of its par of 29. The 6x6 Dailies before 24 October have
    // no par, and the failed one is not a solve, however fast.
    expect(l.quick).toBe(2);
    expect(l.clean).toBe(1);
  });

  it('time Quick against each Daily’s par, as its sentence says', () => {
    const par = (date: string) => dailySpec(date).minutes?.[1];
    // Monday 26 October to Sunday 1 November.
    expect(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'].map(par)).toEqual([8, 11, 14, 17, 20, 29, 25]);
    expect(byId('quick').counts).toContain('8 minutes on a Monday, up to 29 on a Saturday');
    const quick = (date: string, minutes: number, over: Partial<DailyEntry> = {}) => levels(input({ daily: Object.fromEntries([day(date, { ms: minutes * 60_000, ...over })]) })).quick;
    // Eight minutes is par on a Monday, and under half of Thursday's.
    expect([quick('2026-10-26', 8.1), quick('2026-10-26', 8), quick('2026-10-26', 6), quick('2026-10-26', 4)]).toEqual([0, 1, 2, 3]);
    expect(quick('2026-10-29', 8)).toBe(3);
    // The 6x6 Dailies before the 9x9s have no par, and a failed Daily is no solve.
    expect(quick('2026-10-10', 2)).toBe(0);
    expect(quick('2026-10-29', 2, { status: 'failed' })).toBe(0);
  });

  it('read the Run’s counts on Normal and Hard: techniques by tier, the best score and placement, bosses, rules beaten and wins by difficulty', () => {
    const run: Partial<RunStats> = {
      ranked: ranked({ tiers: [0, 900, 1200, 60, 0, 0, 3, 0, 0], best: 2_480, bosses: 12, bossRules: { fog: 2, glass: 1, clock: 0 } }),
      bestFree: { score: 18_000, date: '2026-10-27' },
      bestHard: { score: 52_000, date: '2026-10-28' },
      bestEasy: { score: 300_000, date: '2026-10-28' },
      won: 3,
      wonEasy: 2,
      wonHard: 0,
    };
    const l = levels(input({}, run));
    expect([l.hidden, l.clues, l.xwing, l.chains]).toEqual([2, 1, 1, 0]);
    // Easy runs never count toward the best score, as on the leaderboard.
    expect(l.score).toBe(2);
    expect(l.hit).toBe(2);
    expect(l.boss).toBe(2);
    expect(l.rules).toBe(1);
    expect(l.victor).toBe(2);
    expect(levels(input({}, { ...run, wonHard: 1 })).victor).toBe(3);
    expect(levels(input({}, { won: 1, wonEasy: 1 })).victor).toBe(1);
  });

  it('give Easy nothing but Victor’s first level, however much the codex and the unlocks count', () => {
    const run: Partial<RunStats> = {
      codex: { hiddenSingle: { n: 5000, best: 40 }, xWing: { n: 200, best: 900 }, chain: { n: 30, best: 1200 } },
      bosses: 60,
      cleanBoards: 30,
      best: { technique: 'chain', points: 9_000 },
      bestEasy: { score: 300_000, date: '2026-10-28' },
      won: 1,
      wonEasy: 1,
    };
    const l = levels(input({}, run));
    expect([l.hidden, l.xwing, l.chains, l.boss, l.rules, l.sweep, l.hit, l.score]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(l.victor).toBe(1);
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

  it('take a share of par at or under its step, and count at or over it', () => {
    expect(levelOf(byId('quick'), null)).toBe(0);
    expect(levelOf(byId('quick'), 0.75)).toBe(2);
    expect(levelOf(byId('quick'), 1.001)).toBe(0);
    expect(levelOf(byId('boss'), 9)).toBe(1);
    expect(levelOf(byId('boss'), 10)).toBe(2);
  });

  it('say how far the next level is', () => {
    const states = badgeStates(input({ daily: Object.fromEntries([day('2026-10-28', { ms: 11 * 60_000 })]) }, { ranked: ranked({ best: 2_480 }), won: 1, wonEasy: 1 }));
    const of = (id: BadgeId) => progressOf(states.find((b) => b.def.id === id)!);
    expect(of('hit')).toEqual({ share: 2_480 / 8_000, text: '2,480 of 8,000 points' });
    // 11 minutes of Wednesday's par of 14 is 78.6 percent, shown up to the next whole one.
    expect(of('quick').text).toBe('Best 79% of par, level II at ¾ par');
    expect(progressOf(badgeStates(input()).find((b) => b.def.id === 'quick')!).text).toBe('Level I at par');
    expect(byId('quick').steps.map((s) => showOf(byId('quick'), s))).toEqual(['par', '¾ par', '½ par']);
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
