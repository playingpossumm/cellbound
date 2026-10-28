// Difficulty and the boss counters. Easy and Hard cut each board to a step along the Normal ladder
// and scale the targets and the hearts, and a daily run is always Normal. Every boss rule shows
// from the start of its ante, the offers and shops before a boss lean toward what answers it, and
// with Scout the shop opens with its answer.
import { describe, expect, it } from 'vitest';
import { LYRA } from '../../engine/fixtures';
import type { TierProfile } from '../../engine/techniques';
import { anteOf, kindOf, SLOT_COUNT, SLOT_SPECS, specFor } from './boards';
import { bossAhead, bossesFor, BOSS_RULES, COUNTERS, SCOUT_STOCK, type BossRule } from './bosses';
import { ITEMS } from './items';
import { LENSES, lensPool } from './lenses';
import type { RunDifficulty, RunState } from './model';
import { makeOffer } from './offers';
import { REWARDS, rewardPool } from './rewards';
import { stockFor } from './shop';
import { modsFor, newRun, shareText } from './state';
import { emptyStats, hardOpen, onRunEnd } from './stats';
import { emptyStorage, isRunState, loadRunStorage, saveRunStorage, type StorageLike } from './storage';
import { targetFor } from './targets';
import { DIFFICULTY, SHOP } from './tuning';

const LEVELS: RunDifficulty[] = ['easy', 'normal', 'hard'];
const starter = rewardPool(new Set(), true);
const lenses = lensPool(new Set(), true);
const withBosses = (seed: string, first: BossRule, over: Partial<RunState> = {}): RunState => ({ ...newRun(seed, null, 1), bosses: [first, 'mute', 'fog'], ...over });

