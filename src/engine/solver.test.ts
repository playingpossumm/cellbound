// Checks the solver against brute force on 4x4: every Latin square is
// filtered by an independent rule checker written only for tests.
import { describe, expect, it } from 'vitest';
import { LATIN, randomPuzzle, satisfies } from './testkit';
import { candidates, conflicts, countSolutions, solve } from './index';

describe('solver against brute force on 4x4', () => {
  it('counts solutions exactly for random clue sets', () => {
    let nonzero = 0, unique = 0;
    for (let t = 0; t < 400; t++) {
      const p = randomPuzzle(`bf-${t}`);
      const truth = LATIN.filter((g) => satisfies(p, g));
      expect(countSolutions(p, 10000), JSON.stringify(p.clues)).toBe(truth.length);
      const s = solve(p);
      if (truth.length === 1) expect(s).toEqual(truth[0]);
      else expect(s).toBeNull();
      if (truth.length) nonzero++;
      if (truth.length === 1) unique++;
      // Auto-notes never remove a digit that some solution uses.
      if (truth.length) {
        const masks = candidates(p, p.givens);
        for (const g of truth) g.forEach((d, i) => expect(masks[i] & (1 << d)).not.toBe(0));
      }
      // Conflicts are empty exactly on grids that satisfy every rule.
      for (const g of [LATIN[t % LATIN.length], ...truth.slice(0, 2)]) {
        const ok = satisfies({ ...p, givens: p.givens.map(() => 0) }, g);
        expect(conflicts({ ...p, givens: p.givens.map(() => 0) }, g).length === 0, JSON.stringify(p.clues)).toBe(ok);
      }
    }
    // The fuzz covers solvable, unique and impossible cases.
    expect(nonzero).toBeGreaterThan(50);
    expect(unique).toBeGreaterThan(5);
  });

  it('respects a limit', () => {
    const p = randomPuzzle('limit');
    const empty = { ...p, clues: [], givens: p.givens.map(() => 0), regions: undefined, negativeKropki: false };
    expect(countSolutions(empty, 7)).toBe(7);
    expect(countSolutions(empty, 1000)).toBe(288);
  });
});
