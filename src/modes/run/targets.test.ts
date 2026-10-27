import { describe, expect, it } from 'vitest';
import type { TierProfile } from '../../engine/techniques';
import { KINDS, SLOT_COUNT, slotOf } from './boards';
import { marksOfTiers, roundTarget, slotFactor, targetFor } from './targets';
import { TARGET } from './tuning';

const profile: TierProfile = { typical: [0, 30, 15, 5, 0, 0, 0, 0, 0], expert: [0, 20, 15, 10, 3, 2, 0, 0, 0] };

describe('score targets', () => {
  it('start from the marks a typical tier mix earns', () => {
    expect(marksOfTiers(profile.typical)).toBe(30 * 10 + 15 * 20 + 5 * 30);
    expect(marksOfTiers([0, 0, 0, 0, 0, 0, 2, 1, 1], 8)).toBe(2 * 150 + 250 + 400);
  });

  it('count a forced placement above tier 5 at tier 5 marks, so one chain cannot put a board out of reach', () => {
    expect(TARGET.tierCap).toBe(5);
    expect(marksOfTiers([0, 40, 0, 0, 0, 1, 0, 0, 2])).toBe(400 + 80 + 2 * 80);
  });

  it('ask 1.25 times as much on a Big board and 1.5 times on a boss, and grow by the same factor each ante', () => {
    expect(TARGET.kind).toEqual({ small: 1, big: 1.25, boss: 1.5 });
    expect(slotFactor(slotOf(1, 'small'))).toBeCloseTo(TARGET.scale, 9);
    expect(slotFactor(slotOf(1, 'big')) / slotFactor(slotOf(1, 'small'))).toBeCloseTo(1.25, 9);
    expect(slotFactor(slotOf(1, 'boss')) / slotFactor(slotOf(1, 'small'))).toBeCloseTo(1.5, 9);
    for (const k of KINDS) {
      expect(slotFactor(slotOf(2, k)) / slotFactor(slotOf(1, k))).toBeCloseTo(TARGET.anteGrowth, 9);
      expect(slotFactor(slotOf(3, k)) / slotFactor(slotOf(2, k))).toBeCloseTo(TARGET.anteGrowth, 9);
    }
  });

  it('round to numbers worth aiming at', () => {
    expect([4, 754, 999, 1012, 1026, 12_345].map(roundTarget)).toEqual([10, 750, 1000, 1000, 1050, 12_300]);
    expect(targetFor(0, profile)).toBe(roundTarget(750 * TARGET.scale));
    expect(targetFor(8, profile)).toBe(roundTarget(750 * TARGET.scale * 1.5 * TARGET.anteGrowth ** 2));
  });

  it('never fall through the run on the same profile, and rise within each ante', () => {
    const all = Array.from({ length: SLOT_COUNT }, (_, s) => targetFor(s, profile));
    for (let s = 1; s < SLOT_COUNT; s++) expect(all[s], `slot ${s}`).toBeGreaterThanOrEqual(all[s - 1]);
    for (let a = 0; a < 3; a++) expect(all[3 * a + 2]).toBeGreaterThan(all[3 * a + 1]);
    for (let a = 0; a < 3; a++) expect(all[3 * a + 1]).toBeGreaterThan(all[3 * a]);
  });
});
