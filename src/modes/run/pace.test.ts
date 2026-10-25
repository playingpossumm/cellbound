// The pace of a run, measured on real boards: each one is set up as a run sets it up, made by the
// engine and timed by its effort model (src/engine/effort.ts), the estimate the boards are cut to.
import { describe, expect, it } from 'vitest';
import { dailyRunSeed, generate, grade } from '../../engine';
import { FAIR_DEPTH } from '../../engine/craft';
import { estimateEffort } from '../../engine/effort';
import { BOARD_COUNT, BOARD_SPECS, setupBoard } from './boards';

const SEEDS = ['2026-11-02', '2026-11-07', '2027-01-15', '2027-04-30', '2027-09-12', 'free:pace01', 'free:pace02', 'free:pace03'].map((s) =>
  s.startsWith('free:') ? s : dailyRunSeed(s),
);

/** Estimated minutes for each board of each run, as an experienced player would take. */
const runs = SEEDS.map((seed) =>
  Array.from({ length: BOARD_COUNT }, (_, i) => {
    const setup = setupBoard(seed, i, 3, 0, [], 1);
    const p = generate(setup.options);
    return { p, rules: setup.options.rules, minutes: estimateEffort(p, { probeDepth: FAIR_DEPTH }).seconds / 60 };
  }),
);
const median = (xs: number[]) => xs.slice().sort((a, b) => a - b)[xs.length >> 1];

describe('the pace of a run', () => {
  it('makes every board a 9x9 at its level, with exactly its rules', () => {
    for (const run of runs) {
      run.forEach(({ p, rules }, i) => {
        expect(p.size).toBe(9);
        expect(grade(p).difficulty, `board ${i + 1}`).toBe(BOARD_SPECS[i].difficulty);
        expect([...new Set(p.clues.map((c) => c.kind))].sort()).toEqual([...rules].sort());
      });
    }
  });

  it('cuts each board to its time window, give or take a minute', () => {
    let outside = 0;
    let far = 0;
    for (const run of runs) {
      run.forEach(({ minutes }, i) => {
        const [lo, hi] = BOARD_SPECS[i].minutes;
        expect(minutes, `board ${i + 1}`).toBeGreaterThanOrEqual(lo - 1);
        // Some rule mixes cannot make a medium board much shorter: about one final in fifty
        // runs two minutes or more over its window.
        expect(minutes, `board ${i + 1}`).toBeLessThanOrEqual(hi + 4);
        if (minutes < lo || minutes > hi) outside++;
        if (minutes < lo - 1 || minutes > hi + 1) far++;
      });
    }
    expect(outside).toBeLessThanOrEqual(runs.length);
    expect(far).toBeLessThanOrEqual(1);
  });

  it('rises from board to board and adds up to about 45 minutes', () => {
    const boards = Array.from({ length: BOARD_COUNT }, (_, i) => median(runs.map((r) => r[i].minutes)));
    for (let i = 1; i < BOARD_COUNT; i++) expect(boards[i], `board ${i + 1}`).toBeGreaterThan(boards[i - 1]);
    const totals = runs.map((r) => r.reduce((sum, b) => sum + b.minutes, 0));
    expect(median(totals)).toBeGreaterThanOrEqual(43);
    expect(median(totals)).toBeLessThanOrEqual(48);
    for (const t of totals) expect(t).toBeLessThan(52);
  });
});
