import { beforeEach, describe, expect, it } from 'vitest';
import { LYRA } from '../engine/fixtures';
import { fogFor } from '../engine';
import { actions, getGame, heartsLeft, onGameEnd, resetStoreForTesting, sanitizeSaved, startGame, tickClock, useFx } from './store';
import { addResult, bestStreak, currentStreak } from './stats';
import { fogGlyphs, formatDateLong, formatTime } from './logic';
import type { GameState } from './types';

const empty = LYRA.givens.map((d, i) => (d ? -1 : i)).filter((i) => i >= 0);

function play(i: number, d: number) {
  actions.select(i);
  actions.input(d);
}

beforeEach(() => resetStoreForTesting());

describe('game store', () => {
  it('places digits, counts mistakes and toggles notes', () => {
    startGame({ key: 't1', mode: 'daily', puzzle: LYRA });
    const i = empty[0];
    const right = LYRA.solution[i];
    const wrong = right === 1 ? 2 : 1;
    play(i, wrong);
    expect(getGame()!.values[i]).toBe(wrong);
    expect(getGame()!.mistakes).toBe(1);
    play(i, right);
    expect(getGame()!.values[i]).toBe(right);
    expect(getGame()!.mistakes).toBe(1);
    actions.toggleNotes();
    actions.select(empty[1]);
    actions.input(3);
    expect(getGame()!.notes[empty[1]]).toBe(1 << 3);
    actions.input(3);
    expect(getGame()!.notes[empty[1]]).toBe(0);
  });

  it('undoes and redoes moves', () => {
    startGame({ key: 't2', mode: 'free', puzzle: LYRA });
    const i = empty[0];
    play(i, LYRA.solution[i]);
    actions.undo();
    expect(getGame()!.values[i]).toBe(0);
    actions.redo();
    expect(getGame()!.values[i]).toBe(LYRA.solution[i]);
    actions.erase();
    expect(getGame()!.values[i]).toBe(0);
    actions.undo();
    expect(getGame()!.values[i]).toBe(LYRA.solution[i]);
  });

  it('ignores givens', () => {
    startGame({ key: 't3', mode: 'free', puzzle: LYRA });
    const g = LYRA.givens.findIndex((d) => d);
    play(g, 1);
    expect(getGame()!.values[g]).toBe(0);
  });

  it('solves, fires onGameEnd once and records stats', () => {
    const ended: GameState[] = [];
    const off = onGameEnd((g) => ended.push(g));
    startGame({ key: 'daily:2026-10-23', mode: 'daily', puzzle: LYRA });
    for (const i of empty) play(i, LYRA.solution[i]);
    expect(getGame()!.status).toBe('solved');
    expect(getGame()!.doneBoxes.length).toBe(6);
    actions.solveForTesting();
    expect(ended.length).toBe(1);
    startGame({ key: 'daily:2026-10-23', mode: 'daily', puzzle: LYRA });
    expect(ended.length).toBe(1);
    off();
    const s = addResult({ solves: {}, fails: {}, times: {}, daily: {}, recorded: [] }, ended[0], '2026-10-23');
    expect(s.solves.daily).toBe(1);
    expect(s.daily['2026-10-23'].status).toBe('solved');
    expect(addResult(s, ended[0], '2026-10-23')).toBe(s);
  });

  it('flashes units and marks done boxes', () => {
    startGame({ key: 't4', mode: 'free', puzzle: LYRA });
    const box0 = [0, 1, 2, 6, 7, 8];
    for (const i of box0) if (!LYRA.givens[i]) play(i, LYRA.solution[i]);
    expect(getGame()!.doneBoxes).toContain(0);
    expect(Object.keys(useFx.getState().flash).length).toBeGreaterThan(0);
  });

  it('clears fog only around correct digits', () => {
    const fog = fogFor(LYRA);
    startGame({ key: 'fog:1', mode: 'fog', puzzle: LYRA, fog });
    const g0 = getGame()!;
    const edge = empty.find((i) => g0.fog!.cleared[i] && !g0.fog!.cleared[Math.min(35, i + 7)])!;
    const target = Math.min(35, edge + 7);
    const right = LYRA.solution[edge];
    play(edge, right === 1 ? 2 : 1);
    expect(getGame()!.fog!.cleared[target]).toBe(false);
    play(edge, right);
    expect(getGame()!.fog!.cleared[target]).toBe(true);
  });

  it('fails when hearts run out, shield first', () => {
    startGame({ key: 'run:x', mode: 'run', puzzle: LYRA, mods: { hearts: 1, shield: 1 } });
    const i = empty[0];
    const wrong = LYRA.solution[i] === 1 ? 2 : 1;
    play(i, wrong);
    expect(getGame()!.status).toBe('playing');
    expect(heartsLeft(getGame()!)).toBe(1);
    actions.erase();
    play(i, wrong);
    expect(getGame()!.status).toBe('failed');
  });

  it('walks the hint ladder and places the digit on the third press', () => {
    startGame({ key: 't5', mode: 'free', puzzle: LYRA });
    const a = actions.hint()!;
    const b = actions.hint()!;
    const c = actions.hint()!;
    expect([a.level, b.level, c.level]).toEqual([1, 2, 3]);
    const g = getGame()!;
    expect(g.hintsUsed).toBe(1);
    expect(g.values[c.move!.cell]).toBe(c.move!.digit);
    expect(g.hinted![c.move!.cell]).toBe(true);
  });

  it('counts time and fails at the time limit', () => {
    startGame({ key: 't6', mode: 'run', puzzle: LYRA, mods: { timeLimitMs: 3000 } });
    tickClock(1200);
    tickClock(1200);
    expect(getGame()!.elapsedMs).toBeGreaterThanOrEqual(2000);
    actions.pause();
    tickClock(1000);
    expect(getGame()!.elapsedMs).toBe(2400);
    actions.resume();
    tickClock(900);
    expect(getGame()!.status).toBe('failed');
  });

  it('resumes saved games and drops broken saves', () => {
    startGame({ key: 't7', mode: 'free', puzzle: LYRA });
    play(empty[0], LYRA.solution[empty[0]]);
    startGame({ key: 't8', mode: 'free', puzzle: LYRA });
    startGame({ key: 't7', mode: 'free', puzzle: LYRA });
    expect(getGame()!.values[empty[0]]).toBe(LYRA.solution[empty[0]]);
    const clean = sanitizeSaved({ games: { a: { key: 'a' }, t7: getGame() }, lastKey: { free: 'a' } });
    expect(Object.keys(clean.games)).toEqual(['t7']);
    expect(clean.lastKey.free).toBeUndefined();
  });
});

