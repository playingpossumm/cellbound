import { describe, expect, it } from 'vitest';
import { cardPool } from './cards';
import { abandon, advance, choose, finishBoard, newRun, type BoardEnd, type RunState } from './state';
import {
  MILESTONES,
  bestDaily,
  cardsUnlockedBy,
  emptyStats,
  newlyUnlocked,
  onBoardEnd,
  onBoardStart,
  onRunEnd,
  onRunStart,
  unlockedSet,
} from './stats';
import { RUN_KEY, emptyStorage, loadRunStorage, saveRunStorage, type StorageLike } from './storage';

const pool = cardPool(new Set(), true);
const clean: BoardEnd = { status: 'solved', mistakes: 0, hintsUsed: 0, elapsedMs: 60_000 };

function finishedRun(seed: string, daily: string | null, mistakes = 0): RunState {
  let r = newRun(seed, daily, 1);
  for (let i = 0; i < 4; i++) {
    r = advance(finishBoard(r, i === 0 ? { ...clean, mistakes } : clean), pool);
    r = choose(r, r.offer[0]);
  }
  return finishBoard(r, clean);
}

describe('unlock milestones', () => {
  it('start locked on a fresh install', () => {
    expect(unlockedSet(emptyStats()).size).toBe(0);
  });

  it('first run: opens after one finished run', () => {
    const s = onRunEnd(onRunStart(emptyStats()), finishedRun('t:1', null), '2026-10-23');
    expect(unlockedSet(s).has('first-run')).toBe(true);
    expect(s.finished).toBe(1);
  });

  it('board 3: opens when the third board starts', () => {
    let s = emptyStats();
    s = onBoardStart(s, 1);
    s = onBoardStart(s, 2);
    expect(unlockedSet(s).has('board-3')).toBe(false);
    s = onBoardStart(s, 3);
    expect(unlockedSet(s).has('board-3')).toBe(true);
    expect(onBoardStart(s, 2).topBoard).toBe(3);
  });

  it('full hearts: needs a finished run with 2 hearts or more left, not a failed one', () => {
    const run = finishedRun('t:2', null);
    expect(unlockedSet(onRunEnd(emptyStats(), { ...run, hearts: 1 }, 'x')).has('full-hearts')).toBe(false);
    expect(unlockedSet(onRunEnd(emptyStats(), { ...run, hearts: 2 }, 'x')).has('full-hearts')).toBe(true);
    const failed = finishBoard(newRun('t:3', null, 1), { status: 'failed', mistakes: 3, hintsUsed: 0, elapsedMs: 1 });
    expect(unlockedSet(onRunEnd(emptyStats(), failed, 'x')).has('full-hearts')).toBe(false);
  });

  it('cursed board: counts only cleared boards with a curse or bargain', () => {
    let r = newRun('t:4', null, 1);
    r = advance(finishBoard(r, clean), pool);
    r = choose({ ...r, offer: ['lantern', 'fog'] }, 'lantern');
    const plain = finishBoard(r, clean).results[1];
    expect(onBoardEnd(emptyStats(), plain).cursedCleared).toBe(0);
    let c = advance(finishBoard(newRun('t:5', null, 1), clean), pool);
    c = choose({ ...c, offer: ['hush'] }, 'hush');
    const cursed = finishBoard(c, clean).results[1];
    const s = onBoardEnd(emptyStats(), cursed);
    expect(s.cursedCleared).toBe(1);
    expect(unlockedSet(s).has('cursed-board')).toBe(true);
    const failed = finishBoard(c, { status: 'failed', mistakes: 3, hintsUsed: 0, elapsedMs: 1 }).results[1];
    expect(onBoardEnd(emptyStats(), failed).cursedCleared).toBe(0);
  });

  it('daily x3: needs three different dates, not three attempts of one date', () => {
    let s = emptyStats();
    for (const d of ['2026-10-21', '2026-10-21', '2026-10-21']) s = onRunEnd(s, finishedRun('run:' + d, d), d);
    expect(unlockedSet(s).has('daily-3')).toBe(false);
    s = onRunEnd(s, finishedRun('run:2026-10-22', '2026-10-22'), '2026-10-22');
    s = onRunEnd(s, finishedRun('run:2026-10-23', '2026-10-23'), '2026-10-23');
    expect(unlockedSet(s).has('daily-3')).toBe(true);
  });

  it('daily x3: a day where no board was cleared does not count', () => {
    let s = emptyStats();
    for (const d of ['2026-10-20', '2026-10-21', '2026-10-22']) s = onRunEnd(s, abandon(newRun('run:' + d, d, 1)), d);
    expect(Object.keys(s.dailyBest)).toHaveLength(3);
    expect(unlockedSet(s).has('daily-3')).toBe(false);
  });

  it('every milestone opens at least one card, and reports newly opened ones once', () => {
    for (const m of MILESTONES) expect(cardsUnlockedBy([m.id]).length).toBeGreaterThan(0);
    const before = emptyStats();
    const after = onRunEnd(before, finishedRun('t:6', null), 'x');
    expect(newlyUnlocked(before, after)).toEqual(expect.arrayContaining(['first-run', 'full-hearts']));
    expect(newlyUnlocked(after, after)).toEqual([]);
  });
});

