// The pace of a run, measured on real boards: each one is made by the engine as a run makes it
// and timed by its effort model (src/engine/effort.ts), the estimate the boards are cut to.
import { describe, expect, it } from 'vitest';
import { dailyRunSeed, generate, grade } from '../../engine';
import { FAIR_DEPTH } from '../../engine/craft';
import { estimateEffort } from '../../engine/effort';
import { SLOT_COUNT, SLOT_SPECS, optionsFor } from './boards';

const SEEDS = ['2026-11-02', '2026-12-19', '2027-03-08', 'free:pace01'].map((s) => (s.startsWith('free:') ? s : dailyRunSeed(s)));

const runs = SEEDS.map((seed) =>
  Array.from({ length: SLOT_COUNT }, (_, slot) => {
    const options = optionsFor(seed, slot);
    const p = generate(options);
    return { p, rules: options.rules, minutes: estimateEffort(p, { probeDepth: FAIR_DEPTH }).seconds / 60 };
  }),
);
const median = (xs: number[]) => xs.slice().sort((a, b) => a - b)[xs.length >> 1];

describe('the pace of a run', () => {
  it('makes every board a 9x9 at its level, with exactly its rules', () => {
    for (const run of runs) {
      run.forEach(({ p, rules }, i) => {
        expect(p.size).toBe(9);
        expect(grade(p).difficulty, `board ${i + 1}`).toBe(SLOT_SPECS[i].difficulty);
        expect([...new Set(p.clues.map((c) => c.kind))].sort()).toEqual([...rules].sort());
      });
    }
  });

  it('cuts each board to its window, give or take a few minutes on the hardest', () => {
    for (const run of runs) {
      run.forEach(({ minutes }, i) => {
        const [lo, hi] = SLOT_SPECS[i].minutes;
        expect(minutes, `board ${i + 1}`).toBeGreaterThanOrEqual(lo - 1);
        expect(minutes, `board ${i + 1}`).toBeLessThanOrEqual(hi + (SLOT_SPECS[i].difficulty >= 3 ? 5 : 2));
      });
    }
  });

  it('takes about 6 to 15 minutes a board, rising through the antes', () => {
    const boards = Array.from({ length: SLOT_COUNT }, (_, i) => median(runs.map((r) => r[i].minutes)));
    expect(boards[0]).toBeGreaterThanOrEqual(5);
    expect(boards[SLOT_COUNT - 1]).toBeLessThanOrEqual(18);
    for (const a of [0, 1]) expect(median(boards.slice(3 * a + 3, 3 * a + 6))).toBeGreaterThan(median(boards.slice(3 * a, 3 * a + 3)));
  });
});
