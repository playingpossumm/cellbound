// @vitest-environment jsdom
// The Run store on the real game store: boards get ready with their targets, every placement is
// scored off the input path and in order, the hearts and the board's end follow, and saves go to
// cellbound:run:v2 only.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TECHNIQUES, type TechniqueId } from '../../engine/techniques';
import type { Digit, Puzzle } from '../../engine/types';
import { actions, getGame, resetStoreForTesting, startGame } from '../../game/store';

const engine = vi.hoisted(() => ({ technique: null as string | null, hard: null as string | null, calls: [] as { values: number[]; cell: number; digit: number }[], hardCalls: [] as number[] }));
vi.mock('../../engine/techniques', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../engine/techniques')>();
  return {
    ...real,
    classifyPlacementAsync: async (p: Puzzle, values: Digit[], cell: number, digit: Digit) => {
      engine.calls.push({ values: values.slice(), cell, digit });
      const t = engine.technique as TechniqueId | null;
      return t ? { technique: t, tier: real.TECHNIQUES[t].tier, name: real.TECHNIQUES[t].name, focus: [cell] } : real.classifyPlacementAsync(p, values, cell, digit);
    },
    hardestPlacementAsync: async (p: Puzzle, values: Digit[], cell: number, digit: Digit) => {
      engine.hardCalls.push(cell);
      const t = engine.hard as TechniqueId | null;
      return t ? { technique: t, tier: real.TECHNIQUES[t].tier, name: real.TECHNIQUES[t].name, focus: [cell] } : real.hardestPlacementAsync(p, values, cell, digit);
    },
  };
});

// Motion is off where the page cannot animate; a test turns it on to see the points fly.
const motion = vi.hoisted(() => ({ on: false }));
vi.mock('../../app/motion', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../app/motion')>();
  return { ...real, moves: () => motion.on };
});

import type { Prepared } from './board';
import { LEGACY_KEY, RUN_KEY } from './storage';
import { landPoints, playedBoard, resetRunStore, runActions, settled, useRunStore } from './store';
import { DIFFICULTY, INK } from './tuning';

const state = () => useRunStore.getState();

// Boards are built on this thread here (there is no worker), and a full parallel run can slow a build
// well past its usual second, so the waits and this file's tests get room to spare.
vi.setConfig({ testTimeout: 45_000 });

