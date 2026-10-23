import { describe, expect, it } from 'vitest';
import { LYRA } from './fixtures';
import { ALL_KINDS } from './generator';
import { generate, hint, type Puzzle, type Size } from './index';
import { LATIN, randomPuzzle, satisfies } from './testkit';

/** Plays a puzzle using only level 3 hint moves. */
function playByHints(p: Puzzle): { moves: number; solved: boolean } {
  const v = p.givens.slice();
  let moves = 0;
  for (let i = 0; i < p.size * p.size; i++) {
    const h = hint(p, v);
    if (!h) break;
    expect(h.map((s) => s.level)).toEqual([1, 2, 3]);
    for (const s of h) {
      expect(s.text).not.toMatch(/\u2014/);
      expect(s.text).not.toMatch(/\ba 8\b/);
      expect(s.focus.length).toBeGreaterThan(0);
    }
    const mv = h[2].move!;
    expect(mv.digit).toBe(p.solution[mv.cell]);
    expect(v[mv.cell]).toBe(0);
    v[mv.cell] = mv.digit;
    moves++;
  }
  return { moves, solved: v.every((d, i) => d === p.solution[i]) };
}

describe('hints', () => {
  it('solve LYRA one correct move at a time', () => {
    const r = playByHints(LYRA);
    expect(r.solved).toBe(true);
  });

  for (const size of [4, 6, 9] as Size[]) {
    it(`solve generated ${size}x${size} puzzles`, () => {
      for (const difficulty of [2, 3, 4] as const) {
        const p = generate({ size, seed: `hint-${difficulty}`, rules: ALL_KINDS, difficulty });
        expect(playByHints(p).solved).toBe(true);
      }
    });
  }

  it('solve random 4x4 puzzles with every clue kind, regions and negative kropki', () => {
    let played = 0;
    for (let t = 0; t < 600 && played < 60; t++) {
      const p = randomPuzzle(`hint-fuzz-${t}`);
      const sols = LATIN.filter((g) => satisfies(p, g));
      if (sols.length !== 1) continue;
      expect(playByHints({ ...p, solution: sols[0] }).solved).toBe(true);
      played++;
    }
    expect(played).toBeGreaterThan(20);
  });

  it('explain the rule in plain words', () => {
    const h = hint(LYRA, LYRA.givens)!;
    expect(h[2].text).toMatch(/so this cell is \d\.$/i);
  });

  it('point out a wrong digit first', () => {
    const v = LYRA.givens.slice();
    const c = v.findIndex((d) => !d);
    v[c] = (LYRA.solution[c] % 6) + 1;
    const h = hint(LYRA, v)!;
    expect(h[0].rule).toBe('cell');
    expect(h[2].move).toEqual({ cell: c, digit: LYRA.solution[c] });
  });

  it('point out notes that miss the answer', () => {
    const notes = LYRA.givens.map(() => 0);
    const c = LYRA.givens.findIndex((d) => !d);
    notes[c] = 0b1111110 & ~(1 << LYRA.solution[c]);
    const h = hint(LYRA, LYRA.givens, notes)!;
    expect(h[2].move).toEqual({ cell: c, digit: LYRA.solution[c] });
  });

  it('return null on a finished grid', () => {
    expect(hint(LYRA, LYRA.solution)).toBeNull();
  });
});
