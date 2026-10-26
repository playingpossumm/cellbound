// The game store's hooks for the Run: every placement reported in order, each cell's history on a
// Run board, hint charges and quick hints, notes in named cells, and the actions a Run card uses.
// Other modes keep their games exactly as before.
import { beforeEach, describe, expect, it } from 'vitest';
import { LYRA } from '../engine/fixtures';
import type { FogSpec } from '../engine/types';
import { actions, getGame, onGameEnd, onPlacement, resetStoreForTesting, startGame, type PlacementEvent } from './store';

const empty = LYRA.givens.map((d, i) => (d ? -1 : i)).filter((i) => i >= 0);
const wrongFor = (i: number) => (LYRA.solution[i] === 1 ? 2 : 1);

function play(i: number, d: number) {
  actions.select(i);
  actions.input(d);
}

function listen() {
  const events: PlacementEvent[] = [];
  const off = onPlacement((e) => events.push(e));
  return { events, off };
}

beforeEach(() => resetStoreForTesting());

describe('placement events', () => {
  it('report each digit with the board before it, and the units and clues it finished', () => {
    const { events, off } = listen();
    startGame({ key: 'p1', mode: 'free', puzzle: LYRA });
    const i = empty[0];
    play(i, LYRA.solution[i]);
    off();
    expect(events).toHaveLength(1);
    const e = events[0];
    expect(e).toMatchObject({ key: 'p1', mode: 'free', cell: i, digit: LYRA.solution[i], correct: true, source: 'player', assisted: false });
    expect(e.before[i]).toBe(0);
    expect(e.before.filter(Boolean)).toHaveLength(LYRA.givens.filter(Boolean).length);
    expect(e.game.values[i]).toBe(LYRA.solution[i]);
  });

  it('name the units and clues a digit finishes', () => {
    const { events, off } = listen();
    startGame({ key: 'p2', mode: 'free', puzzle: LYRA });
    // Row 0 of LYRA, every empty cell of it.
    const row = [0, 1, 2, 3, 4, 5].filter((i) => !LYRA.givens[i]);
    for (const i of row) play(i, LYRA.solution[i]);
    off();
    const last = events[events.length - 1];
    expect(last.units.map((u) => u.kind)).toContain('row');
    // The arrow 1 -> 8, 9 and the cage 4, 5, 11 touch row 0; any clue finished is named by index.
    for (const c of events.flatMap((ev) => ev.clues)) expect(LYRA.clues[c.index].kind).toBe(c.kind);
  });

  it('tell wrong digits, hints and reveals apart', () => {
    const { events, off } = listen();
    startGame({ key: 'p3', mode: 'free', puzzle: LYRA });
    play(empty[0], wrongFor(empty[0]));
    actions.hint();
    actions.hint();
    actions.hint();
    actions.reveal(empty[5]);
    off();
    expect(events.map((e) => [e.correct, e.source])).toEqual([
      [false, 'player'],
      [true, 'hint'],
      [true, 'reveal'],
    ]);
    expect(events[0].units).toEqual([]);
  });

  it('come before the game-end listeners, so a scorer sees the last digit first', () => {
    const order: string[] = [];
    const a = onPlacement(() => order.push('placed'));
    const b = onGameEnd(() => order.push('ended'));
    startGame({ key: 'p4', mode: 'free', puzzle: LYRA });
    for (const i of empty) play(i, LYRA.solution[i]);
    a();
    b();
    expect(order.slice(-2)).toEqual(['placed', 'ended']);
  });

  it('mark a digit typed while a hint points at it as assisted', () => {
    startGame({ key: 'p5', mode: 'free', puzzle: LYRA });
    // Walk the ladder once to learn where it leads, then put the board back.
    actions.hint();
    actions.hint();
    const move = actions.hint()!.move!;
    actions.undo();
    // Asked again, the first step only says where to look; the player types the digit.
    const { events, off } = listen();
    expect(actions.hint()!.level).toBe(1);
    play(move.cell, move.digit);
    off();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ cell: move.cell, source: 'player', assisted: true });
  });
});

