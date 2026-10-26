import { describe, expect, it } from 'vitest';
import { placePopup, popupSize, WEIGHT, type Box, type Ground } from './popups';

const N = 9;
const SIDE = 360;
const S = SIDE / N;

const empty = (): Ground => ({ n: N, side: SIDE, weight: new Array(N * N).fill(WEIGHT.empty) });
const full = (): Ground => ({ n: N, side: SIDE, weight: new Array(N * N).fill(WEIGHT.digit) });
const cellAt = (r: number, c: number) => r * N + c;

const single = popupSize({ name: 'Single', points: 80, clean: 1 });
const overlap = (a: Box, b: Box) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
const inside = (b: Box) => b.x >= 0 && b.y >= 0 && b.x + b.w <= SIDE + 0.001 && b.y + b.h <= SIDE + 0.001;

describe('the size of a popup', () => {
  it('grows with its name and its points, and with a third line after a clean unit', () => {
    const short = popupSize({ name: 'Pair', points: 40, clean: 1 });
    const long = popupSize({ name: 'Hidden single', points: 40, clean: 1 });
    const big = popupSize({ name: 'Pair', points: 12_345, clean: 1 });
    const clean = popupSize({ name: 'Pair', points: 40, clean: 3.38 });
    expect(long.w).toBeGreaterThan(short.w);
    expect(big.w).toBeGreaterThan(short.w);
    expect(clean.h).toBeGreaterThan(short.h);
  });
});

describe('where a popup goes', () => {
  it('is directly above its cell when nothing is in the way, as it always was', () => {
    const cell = cellAt(4, 4);
    const b = placePopup(empty(), cell, single, []);
    expect(b.y + b.h).toBeLessThanOrEqual(4 * S);
    expect(b.x + b.w / 2).toBeCloseTo(4.5 * S, 0);
    expect(overlap(b, { x: 4 * S, y: 4 * S, w: S, h: S })).toBe(0);
  });

  it('stays on the board, below a cell in the top row and inside at a corner', () => {
    for (const cell of [cellAt(0, 4), cellAt(0, 0), cellAt(0, 8), cellAt(8, 0), cellAt(8, 8), cellAt(4, 0), cellAt(4, 8)]) {
      const b = placePopup(empty(), cell, single, []);
      expect(inside(b)).toBe(true);
    }
    const top = placePopup(empty(), cellAt(0, 4), single, []);
    expect(top.y).toBeGreaterThanOrEqual(S);
  });

  it('never prints over a popup still showing, however close the next placement is', () => {
    const board = empty();
    const taken: Box[] = [];
    // A run of placements along a row and down a column, a few at a time, as a quick player makes them.
    for (const cell of [cellAt(4, 3), cellAt(4, 4), cellAt(4, 5), cellAt(5, 4), cellAt(3, 4), cellAt(4, 4)]) {
      const b = placePopup(board, cell, single, taken);
      for (const t of taken) expect(overlap(b, t)).toBe(0);
      expect(inside(b)).toBe(true);
      taken.push(b);
    }
  });

  it('finds room for a crowd: nine popups of every size, all round the same cell, still apart', () => {
    for (const ground of [empty(), full()]) {
      const taken: Box[] = [];
      const sizes = [single, popupSize({ name: 'Hidden single', points: 1234, clean: 3.38 }), popupSize({ name: 'Pair', points: 90, clean: 1.5 }), single, single, popupSize({ name: 'Full house', points: 270, clean: 2.25 }), single, single, single];
      sizes.forEach((size, k) => {
        const b = placePopup(ground, cellAt(4, 3 + (k % 3)), size, taken);
        for (const t of taken) expect(overlap(b, t)).toBe(0);
        expect(inside(b)).toBe(true);
        taken.push(b);
      });
    }
  });

  it('keeps off the digits when there is room, and off the digit just placed when there is not', () => {
    // Digits everywhere but one row: the popup goes into the row with nothing in it.
    const g = full();
    const row = 2;
    for (let c = 0; c < N; c++) g.weight = g.weight.map((w, i) => (i === cellAt(row, c) ? WEIGHT.empty : w));
    const b = placePopup(g, cellAt(3, 4), single, []);
    // A popup is a hair taller than a row, so it sits across the empty row.
    expect(b.y + b.h / 2).toBeGreaterThan(row * S);
    expect(b.y + b.h / 2).toBeLessThan((row + 1) * S);
    // A full board: it covers digits, but never the one just placed.
    const f = placePopup(full(), cellAt(4, 4), single, []);
    expect(overlap(f, { x: 4 * S, y: 4 * S, w: S, h: S })).toBe(0);
  });

  it('weighs notes less than digits', () => {
    // Digits everywhere but one row of notes: the popup lies across the notes.
    const g = full();
    g.weight = g.weight.map((w, i) => (Math.floor(i / N) === 3 ? WEIGHT.notes : w));
    const b = placePopup(g, cellAt(5, 4), single, []);
    expect(b.y + b.h / 2).toBeGreaterThan(3 * S);
    expect(b.y + b.h / 2).toBeLessThan(4 * S);
  });

  it('is deterministic', () => {
    const a = placePopup(full(), cellAt(2, 7), single, [{ x: 10, y: 10, w: 60, h: 40 }]);
    const b = placePopup(full(), cellAt(2, 7), single, [{ x: 10, y: 10, w: 60, h: 40 }]);
    expect(a).toEqual(b);
  });
});