describe('difficulty', () => {
  it('cuts every board to a spec on the Normal ladder: Easy never harder, Hard never easier, each keeping its ante and kind', () => {
    for (const level of LEVELS) expect(DIFFICULTY.ladder[level]).toHaveLength(SLOT_COUNT);
    for (let slot = 0; slot < SLOT_COUNT; slot++) {
      const [easy, normal, hard] = LEVELS.map((level) => specFor(slot, level));
      expect(normal).toEqual(SLOT_SPECS[slot]);
      for (const s of [easy, hard]) {
        expect(s.ante).toBe(anteOf(slot));
        expect(s.kind).toBe(kindOf(slot));
        expect(SLOT_SPECS.some((x) => x.minutes === s.minutes && x.difficulty === s.difficulty)).toBe(true);
      }
      expect(easy.difficulty).toBeLessThanOrEqual(normal.difficulty);
      expect(easy.minutes[1]).toBeLessThanOrEqual(normal.minutes[1]);
      expect(hard.difficulty).toBeGreaterThanOrEqual(normal.difficulty);
      expect(hard.minutes[1]).toBeGreaterThanOrEqual(normal.minutes[1]);
    }
  });

  it('scales the targets: Easy to three quarters of Normal, Hard to 1.3 times', () => {
    const profile: TierProfile = { typical: [0, 40, 12, 6, 0, 0, 0, 0, 0], expert: [0, 30, 12, 6, 2, 1, 0, 0, 0] };
    for (let slot = 0; slot < SLOT_COUNT; slot++) {
      const normal = targetFor(slot, profile);
      expect(targetFor(slot, profile, 'normal')).toBe(normal);
      expect(targetFor(slot, profile, 'easy') / normal).toBeCloseTo(DIFFICULTY.target.easy, 1);
      expect(targetFor(slot, profile, 'hard') / normal).toBeCloseTo(DIFFICULTY.target.hard, 1);
    }
  });

  it('starts a free run with its own hearts, and a daily run always on Normal', () => {
    for (const level of LEVELS) {
      const run = newRun('t:level', null, 1, false, level);
      expect(run.difficulty).toBe(level);
      expect(run.hearts).toBe(DIFFICULTY.hearts[level]);
      expect(run.maxHearts).toBe(DIFFICULTY.hearts[level]);
    }
    const daily = newRun('t:daily', '2026-10-28', 1, false, 'hard');
    expect(daily.difficulty).toBe('normal');
    expect(daily.hearts).toBe(DIFFICULTY.hearts.normal);
  });

  it('never draws Fish Market on Easy, and draws the bosses it always did on Normal', () => {
    const lastOnHard = new Set<BossRule>();
    for (let k = 0; k < 300; k++) {
      const easy = bossesFor(`t:boss${k}`, 'easy');
      expect(easy).not.toContain('fish');
      expect(new Set(easy).size).toBe(3);
      expect(bossesFor(`t:boss${k}`, 'normal')).toEqual(bossesFor(`t:boss${k}`));
      lastOnHard.add(bossesFor(`t:boss${k}`, 'hard')[2]);
    }
    expect(lastOnHard.has('fish')).toBe(true);
  });

  it('gives a Clock boss on Hard the longer clock of its harder board', () => {
    const hard: RunState = { ...newRun('t:clock', null, 1, false, 'hard'), bosses: ['clock', 'fog', 'mute'] };
    const normal: RunState = { ...hard, difficulty: 'normal' };
    expect(modsFor(hard, 2, LYRA).timeLimitMs).toBeGreaterThan(modsFor(normal, 2, LYRA).timeLimitMs!);
  });

  it('names Easy and Hard in the share text, and leaves Normal as it was', () => {
    expect(shareText(newRun('t:share', null, 1, false, 'hard')).split('\n')[0]).toMatch(/free run on Hard$/);
    expect(shareText(newRun('t:share', null, 1, false, 'easy')).split('\n')[0]).toMatch(/free run on Easy$/);
    expect(shareText(newRun('t:share', null, 1)).split('\n')[0]).toMatch(/free run$/);
  });

  it('keeps the best of each difficulty, counts wins on Easy apart, and opens Hard after a win on Normal', () => {
    const ended = (level: RunDifficulty, score: number, outcome: RunState['outcome']): RunState => ({ ...newRun(`t:${level}${score}`, null, 1, false, level), outcome, score });
    let s = onRunEnd(emptyStats(), ended('easy', 900, 'won'), '2026-10-28');
    expect(s.bestEasy).toEqual({ score: 900, date: '2026-10-28' });
    expect(s.bestFree).toBeNull();
    expect([s.won, s.wonEasy]).toEqual([1, 1]);
    expect(hardOpen(s)).toBe(false);
    s = onRunEnd(s, ended('normal', 700, 'lost'), '2026-10-28');
    expect(s.bestFree!.score).toBe(700);
    expect(hardOpen(s)).toBe(false);
    s = onRunEnd(s, ended('normal', 800, 'won'), '2026-10-28');
    expect(hardOpen(s)).toBe(true);
    s = onRunEnd(s, ended('hard', 1200, 'lost'), '2026-10-28');
    expect(s.bestHard!.score).toBe(1200);
    expect(s.bestFree!.score).toBe(800);
    // A daily run is always Normal, so winning one opens Hard too.
    const daily: RunState = { ...newRun('t:day', '2026-10-28', 1), outcome: 'won', score: 500 };
    expect(hardOpen(onRunEnd(emptyStats(), daily, '2026-10-28'))).toBe(true);
  });

  it('saves the pick and the new stats, and drops a run of a difficulty it does not know', () => {
    const map = new Map<string, string>();
    const mem: StorageLike = { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) };
    saveRunStorage({ ...emptyStorage(), pick: 'easy', stats: { ...emptyStats(), won: 3, wonEasy: 2, bestHard: { score: 5, date: '2026-10-28' } } }, mem);
    const back = loadRunStorage(mem);
    expect(back.pick).toBe('easy');
    expect(back.stats.wonEasy).toBe(2);
    expect(back.stats.bestHard).toEqual({ score: 5, date: '2026-10-28' });
    expect(back.stats.bestEasy).toBeNull();
    map.set('cellbound:run:v2', JSON.stringify({ ...emptyStorage(), pick: 'nightmare' }));
    expect(loadRunStorage(mem).pick).toBeUndefined();
    expect(isRunState(newRun('t:ok', null, 1, false, 'hard'))).toBe(true);
    expect(isRunState({ ...newRun('t:bad', null, 1), difficulty: 'nightmare' })).toBe(false);
    // A run saved before there was a choice has no difficulty, and is Normal.
    const { difficulty: _, ...old } = newRun('t:old', null, 1);
    expect(isRunState(old)).toBe(true);
  });
});