describe('streaks and helpers', () => {
  const day = (solvedOn: string) => ({ status: 'solved' as const, ms: 1, mistakes: 0, hints: 0, solvedOn });
  it('counts consecutive local dates', () => {
    const d = { '2026-10-21': day('2026-10-21'), '2026-10-22': day('2026-10-22'), '2026-10-20': day('2026-10-25') };
    expect(currentStreak(d, '2026-10-23')).toBe(2);
    expect(currentStreak(d, '2026-10-22')).toBe(2);
    expect(currentStreak(d, '2026-10-25')).toBe(0);
    expect(bestStreak(d)).toBe(2);
  });
  it('formats', () => {
    expect(formatTime(252000)).toBe('4:12');
    expect(formatDateLong('2026-10-23')).toBe('Friday 23 October');
    expect(fogGlyphs('a', 1)).toHaveLength(16);
    expect(fogGlyphs('a', 1)).toBe(fogGlyphs('a', 1));
  });
});

describe('hint fallbacks', () => {
  beforeEach(() => resetStoreForTesting());
  it('points at the selected empty cell and counts one hint per deduction', () => {
    startGame({ key: 'h1', mode: 'free', puzzle: LYRA });
    const target = empty[3];
    actions.select(target);
    const first = actions.hint()!;
    expect(first.focus).toEqual([target]);
    actions.hint();
    actions.hint();
    expect(getGame()!.values[target]).toBe(LYRA.solution[target]);
    actions.select(empty[4]);
    actions.hint();
    expect(getGame()!.hintsUsed).toBe(2);
  });

  it('points at mistakes before anything else', () => {
    startGame({ key: 'h2', mode: 'free', puzzle: LYRA });
    const i = empty[0];
    play(i, LYRA.solution[i] === 1 ? 2 : 1);
    actions.hint();
    const second = actions.hint()!;
    expect(second.focus).toEqual([i]);
    actions.hint();
    expect(getGame()!.values[i]).toBe(LYRA.solution[i]);
  });
});