describe('stats', () => {
  it('daily best is set by the first attempt only', () => {
    const date = '2026-10-23';
    const first = finishedRun('run:' + date, date, 2);
    const replay = finishedRun('run:' + date, date, 0);
    expect(replay.score).toBeGreaterThan(first.score);
    let s = onRunEnd(emptyStats(), first, date);
    s = onRunEnd(s, replay, date);
    expect(s.dailyBest[date].score).toBe(first.score);
    expect(bestDaily(s)).toEqual({ date, score: first.score });
  });

  it('a failed first attempt still sets the daily best', () => {
    const date = '2026-10-24';
    let r = newRun('run:' + date, date, 1);
    r = finishBoard(r, { status: 'failed', mistakes: 3, hintsUsed: 0, elapsedMs: 1 });
    const s = onRunEnd(emptyStats(), r, date);
    expect(s.dailyBest[date]).toMatchObject({ score: 0, boards: 0, outcome: 'failed' });
    expect(s.failed).toBe(1);
  });

  it('keeps the best free run only', () => {
    const lo = finishedRun('t:lo', null, 2);
    const hi = finishedRun('t:hi', null, 0);
    let s = onRunEnd(emptyStats(), hi, 'a');
    s = onRunEnd(s, lo, 'b');
    expect(s.bestFree).toEqual({ score: hi.score, date: 'a' });
    expect(Object.keys(s.dailyBest)).toHaveLength(0);
  });

  it('does not record a free run that scored nothing as a best', () => {
    let r = newRun('t:zero', null, 1);
    r = abandon(r);
    expect(onRunEnd(emptyStats(), r, 'x').bestFree).toBeNull();
  });

  it('ignores a run that has no outcome yet', () => {
    const s = emptyStats();
    expect(onRunEnd(s, newRun('t:open', null, 1), 'x')).toBe(s);
  });
});

function memory(): StorageLike & { data: Record<string, string> } {
  const data: Record<string, string> = {};
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
}

describe('storage', () => {
  it('uses the versioned key and starts empty', () => {
    expect(RUN_KEY).toBe('cellbound:run:v1');
    expect(loadRunStorage(memory())).toEqual(emptyStorage());
  });

  it('round trips an unfinished run and the stats', () => {
    const m = memory();
    const run = advance(finishBoard(newRun('t:save', '2026-10-23', 5), clean), pool);
    const stats = onRunStart(emptyStats());
    expect(saveRunStorage({ v: 1, current: run, last: null, stats }, m)).toBe(true);
    const back = loadRunStorage(m);
    expect(back.current).toEqual(run);
    expect(back.stats).toEqual(stats);
  });

  it('survives damaged data, wrong versions and missing storage', () => {
    const m = memory();
    m.data[RUN_KEY] = '{not json';
    expect(loadRunStorage(m)).toEqual(emptyStorage());
    m.data[RUN_KEY] = JSON.stringify({ v: 2, current: 1 });
    expect(loadRunStorage(m)).toEqual(emptyStorage());
    m.data[RUN_KEY] = JSON.stringify({ v: 1, current: { v: 1, seed: 3 }, stats: { finished: 'many' } });
    const back = loadRunStorage(m);
    expect(back.current).toBeNull();
    expect(back.stats.finished).toBe(0);
    expect(loadRunStorage(null)).toEqual(emptyStorage());
    expect(saveRunStorage(emptyStorage(), null)).toBe(false);
  });

  it('does not throw when storage refuses a write', () => {
    const full: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(saveRunStorage(emptyStorage(), full)).toBe(false);
  });
});
