import { describe, expect, it } from 'vitest';
import type { TallyFx } from './live';
import { planOf, SHOW_TIER } from './show';

const tally = (over: Partial<TallyFx> = {}): TallyFx => ({
  id: 1,
  marks: 80,
  mult: 4.8,
  points: 384,
  flow: 1,
  fired: [0, 2],
  tier: SHOW_TIER,
  base: { marks: 80, mult: 1 },
  steps: [
    { lens: 0, marks: 80, mult: 2 },
    { lens: 2, marks: 80, mult: 4 },
  ],
  ...over,
});

describe('how a placement plays out in the band', () => {
  it('plays a pair or harder beat by beat: marks, mult, each lens, what scales all scoring, then the points', () => {
    const p = planOf(tally(), true);
    expect(p.full).toBe(true);
    expect(p.beats.map((b) => [b.at, b.marks, b.mult, b.points])).toEqual([
      [240, 80, null, false],
      [540, 80, 1, false],
      [840, 80, 2, false],
      [1140, 80, 4, false],
      [1440, 80, 4.8, false],
      [1740, 80, 4.8, true],
    ]);
    // Each lens fires on its own beat, and the points leave once the sum is done.
    expect([p.lensAt(0), p.lensAt(1)]).toEqual([840, 1140]);
    expect(p.flyAt).toBe(1740 + 420);
    expect(p.hold).toBeGreaterThan(p.lensAt(1));
  });

  it('needs no extra beat when nothing scales all scoring', () => {
    const p = planOf(tally({ mult: 4, points: 320 }), true);
    expect(p.beats.map((b) => b.mult)).toEqual([null, 1, 2, 4, 4]);
    expect(p.beats.at(-1)!.points).toBe(true);
  });

  it('shows a single and every other easy placement at once, its lenses 60 ms apart', () => {
    const p = planOf(tally({ tier: 2 }), true);
    expect(p.full).toBe(false);
    expect(p.beats).toEqual([]);
    expect([p.lensAt(0), p.lensAt(1)]).toEqual([0, 60]);
  });

  it('has no beats without motion, whatever the technique', () => {
    expect(planOf(tally({ tier: 8 }), false).full).toBe(false);
  });
});
