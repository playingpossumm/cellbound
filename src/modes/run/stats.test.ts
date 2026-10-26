import { describe, expect, it } from 'vitest';
import { LENSES } from './lenses';
import type { BoardResult, RunState } from './model';
import { REWARDS } from './rewards';
import { newRun } from './state';
import { addToCodex, bestDaily, emptyStats, MILESTONES, onBoardEnd, onBoardStart, onRunEnd, onRunStart, opensWith, unlockedNames, unlockedSet } from './stats';
import { emptyStorage, isRunState, LEGACY_KEY, legacyRuns, loadRunStorage, RUN_KEY, saveRunStorage, type StorageLike } from './storage';

function memory(seed: Record<string, string> = {}): StorageLike & { map: Map<string, string> } {
  const map = new Map(Object.entries(seed));
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) };
}

const result = (over: Partial<BoardResult> = {}): BoardResult => ({
  slot: 0,
  status: 'cleared',
  score: 1000,
  target: 800,
  coins: null,
  heartsLost: 0,
  heartsAfter: 3,
  mistakes: 0,
  hintsUsed: 0,
  elapsedMs: 1,
  tech: {},
  best: null,
  clean: 0,
  rule: null,
  ...over,
});
const ended = (over: Partial<RunState>): RunState => ({ ...newRun('t:s', null, 1), ...over });

describe('run stats', () => {
  it('count runs, wins, losses and the furthest ante', () => {
    let s = onRunStart(emptyStats());
    s = onBoardStart(s, 4);
    expect(s).toMatchObject({ started: 1, topAnte: 2 });
    s = onRunEnd(s, ended({ outcome: 'won', score: 5000 }), '2026-10-26');
    s = onRunEnd(s, ended({ outcome: 'lost', score: 9000 }), '2026-10-27');
    s = onRunEnd(s, ended({ outcome: 'abandoned', score: 10 }), '2026-10-27');
    expect(s).toMatchObject({ won: 1, lost: 1, abandoned: 1, bestFree: { score: 9000, date: '2026-10-27' } });
  });

  it('keep the first attempt of a daily run as its best, never a replay', () => {
    let s = emptyStats();
    s = onRunEnd(s, ended({ daily: '2026-10-26', outcome: 'lost', score: 3000, results: [result()] }), '2026-10-26');
    s = onRunEnd(s, ended({ daily: '2026-10-26', outcome: 'won', score: 9000, replay: true }), '2026-10-26');
    expect(s.dailyBest['2026-10-26']).toEqual({ score: 3000, cleared: 1, outcome: 'lost' });
    expect(bestDaily(s)).toEqual({ date: '2026-10-26', score: 3000 });
  });

  it('fill the codex with placements and the best single placement per technique', () => {
    let s = addToCodex(emptyStats(), { xWing: { n: 2, points: 900, top: 600 }, nakedSingle: { n: 30, points: 600, top: 40 } }, { technique: 'xWing', points: 600 });
    s = addToCodex(s, { xWing: { n: 1, points: 200, top: 200 } }, { technique: 'xWing', points: 200 });
    expect(s.codex.xWing).toEqual({ n: 3, best: 600 });
    expect(s.codex.nakedSingle).toEqual({ n: 30, best: 40 });
    expect(s.best).toEqual({ technique: 'xWing', points: 600 });
  });

  it('count a cleared boss and a board finished with every box clean', () => {
    const s = onBoardEnd(emptyStats(), result({ rule: 'fog' }), true);
    expect(s).toMatchObject({ bosses: 1, cleanBoards: 1 });
    expect(onBoardEnd(emptyStats(), result({ rule: 'fog', status: 'missed' }), false).bosses).toBe(0);
  });
});

describe('unlocks', () => {
  it('open from the milestones, each opening at least one lens or card', () => {
    for (const m of MILESTONES) {
      const o = opensWith(m.id);
      expect(o.lenses.length + o.rewards.length, m.id).toBeGreaterThan(0);
    }
    // Every locked lens and card has a milestone.
    for (const x of [...LENSES, ...REWARDS]) if (x.unlock) expect(MILESTONES.some((m) => m.id === x.unlock)).toBe(true);
  });

  it('follow the counters: an X-Wing opens Fishbowl and Fisheye, a win opens Mirror and Compound', () => {
    expect(unlockedSet(emptyStats()).size).toBe(0);
    const fish = addToCodex(emptyStats(), { xWing: { n: 1, points: 150, top: 150 } }, null);
    expect([...unlockedSet(fish)]).toEqual(['xwing']);
    expect(unlockedNames(['xwing']).sort()).toEqual(['Fishbowl', 'Fisheye']);
    expect(unlockedNames(['win']).sort()).toEqual(['Compound', 'Mirror']);
  });
});

describe('saves', () => {
  it('live under cellbound:run:v2 and come back the same', () => {
    const store = memory();
    const data = { ...emptyStorage(), current: newRun('t:save', null, 7) };
    expect(saveRunStorage(data, store)).toBe(true);
    expect([...store.map.keys()]).toEqual([RUN_KEY]);
    expect(RUN_KEY).toBe('cellbound:run:v2');
    expect(loadRunStorage(store)).toEqual(data);
  });

  it('never resume or rewrite a run of the first Run, and still count its runs', () => {
    const v1 = JSON.stringify({ v: 1, current: { v: 1, seed: 'run:2026-10-20', index: 2 }, last: null, stats: { started: 7, finished: 2 } });
    const store = memory({ [LEGACY_KEY]: v1 });
    expect(LEGACY_KEY).toBe('cellbound:run:v1');
    expect(loadRunStorage(store).current).toBeNull();
    saveRunStorage({ ...emptyStorage(), current: newRun('t:new', null, 1) }, store);
    expect(store.map.get(LEGACY_KEY)).toBe(v1);
    expect(legacyRuns(store)).toBe(7);
    expect(legacyRuns(memory())).toBe(0);
    expect(legacyRuns(memory({ [LEGACY_KEY]: '{oops' }))).toBe(0);
  });

  it('drop a damaged run or stats rather than crash', () => {
    const run = newRun('t:bad', null, 1);
    expect(isRunState(run)).toBe(true);
    for (const bad of [
      { ...run, v: 1 },
      { ...run, slot: 12 },
      { ...run, phase: 'dancing' },
      { ...run, bosses: ['fog', 'fog'] },
      { ...run, levels: [1, 2] },
      { ...run, live: { key: 3 } },
      { ...run, results: [{ slot: 'x' }] },
    ]) {
      expect(isRunState(bad)).toBe(false);
    }
    const store = memory({ [RUN_KEY]: JSON.stringify({ v: 2, current: { ...run, slot: -1 }, last: run, stats: { started: 'many', won: 2, codex: { xWing: { n: 1 } } } }) });
    const loaded = loadRunStorage(store);
    expect(loaded.current).toBeNull();
    expect(loaded.last).toEqual(run);
    expect(loaded.stats).toMatchObject({ started: 0, won: 2, codex: { xWing: { n: 1, best: 0 } } });
    expect(loadRunStorage(memory({ [RUN_KEY]: 'not json' }))).toEqual(emptyStorage());
    expect(loadRunStorage(null)).toEqual(emptyStorage());
  });
});
