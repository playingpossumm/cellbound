import { describe, expect, it } from 'vitest';
import { clueHolds } from './conflicts';
import { FAIR_DEPTH } from './craft';
import { estimateEffort } from './effort';
import { fogSolvable } from './fog';
import { LYRA } from './fixtures';
import { ALL_KINDS, LOCAL_KINDS } from './generator';
import {
  candidates,
  conflicts,
  countSolutions,
  CONSTELLATIONS,
  generate,
  makeRng,
  solve,
  type ClueKind,
  type Puzzle,
  type Size,
} from './index';

function checkPuzzle(p: Puzzle) {
  const N = p.size * p.size;
  expect(p.givens).toHaveLength(N);
  expect(p.solution).toHaveLength(N);
  p.givens.forEach((d, i) => {
    if (d) expect(d).toBe(p.solution[i]);
  });
  for (const c of p.clues) expect(clueHolds(c, p.solution, p.size), JSON.stringify(c)).toBe(true);
  expect(conflicts(p, p.solution)).toEqual([]);
  expect(countSolutions(p, 2)).toBe(1);
  expect(solve(p)).toEqual(p.solution);
}

describe('fixture', () => {
  it('LYRA is valid and unique', () => {
    checkPuzzle(LYRA);
  });
  it('LYRA needs its givens: the clues alone are not unique', () => {
    expect(countSolutions({ ...LYRA, givens: LYRA.givens.map(() => 0) }, 5)).toBeGreaterThan(1);
  });
});

describe('rng', () => {
  it('is deterministic', () => {
    const a = makeRng('x'), b = makeRng('x');
    for (let i = 0; i < 5; i++) expect(a()).toBe(b());
  });
});

describe('generator', () => {
  it('is deterministic from the seed', () => {
    const opts = { size: 6 as Size, seed: 'same', rules: ALL_KINDS, difficulty: 3 as const };
    expect(generate(opts)).toEqual(generate(opts));
    expect(generate({ ...opts, seed: 'other' }).solution).not.toEqual(generate(opts).solution);
  });

  for (const size of [4, 6, 9] as Size[]) {
    for (const kind of ALL_KINDS) {
      it(`makes unique ${size}x${size} puzzles with ${kind}`, () => {
        const p = generate({ size, seed: `k-${kind}`, rules: [kind], difficulty: 3, minKinds: 1, maxKinds: 1 });
        checkPuzzle(p);
        for (const c of p.clues) expect(c.kind).toBe(kind);
        if (LOCAL_KINDS.includes(kind)) expect(p.clues.length).toBeGreaterThan(0);
      });
    }
  }

  it('mixes 2 to 3 kinds by default and keeps clues apart', () => {
    for (let i = 0; i < 6; i++) {
      const p = generate({ size: 6, seed: `mix-${i}`, rules: ALL_KINDS, difficulty: 2 });
      checkPuzzle(p);
      const kinds = new Set(p.clues.map((c) => c.kind));
      expect(kinds.size).toBeGreaterThanOrEqual(1);
      expect(kinds.size).toBeLessThanOrEqual(3);
      const seen = new Set<number>();
      for (const c of p.clues) {
        const cells = c.kind === 'arrow' ? [c.circle, ...c.path] : 'cells' in c ? c.cells : 'a' in c ? [c.a, c.b] : [];
        for (const cell of cells) {
          expect(seen.has(cell)).toBe(false);
          seen.add(cell);
        }
      }
    }
  });

  it('keeps uniqueness with hidden cage totals', () => {
    const p = generate({ size: 6, seed: 'hidden', rules: ['cage', 'thermo'] as ClueKind[], difficulty: 3, minKinds: 2, maxKinds: 2, hiddenCageTotals: true });
    checkPuzzle(p);
    const cages = p.clues.filter((c) => c.kind === 'cage');
    expect(cages.length).toBeGreaterThan(0);
    for (const c of cages) expect(c.kind === 'cage' && c.sum).toBe(null);
  });

  it('steers toward the requested difficulty', () => {
    for (const d of [1, 2, 3, 4] as const) {
      const p = generate({ size: 6, seed: `diff-${d}`, rules: ALL_KINDS, difficulty: d });
      checkPuzzle(p);
      expect(p.difficulty).toBe(d);
    }
  });

  it('gives different puzzles different ids', () => {
    const opts = { size: 6 as Size, seed: 'ids', rules: ALL_KINDS, difficulty: 2 as const };
    const a = generate(opts), b = generate({ ...opts, fog: true }), c = generate({ ...opts, seed: 'ids-2' });
    expect(new Set([a.id, b.id, c.id]).size).toBe(3);
    expect(generate(opts).id).toBe(a.id);
  });

  it('classic rules work when the rule list is empty', () => {
    const p = generate({ size: 6, seed: 'classic', rules: [], difficulty: 2 });
    checkPuzzle(p);
    expect(p.clues).toEqual([]);
  });
});

