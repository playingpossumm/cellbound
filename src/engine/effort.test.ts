import { describe, expect, it } from 'vitest';
import { FAIR_DEPTH } from './craft';
import { generateDaily } from './dailygen';
import { estimateEffort } from './effort';
import { LYRA } from './fixtures';
import { generate, grade } from './index';
import { contradictionDepth, Logic } from './logic';
import { buildModel } from './model';

describe('solving time estimate', () => {
  it('puts a classic easy 9x9 at a few minutes and a harder one at more', () => {
    const easy = generate({ size: 9, seed: 'effort', rules: [], difficulty: 1 });
    const hard = generate({ size: 9, seed: 'effort', rules: [], difficulty: 3 });
    const a = estimateEffort(easy), b = estimateEffort(hard);
    expect(a.solved && b.solved).toBe(true);
    expect(a.seconds).toBeGreaterThan(3 * 60);
    expect(a.seconds).toBeLessThan(7 * 60);
    expect(b.seconds).toBeGreaterThan(a.seconds);
  });

  it('grows as givens are taken away', () => {
    const p = generateDaily('2026-10-26');
    const more = p.givens.slice();
    let added = 0;
    for (let i = 0; i < 81 && added < 12; i++) if (!more[i]) { more[i] = p.solution[i]; added++; }
    expect(estimateEffort({ ...p, givens: more }).seconds).toBeLessThan(estimateEffort(p).seconds);
  });

  it('counts the clue steps of each kind', () => {
    const e = estimateEffort(LYRA);
    expect(e.solved).toBe(true);
    expect(Object.keys(e.clueSteps).length).toBeGreaterThan(0);
    for (const k of Object.keys(e.clueSteps)) expect(LYRA.clues.map((c) => c.kind)).toContain(k);
    expect(estimateEffort(LYRA)).toEqual(e);
  });
});

describe('short contradiction tests', () => {
  it('leave the grader as it was', () => {
    const p = generateDaily('2026-10-31');
    const L = new Logic(buildModel(p), p.givens);
    expect(L.probeDepth).toBe(Infinity);
    expect(grade(p).difficulty).toBe(4);
  });

  it('solve a Saturday Daily with chains of at most the fair depth', () => {
    const p = generateDaily('2026-10-31');
    const m = buildModel(p);
    const L = new Logic(m, p.givens);
    L.probeBudget = 12;
    L.probeDepth = FAIR_DEPTH;
    let probes = 0;
    while (!L.solved()) {
      const before = L.masks.slice();
      const s = L.next(4);
      expect(s).not.toBeNull();
      if (s!.kind !== 'probe') continue;
      probes++;
      expect(s!.depth!).toBeLessThanOrEqual(FAIR_DEPTH);
      expect(s!.elim).toHaveLength(1);
      // The ruled out digit is never the answer, and it breaks within the reported depth.
      const { cell, mask } = s!.elim[0];
      const digit = 31 - Math.clz32(mask);
      expect(p.solution[cell]).not.toBe(digit);
      expect(contradictionDepth(m, before, cell, digit, s!.depth!)).toBe(s!.depth);
    }
    expect(probes).toBeGreaterThan(0);
    expect(L.values).toEqual(p.solution);
  });

  it('report no contradiction for the right digit', () => {
    const p = generateDaily('2026-10-31');
    const m = buildModel(p);
    const L = new Logic(m, p.givens);
    L.run(3);
    for (let c = 0; c < 81; c++) {
      if (!L.values[c]) expect(contradictionDepth(m, L.masks, c, p.solution[c], 81), String(c)).toBe(-1);
    }
  });
});
