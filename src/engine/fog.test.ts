import { describe, expect, it } from 'vitest';
import { fogSolvable } from './fog';
import { LYRA } from './fixtures';
import { ALL_KINDS } from './generator';
import { fogFor, generate, type Size } from './index';

describe('fog', () => {
  it('starts with about a third of the board and stays solvable', () => {
    const sizes: number[] = [];
    for (const size of [6, 9] as Size[]) {
      for (const difficulty of [1, 2, 3, 4] as const) {
        const p = generate({ size, seed: `fog-${difficulty}`, rules: ALL_KINDS, difficulty, fog: true });
        const fog = p.fog!;
        expect(fog.radius).toBe(1);
        expect(new Set(fog.start).size).toBe(fog.start.length);
        expect(fog.start.length).toBeGreaterThanOrEqual(Math.round((size * size) / 3));
        expect(fogSolvable(p, fog.start, difficulty >= 4 ? 4 : 3)).toBe(true);
        sizes.push(fog.start.length / (size * size));
      }
    }
    // Most layouts keep a real share of the board hidden.
    expect(sizes.filter((s) => s < 0.8).length).toBeGreaterThan(sizes.length / 2);
  });

  it('is deterministic and works for the fixture', () => {
    const a = fogFor(LYRA), b = fogFor(LYRA);
    expect(a).toEqual(b);
    expect(fogSolvable(LYRA, a.start)).toBe(true);
  });

  it('fails when nothing is visible', () => {
    expect(fogSolvable(LYRA, [])).toBe(false);
  });
});