describe('boards cut to a time window', () => {
  const opts = { size: 9 as Size, seed: 'timed', rules: ['thermo', 'kropki'] as ClueKind[], difficulty: 2 as const, minutes: [8, 9] as [number, number] };

  it('are crafted to the window with exactly the rules asked for, the same on every call', () => {
    const p = generate(opts);
    checkPuzzle(p);
    expect(p.difficulty).toBe(2);
    expect([...new Set(p.clues.map((c) => c.kind))].sort()).toEqual(['kropki', 'thermo']);
    const seconds = estimateEffort(p, { probeDepth: FAIR_DEPTH }).seconds;
    expect(seconds).toBeGreaterThanOrEqual(8 * 60 - 60);
    expect(seconds).toBeLessThanOrEqual(9 * 60 + 60);
    expect(generate(opts)).toEqual(p);
    expect(generate({ ...opts, seed: 'timed-2' }).id).not.toBe(p.id);
  });

  it('can hide every cage total', () => {
    const p = generate({ ...opts, rules: ['cage', 'xv'], hiddenCageTotals: true });
    checkPuzzle(p);
    const cages = p.clues.filter((c) => c.kind === 'cage');
    expect(cages.length).toBeGreaterThan(0);
    for (const c of cages) expect(c.kind === 'cage' ? c.sum : 0).toBeNull();
  });

  it('can be wrapped in fog that the rules alone clear', () => {
    const p = generate({ ...opts, fog: true });
    checkPuzzle(p);
    expect(p.fog!.start.length).toBeGreaterThan(0);
    expect(fogSolvable(p, p.fog!.start, 4)).toBe(true);
  });

  it('leave the time window to 9x9 boards: any other size comes from the generator', () => {
    expect(generate(opts).id.startsWith('c9-')).toBe(true);
    expect(generate({ ...opts, size: 6 }).id.startsWith('g6-')).toBe(true);
  });
});

describe('conflicts', () => {
  const base: Puzzle = { ...LYRA };
  const blank = () => LYRA.solution.map(() => 0);

  it('finds row, column and box repeats', () => {
    const v = blank();
    v[0] = 3; v[2] = 3;
    expect(conflicts(base, v).map((c) => c.rule)).toContain('row');
    const w = blank();
    w[0] = 4; w[6] = 4;
    const rules = conflicts(base, w).map((c) => c.rule);
    expect(rules).toContain('column');
    expect(rules).toContain('box');
  });

  it('flags thermo, cage and kropki breaks only when they are certain', () => {
    const v = blank();
    v[31] = 5; v[26] = 2;
    expect(conflicts(base, v).some((c) => c.rule === 'thermo')).toBe(true);
    const cage = blank();
    cage[4] = 6; cage[5] = 3;
    expect(conflicts(base, cage).some((c) => c.rule === 'cage')).toBe(false);
    cage[11] = 4;
    expect(conflicts(base, cage).some((c) => c.rule === 'cage')).toBe(true);
    const over = blank();
    over[4] = 6; over[5] = 6 + 3;
    expect(conflicts(base, over).some((c) => c.rule === 'cage')).toBe(true);
    const dot = blank();
    dot[34] = 2; dot[35] = 5;
    expect(conflicts(base, dot).some((c) => c.rule === 'kropki')).toBe(true);
  });

  it('flags arrows when the sum is exceeded or complete and wrong', () => {
    const v = blank();
    v[1] = 3; v[8] = 4;
    expect(conflicts(base, v).some((c) => c.rule === 'arrow')).toBe(true);
    const ok = blank();
    ok[1] = 5; ok[8] = 2;
    expect(conflicts(base, ok).some((c) => c.rule === 'arrow')).toBe(false);
    ok[9] = 2;
    expect(conflicts(base, ok).some((c) => c.rule === 'arrow')).toBe(true);
  });

  it('handles global rules and negative kropki', () => {
    const p: Puzzle = { ...LYRA, clues: [{ kind: 'diagonal' }, { kind: 'antiKnight' }], negativeKropki: true };
    const v = blank();
    v[0] = 1; v[7] = 1;
    v[2] = 6; v[13] = 6;
    v[20] = 2; v[21] = 3;
    const rules = conflicts(p, v).map((c) => c.rule);
    expect(rules).toContain('diagonal');
    expect(rules).toContain('antiKnight');
    expect(rules).toContain('kropki');
  });
});

describe('candidates', () => {
  it('removes digits seen by peers and by clues', () => {
    const masks = candidates(LYRA, LYRA.givens);
    LYRA.givens.forEach((d, i) => {
      if (d) expect(masks[i]).toBe(1 << d);
      else expect(masks[i] & (1 << LYRA.solution[i])).not.toBe(0);
    });
    // The bulb of the thermo (cell 31) cannot be 5 or 6 on a four cell thermo.
    expect(masks[31] & ((1 << 5) | (1 << 6))).toBe(0);
  });
});

describe('constellations', () => {
  it('lists all 88', () => {
    expect(new Set(CONSTELLATIONS).size).toBe(88);
  });
});