describe('Run boards', () => {
  it('keep each cell history: notes ever written, wrong digits and help', () => {
    startGame({ key: 'run2:h', mode: 'run', puzzle: LYRA });
    const [a, b, c] = empty;
    actions.toggleNotes();
    play(a, 3);
    play(a, 3);
    actions.toggleNotes();
    play(b, wrongFor(b));
    actions.reveal(c);
    const g = getGame()!;
    expect(g.notes[a]).toBe(0);
    expect(g.noted![a]).toBe(true);
    expect(g.missed![b]).toBe(true);
    expect(g.helped![c]).toBe(true);
    expect(g.noted!.filter(Boolean)).toHaveLength(1);
    expect(g.missed!.filter(Boolean)).toHaveLength(1);
  });

  it('leave every other mode without a history', () => {
    startGame({ key: 'free:h', mode: 'free', puzzle: LYRA });
    actions.toggleNotes();
    play(empty[0], 3);
    const g = getGame()!;
    expect(g.noted).toBeUndefined();
    expect(g.missed).toBeUndefined();
    expect(g.helped).toBeUndefined();
  });

  it('allow only the hint ladders the board has, and send quick ones straight to the move', () => {
    startGame({ key: 'run2:hints', mode: 'run', puzzle: LYRA, mods: { hints: 2, quickHints: 1 } });
    const quick = actions.hint()!;
    expect(quick.level).toBe(3);
    expect(getGame()!.hintsUsed).toBe(1);
    expect(getGame()!.values[quick.move!.cell]).toBe(quick.move!.digit);
    const slow = actions.hint()!;
    expect(slow.level).toBe(1);
    expect(actions.hint()!.level).toBe(2);
    actions.hint();
    expect(getGame()!.hintsUsed).toBe(2);
    expect(actions.hint()).toBeNull();
    expect(getGame()!.hintsUsed).toBe(2);
  });

  it('fill notes in the cells a card names', () => {
    const cells = [empty[0], empty[1]];
    startGame({ key: 'run2:notes', mode: 'run', puzzle: LYRA, mods: { notesIn: cells } });
    const g = getGame()!;
    expect(cells.every((i) => g.notes[i] > 0)).toBe(true);
    expect(g.notes.filter(Boolean)).toHaveLength(2);
    expect(g.noted!.filter(Boolean)).toHaveLength(2);
  });
});

describe('actions for Run cards', () => {
  it("reveal the selected empty cell, or the board's own next one, using no hint", () => {
    startGame({ key: 'r1', mode: 'run', puzzle: LYRA });
    actions.select(empty[2]);
    expect(actions.reveal()).toBe(empty[2]);
    const g = getGame()!;
    expect(g.values[empty[2]]).toBe(LYRA.solution[empty[2]]);
    expect(g.hinted![empty[2]]).toBe(true);
    expect(g.hintsUsed).toBe(0);
    actions.select(null);
    const next = actions.reveal();
    expect(next).not.toBeNull();
    expect(actions.reveal(empty[2])).toBeNull();
  });

  it('clear fog around a cell or everywhere', () => {
    const fog: FogSpec = { start: [0, 1, 2, 6, 7, 8], radius: 1 };
    startGame({ key: 'r2', mode: 'run', puzzle: LYRA, fog });
    actions.clearFog(7);
    expect([12, 13, 14].every((i) => getGame()!.fog!.cleared[i])).toBe(true);
    actions.clearFog('all');
    expect(getGame()!.fog!.cleared.every(Boolean)).toBe(true);
  });

  it("change a board's modifiers, dropping the ones set to nothing", () => {
    startGame({ key: 'r3', mode: 'run', puzzle: LYRA, mods: { noNotes: true, timeLimitMs: 60_000, hints: 1 } });
    actions.updateMods({ noNotes: undefined, timeLimitMs: undefined, hints: 2 });
    expect(getGame()!.mods).toEqual({ hints: 2 });
  });

  it('fail a game on request, once', () => {
    const ended: string[] = [];
    const off = onGameEnd((g) => ended.push(g.status));
    startGame({ key: 'r4', mode: 'run', puzzle: LYRA });
    actions.failGame();
    actions.failGame();
    off();
    expect(getGame()!.status).toBe('failed');
    expect(ended).toEqual(['failed']);
  });
});