describe('the boss ahead', () => {
  it('is the ante boss after its Small or Big board, and none after the boss', () => {
    const run = newRun('t:ahead', null, 1);
    expect([0, 1, 2, 3, 5, 7, 8].map((slot) => bossAhead(run, slot))).toEqual([run.bosses[0], run.bosses[0], null, run.bosses[1], null, run.bosses[2], null]);
  });

  it('has an answer for every rule, in the catalogues', () => {
    for (const rule of BOSS_RULES) {
      const c = COUNTERS[rule];
      expect(c.rewards.length + c.items.length + c.lenses.length).toBeGreaterThan(0);
      for (const id of c.rewards) expect(REWARDS.some((r) => r.id === id)).toBe(true);
      for (const id of c.items) expect(ITEMS.some((i) => i.id === id)).toBe(true);
      for (const id of c.lenses) expect(LENSES.some((l) => l.id === id)).toBe(true);
      expect(c.items).toContain(SCOUT_STOCK[rule]);
    }
  });

  it('makes the cards that answer it turn up more often in the offers before it, and only before it', () => {
    let glass = 0;
    let fog = 0;
    for (let k = 0; k < 300; k++) {
      const shields = (run: RunState) => makeOffer(run, 'reward', starter).cards.filter((c) => COUNTERS.glass.rewards.includes(c)).length;
      glass += shields(withBosses(`t:lean${k}`, 'glass', { slot: 1 }));
      fog += shields(withBosses(`t:lean${k}`, 'fog', { slot: 1 }));
      // After the boss there is nothing ahead in the ante to lean toward.
      expect(makeOffer(withBosses(`t:lean${k}`, 'glass', { slot: 2 }), 'boss', starter)).toEqual(makeOffer(withBosses(`t:lean${k}`, 'fog', { slot: 2 }), 'boss', starter));
    }
    expect(glass).toBeGreaterThan(fog * 1.5);
  });

  it('makes the shops before it stock its answer more often', () => {
    let clock = 0;
    let fog = 0;
    for (let k = 0; k < 300; k++) {
      if (stockFor(withBosses(`t:stock${k}`, 'clock'), 0, 0, lenses).items.includes('inkTime')) clock += 1;
      if (stockFor(withBosses(`t:stock${k}`, 'fog'), 0, 0, lenses).items.includes('inkTime')) fog += 1;
    }
    expect(clock).toBeGreaterThan(fog * 1.5);
  });

  it('with Scout, opens every shop before a boss with what answers its rule, but leaves a reroll and the shop after the boss to the draw', () => {
    for (const rule of BOSS_RULES) {
      for (let k = 0; k < 30; k++) {
        const run = withBosses(`t:scout${k}`, rule, { perks: { scout: 1 } });
        for (const slot of [0, 1]) {
          const stock = stockFor(run, slot, 0, lenses);
          expect(stock.items).toContain(SCOUT_STOCK[rule]);
          expect(new Set(stock.items).size).toBe(SHOP.items);
        }
      }
    }
    let rerolled = 0;
    let after = 0;
    for (let k = 0; k < 60; k++) {
      const run = withBosses(`t:scout${k}`, 'glass', { perks: { scout: 1 } });
      if (!stockFor(run, 0, 1, lenses).items.includes('inkVoid')) rerolled += 1;
      if (!stockFor(run, 2, 0, lenses).items.includes('inkVoid')) after += 1;
    }
    expect(rerolled).toBeGreaterThan(0);
    expect(after).toBeGreaterThan(0);
  });
});