async function until(cond: () => boolean, what: string, ms = 30_000) {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

/** Plays the board on the select screen as the board view does: start it, then hand the game over. */
async function playBoard(): Promise<Puzzle> {
  const slot = state().run!.slot;
  await until(() => !!state().ready[slot], 'the board');
  runActions.play();
  const run = state().run!;
  const { puzzle, fog } = playedBoard(run, state().ready[slot] as Prepared);
  startGame({ key: run.live!.key, mode: 'run', puzzle, fog, mods: run.live!.mods, resume: false });
  runActions.sync(getGame()!);
  return puzzle;
}

const emptyCells = (p: Puzzle) => p.givens.map((d, i) => (d ? -1 : i)).filter((i) => i >= 0);
function type(cell: number, d: number) {
  actions.select(cell);
  actions.input(d);
}

beforeEach(() => {
  localStorage.clear();
  resetStoreForTesting();
  resetRunStore();
  engine.technique = null;
  engine.hard = null;
  engine.calls = [];
  engine.hardCalls = [];
  motion.on = false;
});

describe('the Run store', () => {
  it('gets the first board ready and keeps its target in the run', async () => {
    runActions.start('free', 1000, '2026-10-26');
    expect(state().run!.phase).toBe('select');
    await until(() => state().run!.targets[0] !== null, 'the target');
    expect(state().run!.targets[0]).toBeGreaterThan(0);
    expect(JSON.parse(localStorage.getItem(RUN_KEY)!).current.targets[0]).toBe(state().run!.targets[0]);
  });

  it('scores a placement a moment after the tap, from the board before it, never during it', async () => {
    runActions.start('free', 1000, '2026-10-26');
    const p = await playBoard();
    engine.technique = 'hiddenSingle';
    const [a, b] = emptyCells(p);
    // A wrong digit in b first: the engine must not see it when a is classified.
    type(b, (p.solution[b] % 9) + 1);
    type(a, p.solution[a]);
    expect(getGame()!.values[a]).toBe(p.solution[a]);
    expect(state().run!.live!.score).toBe(0);
    await settled();
    const live = state().run!.live!;
    expect(live.score).toBe(20);
    expect(live.tech).toEqual({ hiddenSingle: { n: 1, points: 20, top: 20 } });
    expect(live.hearts).toBe(2);
    const call = engine.calls.find((c) => c.cell === a)!;
    expect(call.values[a]).toBe(0);
    expect(call.values[b]).toBe(0);
    expect(call.values.filter(Boolean).length).toBe(p.givens.filter(Boolean).length);
    expect(state().fx.popups.at(-1)).toMatchObject({ cell: a, name: 'Hidden single', points: 20 });
  });

  it('with motion, keeps the points of a placement in the air until they land on the score', async () => {
    motion.on = true;
    runActions.start('free', 1000, '2026-10-26');
    const p = await playBoard();
    engine.technique = 'hiddenSingle';
    const [a, b] = emptyCells(p);
    type(a, p.solution[a]);
    await settled();
    const first = state().fx.popups.at(-1)!;
    // The score has them already; the band shows it without them until they land.
    expect(state().run!.live!.score).toBe(20);
    expect(state().fx.air).toEqual({ [first.id]: 20 });
    landPoints(first.id);
    expect(state().fx.air).toEqual({});
    // Leaving the board lets everything still in the air land.
    type(b, p.solution[b]);
    await settled();
    expect(Object.keys(state().fx.air)).toHaveLength(1);
    runActions.home();
    expect(state().fx.air).toEqual({});
  });

  it('keeps nothing in the air without motion', async () => {
    runActions.start('free', 1000, '2026-10-26');
    const p = await playBoard();
    engine.technique = 'hiddenSingle';
    const [a] = emptyCells(p);
    type(a, p.solution[a]);
    await settled();
    expect(state().fx.popups).toHaveLength(1);
    expect(state().fx.air).toEqual({});
  });

  it('scores by the hardest technique that proves the digit when the run holds Microscope', async () => {
    runActions.start('free', 1000, '2026-10-26');
    await until(() => !!state().ready[0], 'the board');
    useRunStore.setState({ run: { ...state().run!, perks: { microscope: 1 } } });
    const p = await playBoard();
    engine.technique = 'nakedSingle';
    engine.hard = 'xWing';
    const [a] = emptyCells(p);
    type(a, p.solution[a]);
    await settled();
    expect(engine.hardCalls).toEqual([a]);
    expect(engine.calls).toEqual([]);
    expect(state().run!.live!.tech).toEqual({ xWing: { n: 1, points: 150, top: 150 } });
    expect(state().fx.popups.at(-1)).toMatchObject({ cell: a, name: 'X-Wing', points: 150 });
  });

  it('applies placements in the order they went in, however fast they come', async () => {
    runActions.start('free', 1000, '2026-10-26');
    const p = await playBoard();
    engine.technique = 'nakedSingle';
    const cells = emptyCells(p).slice(0, 12);
    for (const c of cells) type(c, p.solution[c]);
    await settled();
    const live = state().run!.live!;
    expect(live.scored).toEqual(cells);
    // The flow climbs 0.1 a placement: 10, 11, 12 and so on, before any unit finishes.
    expect(live.streak).toBe(12);
    expect(live.score).toBeGreaterThanOrEqual(cells.reduce((s, _, k) => s + Math.round(10 * Math.min(2, 1 + 0.1 * k)), 0));
  });

  it('still scores a digit placed just before going back to the Run home, without bringing the run back', async () => {
    runActions.start('free', 1000, '2026-10-26');
    const p = await playBoard();
    engine.technique = 'hiddenSingle';
    const [a] = emptyCells(p);
    type(a, p.solution[a]);
    runActions.home();
    await settled();
    expect(state().run).toBeNull();
    expect(state().data.current!.live!.score).toBe(20);
    expect(JSON.parse(localStorage.getItem(RUN_KEY)!).current.live.scored).toEqual([a]);
  });

  it('ends the board when the hearts run out, and the run with it', async () => {
    runActions.start('free', 1000, '2026-10-26');
    const p = await playBoard();
    const c = emptyCells(p)[0];
    // Three different wrong digits: typing the same one twice would erase it.
    for (const d of [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((x) => x !== p.solution[c]).slice(0, 3)) type(c, d);
    await until(() => state().run!.phase !== 'board', 'the end of the board');
    await settled();
    const run = state().run!;
    expect(run.phase).toBe('tally');
    expect(run.outcome).toBe('lost');
    expect(run.results[0].status).toBe('out');
    expect(state().data.current).toBeNull();
    expect(state().data.stats.lost).toBe(1);
  });

  it('tallies a solved board, then moves on to a pick or the next board', async () => {
    runActions.start('free', 1000, '2026-10-26');
    const p = await playBoard();
    engine.technique = 'nakedSingle';
    for (const c of emptyCells(p)) type(c, p.solution[c]);
    await until(() => state().run!.phase === 'tally', 'the tally');
    const run = state().run!;
    const r = run.results[0];
    expect(['cleared', 'missed']).toContain(r.status);
    expect(r.score).toBe(run.score);
    expect(r.tech.nakedSingle!.n).toBe(emptyCells(p).length);
    expect(state().data.stats.codex.nakedSingle!.n).toBe(emptyCells(p).length);
    runActions.next();
    expect(state().run!.phase).toBe(r.status === 'cleared' ? 'reward' : 'select');
  });

  it('uses inks on the board: a hint charge, a revealed cell, and Void lifts the boss rule', async () => {
    runActions.start('free', 1000, '2026-10-26');
    await until(() => !!state().ready[0], 'the board');
    // Put the run on a Mute boss with three inks to hand.
    const run = state().run!;
    useRunStore.setState({ run: { ...run, slot: 2, bosses: ['mute', 'fog', 'clock'], items: ['inkHint', 'inkReveal'] } });
    runActions.retry();
    const p = await playBoard();
    expect(getGame()!.mods).toMatchObject({ noNotes: true, hints: 1 });
    expect(runActions.useItem(0)).toBe(true);
    expect(getGame()!.mods!.hints).toBe(2);
    expect(state().run!.items).toEqual(['inkReveal']);
    actions.select(null);
    expect(runActions.useItem(0)).toBe(true);
    await settled();
    expect(state().run!.items).toEqual([]);
    expect(getGame()!.values.filter((d, i) => !p.givens[i] && d).length).toBe(1);
    expect(state().run!.live!.score).toBe(0);
    useRunStore.setState({ run: { ...state().run!, items: ['inkVoid'] } });
    expect(runActions.useItem(0)).toBe(true);
    expect(getGame()!.mods!.noNotes).toBeUndefined();
    expect(state().run!.live!.rule).toBeNull();
  });

  it('uses Pencil Ink on a Mute board as one undo step, and Time Ink only on a clock', async () => {
    runActions.start('free', 1000, '2026-10-26');
    await until(() => !!state().ready[0], 'the board');
    const run = state().run!;
    useRunStore.setState({ run: { ...run, slot: 2, bosses: ['mute', 'fog', 'clock'], items: ['inkPencil', 'inkTime'] } });
    runActions.retry();
    const p = await playBoard();
    expect(getGame()!.mods!.noNotes).toBe(true);
    // No clock on this board, so Time Ink has nothing to add to.
    expect(runActions.useItem(1)).toBe(false);
    actions.select(emptyCells(p)[0]);
    expect(runActions.useItem(0)).toBe(true);
    expect(getGame()!.notes.some((m) => m)).toBe(true);
    expect(state().run!.items).toEqual(['inkTime']);
    actions.undo();
    expect(getGame()!.notes.every((m) => !m)).toBe(true);
    // With a clock (an Overtime card's), Time Ink adds its minutes.
    actions.updateMods({ timeLimitMs: 60_000 });
    expect(runActions.useItem(0)).toBe(true);
    expect(getGame()!.mods!.timeLimitMs).toBe(60_000 + INK.timeMs);
    expect(state().run!.items).toEqual([]);
  });

  it('starts a free run on the level picked and a daily run on Normal, and keeps Hard shut until a win on Normal', () => {
    runActions.pickLevel('hard');
    expect(state().data.pick).toBeUndefined();
    runActions.pickLevel('easy');
    runActions.start('free', 1000, '2026-10-26');
    expect(state().run!.difficulty).toBe('easy');
    expect(state().run!.hearts).toBe(DIFFICULTY.hearts.easy);
    runActions.start('daily', 2000, '2026-10-26');
    expect(state().run!.difficulty).toBe('normal');
    useRunStore.setState({ data: { ...state().data, stats: { ...state().data.stats, won: 1 } } });
    runActions.pickLevel('hard');
    expect(JSON.parse(localStorage.getItem(RUN_KEY)!).pick).toBe('hard');
    runActions.start('free', 3000, '2026-10-26');
    expect(state().run!.difficulty).toBe('hard');
    expect(state().run!.hearts).toBe(DIFFICULTY.hearts.hard);
  });

  it('never writes the first Run\'s key, and counts its runs', async () => {
    const v1 = JSON.stringify({ v: 1, current: null, last: null, stats: { started: 4 } });
    localStorage.setItem(LEGACY_KEY, v1);
    resetRunStore();
    runActions.start('free', 1000, '2026-10-26');
    await playBoard();
    runActions.giveUp('2026-10-26');
    expect(localStorage.getItem(LEGACY_KEY)).toBe(v1);
    expect(Object.keys(localStorage).sort()).toEqual(['cellbound:run:v1', 'cellbound:run:v2', 'cellbound:v1'].filter((k) => localStorage.getItem(k) !== null).sort());
  });
});

describe('the daily run', () => {
  it('gives everyone the same bosses, boards and targets on a date', async () => {
    const look = async (now: number) => {
      resetRunStore();
      runActions.start('daily', now, '2026-11-05');
      await until(() => [0, 1, 2].every((s) => state().ready[s]), 'the ante');
      const run = state().run!;
      return {
        seed: run.seed,
        bosses: run.bosses,
        boards: [0, 1, 2].map((s) => (state().ready[s] as Prepared).puzzle.id),
        targets: run.targets.slice(0, 3),
      };
    };
    const first = await look(1000);
    const later = await look(9_999_999);
    expect(later).toEqual(first);
    expect(first.targets.every((t) => typeof t === 'number' && t > 0)).toBe(true);
    expect(TECHNIQUES.xWing.tier).toBe(6);
  });
});
