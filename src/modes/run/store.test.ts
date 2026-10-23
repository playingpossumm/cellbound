import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LYRA } from '../../engine/fixtures';
import type { GeneratedPuzzle, GenerateOptions } from '../../engine/types';
import { attemptsFor, gameKey, generateWithFallback, loadBoard } from './board';
import { randomSeed, resetRunStore, runActions, unlockedByRun, useRunStore } from './store';

const solved = { status: 'solved' as const, mistakes: 0, hintsUsed: 0, elapsedMs: 70_000 };
const state = () => useRunStore.getState();

/** Plays a whole run through the controller, taking the first card each time. */
function playAll(mistakesOnFirst = 0) {
  for (let b = 0; b < 5; b++) {
    runActions.reportBoard(b === 0 ? { ...solved, mistakes: mistakesOnFirst } : solved, '2026-10-23');
    runActions.next();
    if (b < 4) runActions.pick(state().run!.offer[0]);
  }
}

describe('the run controller', () => {
  beforeEach(() => resetRunStore());

  it('starts a daily run with the shared seed and counts the start', () => {
    runActions.start('daily', 1000, '2026-10-23');
    const run = state().run!;
    expect(run.daily).toBe('2026-10-23');
    expect(run.seed).toBe('run:2026-10-23');
    expect(state().data.current).toEqual(run);
    expect(state().data.stats.started).toBe(1);
    expect(state().data.stats.topBoard).toBe(1);
  });

  it('starts free runs with different random seeds', () => {
    const seeds = new Set<string>();
    for (let i = 0; i < 20; i++) seeds.add(randomSeed());
    expect(seeds.size).toBe(20);
    for (const s of seeds) expect(s).toMatch(/^free:[0-9a-z]{14}$/);
  });

  it('still makes a seed when the browser has no secure random generator', () => {
    vi.stubGlobal('crypto', {
      getRandomValues() {
        throw new Error('not available');
      },
    });
    try {
      const a = randomSeed();
      const b = randomSeed();
      expect(a).toMatch(/^free:[0-9a-z]{14}$/);
      expect(a).not.toBe(b);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('plays through to a finished run, records it and clears the saved run', () => {
    runActions.start('free', 1000, '2026-10-23');
    playAll();
    const run = state().run!;
    expect(run.outcome).toBe('finished');
    expect(state().data.current).toBeNull();
    expect(state().data.last?.score).toBe(run.score);
    expect(state().data.stats.finished).toBe(1);
    expect(state().data.stats.bestFree?.score).toBe(run.score);
    expect(state().fresh).toEqual(expect.arrayContaining(['first-run', 'full-hearts']));
    runActions.next();
    expect(state().run!.phase).toBe('done');
  });

  it('announces every card a run opened, including ones opened on earlier boards', () => {
    runActions.start('free', 1000, '2026-10-23');
    // Reaching board 3 opens Insight while the run is still going.
    runActions.reportBoard(solved);
    runActions.next();
    runActions.pick(state().run!.offer[0]);
    runActions.reportBoard(solved);
    runActions.next();
    runActions.pick(state().run!.offer[0]);
    expect(state().data.stats.topBoard).toBe(3);
    runActions.reportBoard(solved);
    runActions.next();
    runActions.pick(state().run!.offer[0]);
    runActions.reportBoard(solved);
    runActions.next();
    runActions.pick(state().run!.offer[0]);
    runActions.reportBoard(solved);
    expect(state().run!.outcome).toBe('finished');
    expect(state().fresh).toEqual(expect.arrayContaining(['board-3', 'first-run']));
    expect(unlockedByRun(state().run!, state().data.stats)).toEqual(state().fresh);
  });

  it('keeps an unfinished run when leaving to the home screen, and resumes it', () => {
    runActions.start('free', 1000, '2026-10-23');
    runActions.reportBoard(solved);
    runActions.next();
    runActions.home();
    expect(state().run).toBeNull();
    expect(state().data.current?.phase).toBe('choose');
    runActions.resume();
    expect(state().run?.phase).toBe('choose');
  });

  it('ends the run on a failed board and says why', () => {
    runActions.start('free', 1000, '2026-10-23');
    runActions.reportBoard({ status: 'failed', mistakes: 3, hintsUsed: 0, elapsedMs: 10_000 });
    expect(state().run!.outcome).toBe('failed');
    expect(state().data.stats.failed).toBe(1);
    expect(state().data.current).toBeNull();
  });

  it('ignores a board report outside the board phase', () => {
    runActions.start('free', 1000, '2026-10-23');
    runActions.reportBoard(solved);
    const after = state().run;
    runActions.reportBoard(solved);
    expect(state().run).toBe(after);
  });

  it('gives up an unfinished run when a new one starts, and it counts as an attempt', () => {
    runActions.start('daily', 1000, '2026-10-23');
    runActions.reportBoard(solved, '2026-10-23');
    runActions.start('free', 2000, '2026-10-23');
    const stats = state().data.stats;
    expect(stats.abandoned).toBe(1);
    expect(stats.dailyBest['2026-10-23']?.outcome).toBe('abandoned');
    expect(state().data.last?.outcome).toBe('abandoned');
    expect(state().run?.daily).toBeNull();
  });

  it('marks a second daily run of the same date as a replay that keeps the first score', () => {
    runActions.start('daily', 1000, '2026-10-23');
    expect(state().run!.replay).toBe(false);
    playAll(2);
    const first = state().data.stats.dailyBest['2026-10-23'].score;
    runActions.home();
    runActions.start('daily', 5000, '2026-10-23');
    expect(state().run!.replay).toBe(true);
    playAll(0);
    expect(state().data.stats.dailyBest['2026-10-23'].score).toBe(first);
  });

  it('uses the starter pool only on a daily run', () => {
    runActions.start('daily', 1000, '2026-10-23');
    runActions.reportBoard(solved, '2026-10-23');
    runActions.next();
    const offered = state().run!.offer;
    expect(offered).toHaveLength(3);
    for (const id of offered) expect(['clear-sight', 'insight', 'steady-hand', 'packed-house', 'beacon']).not.toContain(id);
  });

  it('can pick only an offered card', () => {
    runActions.start('free', 1000, '2026-10-23');
    runActions.reportBoard(solved);
    runActions.next();
    const before = state().run;
    runActions.pick('not-a-card');
    expect(state().run).toBe(before);
    runActions.pick(before!.offer[1]);
    expect(state().run!.phase).toBe('board');
    expect(state().run!.index).toBe(1);
    expect(state().data.stats.topBoard).toBe(2);
  });
});

describe('board loading', () => {
  const opts: GenerateOptions = { size: 6, seed: 'run:x:2', rules: ['thermo', 'xv'], difficulty: 3, hiddenCageTotals: true };
  const puzzle = (o: GenerateOptions): GeneratedPuzzle => ({ ...LYRA, id: o.seed, seed: o.seed });

  it('builds the retry ladder the same way every time', () => {
    const a = attemptsFor(opts);
    expect(a).toEqual(attemptsFor(opts));
    expect(a[0]).toEqual(opts);
    expect(a.map((x) => x.seed)).toEqual(['run:x:2', 'run:x:2:b', 'run:x:2:c', 'run:x:2:d', 'run:x:2:e', 'run:x:2:f']);
    expect(a[2].difficulty).toBe(2);
    expect(a[3].hiddenCageTotals).toBe(false);
    // The last two attempts cannot fail for want of a rule mix: one rule, then classic rules.
    expect(a[4].rules).toEqual(['thermo']);
    expect(a[5].rules).toEqual([]);
  });

  it('falls back when the generator throws, and gives up after the last attempt', async () => {
    let calls = 0;
    const flaky = async (o: GenerateOptions) => {
      calls++;
      if (calls < 3) throw new Error('no puzzle');
      return puzzle(o);
    };
    const p = await generateWithFallback(opts, flaky);
    expect(p.seed).toBe('run:x:2:c');
    await expect(
      generateWithFallback(opts, async () => {
        throw new Error('never');
      }),
    ).rejects.toThrow('never');
  });

  it('caches a board so re-entering it does not generate again', async () => {
    let calls = 0;
    const gen = async (o: GenerateOptions) => {
      calls++;
      return puzzle(o);
    };
    const o = { ...opts, seed: 'cache-test' };
    const [a, b] = await Promise.all([loadBoard(o, gen), loadBoard(o, gen)]);
    expect(a).toBe(b);
    await loadBoard(o, gen);
    expect(calls).toBe(1);
  });

  it('keeps game keys unique per attempt', () => {
    expect(gameKey('run:2026-10-23', 3, 1000)).toBe('run:2026-10-23:3@' + (1000).toString(36));
    expect(gameKey('run:2026-10-23', 3, 1000)).not.toBe(gameKey('run:2026-10-23', 3, 2000));
    expect(gameKey('free:abc', 0, 5)).toMatch(/^run:free:abc:0@/);
  });
});
