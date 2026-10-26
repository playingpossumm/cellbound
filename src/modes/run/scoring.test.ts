import { describe, expect, it } from 'vitest';
import type { TechniqueTier } from '../../engine/techniques';
import type { LensSlot } from './model';
import { allScoringOf, chipsFor, flowOf, scorePlacement, type PlacementFacts, type ScoreSetup } from './scoring';
import { CHIPS, CLEAN, FLOW, LENS, REWARD, SPECTRA_CHIPS } from './tuning';

const facts = (over: Partial<PlacementFacts> = {}): PlacementFacts => ({
  tier: 1,
  technique: 'nakedSingle',
  digit: 5,
  source: 'player',
  units: 0,
  clean: 0,
  clues: [],
  inLine: false,
  ...over,
});
const setup = (over: Partial<ScoreSetup> = {}): ScoreSetup => ({
  levels: new Array(9).fill(0),
  perks: {},
  lenses: [],
  hearts: 3,
  rule: null,
  ...over,
});
const lenses = (...ids: LensSlot['id'][]): LensSlot[] => ids.map((id) => ({ id }));
const fresh = { streak: 0, chain: 0 };

describe('a placement scores chips times mult', () => {
  it('takes its chips from the tier of the technique, with the spec table', () => {
    expect(CHIPS).toEqual([0, 10, 20, 30, 50, 80, 150, 250, 400]);
    for (let t = 1; t <= 8; t++) {
      const s = scorePlacement(facts({ tier: t as TechniqueTier }), setup(), fresh);
      expect(s.chips).toBe(CHIPS[t]);
      expect(s.mult).toBe(1);
      expect(s.points).toBe(CHIPS[t]);
    }
  });

  it('adds the Spectra levels of the tier: 3 a level for singles, 10 for tiers 2 and 3, 25 for 4 and 5, 50 for 6 to 8', () => {
    expect(SPECTRA_CHIPS.slice(1)).toEqual([3, 10, 10, 25, 25, 50, 50, 50]);
    const levels = [0, 2, 0, 0, 1, 0, 3, 0, 0];
    expect(chipsFor(1, levels)).toBe(16);
    expect(chipsFor(4, levels)).toBe(75);
    expect(chipsFor(6, levels)).toBe(300);
    expect(scorePlacement(facts({ tier: 4 }), setup({ levels }), fresh).points).toBe(75);
  });

  it('adds 1 to the mult for each unit and each clue the digit finishes', () => {
    const s = scorePlacement(facts({ tier: 2, units: 2, clues: [{ kind: 'thermo', total: 15 }] }), setup(), fresh);
    expect(s.mult).toBe(4);
    expect(s.points).toBe(80);
  });

  it('builds the flow by 0.1 a placement in the streak, up to 2', () => {
    expect([0, 1, 5, 10, 30].map((k) => flowOf(k, setup()))).toEqual([1, 1.1, 1.5, 2, 2]);
    const s = scorePlacement(facts(), setup(), { streak: 4, chain: 0 });
    expect(s.flow).toBe(1.4);
    expect(s.points).toBe(14);
    expect(s.next.streak).toBe(5);
  });

  it('builds the flow twice as fast with Hot Streak', () => {
    expect(flowOf(3, setup({ perks: { hotStreak: 1 } }))).toBe(1 + 3 * FLOW.hotStep);
    expect(flowOf(9, setup({ perks: { hotStreak: 1 } }))).toBe(2);
  });

  it('multiplies by 1.5 for every unit finished clean, or 2 with Clean Sweep', () => {
    const f = facts({ units: 2, clean: 2 });
    expect(scorePlacement(f, setup(), fresh).mult).toBe(3 * CLEAN.mult ** 2);
    expect(scorePlacement(f, setup({ perks: { cleanSweep: 1 } }), fresh).mult).toBe(3 * CLEAN.sweep ** 2);
  });

  it('scores a guess, a hint or a typed hint as nothing and ends the streak', () => {
    for (const f of [facts({ tier: 0, technique: 'unproven' }), facts({ source: 'hint' })]) {
      const s = scorePlacement(f, setup(), { streak: 7, chain: 3 });
      expect(s.points).toBe(0);
      expect(s.next).toEqual({ streak: 0, chain: 0 });
    }
  });

  it('scores a revealed cell as nothing and leaves the streak alone', () => {
    const s = scorePlacement(facts({ source: 'reveal' }), setup(), { streak: 7, chain: 3 });
    expect(s.points).toBe(0);
    expect(s.next).toEqual({ streak: 7, chain: 3 });
  });

  it('rounds chips times mult to whole points', () => {
    // 20 chips, mult (1 + 1) x 1.3 x 1.5 = 3.9
    const s = scorePlacement(facts({ tier: 2, units: 1, clean: 1 }), setup(), { streak: 3, chain: 0 });
    expect(s.mult).toBe(3.9);
    expect(s.points).toBe(78);
  });
});

describe('perks and the boss rule', () => {
  it('Fishbowl triples tiers 6 and 7 only', () => {
    const fb = setup({ perks: { fishbowl: 1 } });
    expect(scorePlacement(facts({ tier: 6 }), fb, fresh).points).toBe(150 * REWARD.fishbowl);
    expect(scorePlacement(facts({ tier: 7 }), fb, fresh).points).toBe(250 * REWARD.fishbowl);
    expect(scorePlacement(facts({ tier: 8 }), fb, fresh).points).toBe(400);
    expect(scorePlacement(facts({ tier: 5 }), fb, fresh).points).toBe(80);
  });

  it('Fish Market triples tier 6 and up on its board', () => {
    const fm = setup({ rule: 'fish' });
    expect(scorePlacement(facts({ tier: 6 }), fm, fresh).points).toBe(450);
    expect(scorePlacement(facts({ tier: 8 }), fm, fresh).points).toBe(1200);
    expect(scorePlacement(facts({ tier: 5 }), fm, fresh).points).toBe(80);
  });

  it('Prism Shards and Glass Hearts multiply all scoring and add up', () => {
    expect(allScoringOf({ prismShard: 2 })).toBe(1.4);
    expect(allScoringOf({ prismShard: 1, glassHeart: 1 })).toBe(1.8);
    expect(scorePlacement(facts({ tier: 3 }), setup({ perks: { prismShard: 3 } }), fresh).points).toBe(48);
  });

  it('Cascade builds 0.1 a placement in line with the last, and breaks out of line', () => {
    const c = setup({ perks: { cascade: 1 } });
    let at = fresh;
    const mults: number[] = [];
    for (const inLine of [true, true, true, false, true]) {
      const s = scorePlacement(facts({ inLine }), c, { ...at, streak: 0 });
      mults.push(s.mult);
      at = s.next;
    }
    expect(mults).toEqual([1.1, 1.2, 1.3, 1, 1.1]);
    // Without the card, nothing builds.
    expect(scorePlacement(facts({ inLine: true }), setup(), { streak: 0, chain: 5 }).next.chain).toBe(0);
  });

  it('Expert Pay adds flat points to tier 5 and harder, after the multiplying', () => {
    const e = setup({ perks: { expertPay: 2 }, lenses: lenses('glassCannon') });
    expect(scorePlacement(facts({ tier: 5 }), e, fresh).points).toBe(80 * 2 + 2 * REWARD.expertPay);
    expect(scorePlacement(facts({ tier: 4 }), e, fresh).points).toBe(100);
  });
});

describe('lenses fire in slot order', () => {
  it('adds chips, adds mult or multiplies the mult, each on its own condition', () => {
    expect(scorePlacement(facts({ tier: 1 }), setup({ lenses: lenses('loupe') }), fresh).points).toBe(10 + LENS.loupe);
    expect(scorePlacement(facts({ tier: 3 }), setup({ lenses: lenses('loupe') }), fresh).fired).toEqual([]);
    expect(scorePlacement(facts({ tier: 4 }), setup({ lenses: lenses('monocle') }), fresh).points).toBe(50 * (1 + LENS.monocle));
    expect(scorePlacement(facts({ tier: 5 }), setup({ lenses: lenses('spyglass') }), fresh).points).toBe(80 * LENS.spyglass);
    expect(scorePlacement(facts({ tier: 8 }), setup({ lenses: lenses('telescope') }), fresh).points).toBe(400 * LENS.telescope);
    expect(scorePlacement(facts({ tier: 6 }), setup({ lenses: lenses('fisheye') }), fresh).points).toBe(150 * (1 + LENS.fisheye));
  });

  it('gives a different total when the order changes: adding before multiplying is worth less', () => {
    const f = facts({ tier: 5 });
    const addFirst = scorePlacement(f, setup({ lenses: [{ id: 'kaleidoscope', n: 10 }, { id: 'spyglass' }] }), fresh);
    const timesFirst = scorePlacement(f, setup({ lenses: [{ id: 'spyglass' }, { id: 'kaleidoscope', n: 10 }] }), fresh);
    expect(addFirst.mult).toBe((1 + 1) * 2);
    expect(timesFirst.mult).toBe(1 * 2 + 1);
    expect(addFirst.fired).toEqual([0, 1]);
  });

  it('reads the placement: thermo-proved digits, finished cages, arrows and dots, nines and ones', () => {
    const thermo = facts({ tier: 3, technique: 'clueSingle', digit: 7, clue: 'thermo' });
    expect(scorePlacement(thermo, setup({ lenses: lenses('thermo') }), fresh).mult).toBe(8);
    // A clue single forced by another kind of clue leaves the Thermo Lens dark.
    expect(scorePlacement({ ...thermo, clue: 'arrow' }, setup({ lenses: lenses('thermo') }), fresh).fired).toEqual([]);
    const cage = facts({ clues: [{ kind: 'cage', total: 23 }] });
    expect(scorePlacement(cage, setup({ lenses: lenses('cage') }), fresh).chips).toBe(33);
    const arrows = facts({ clues: [{ kind: 'arrow', total: 9 }, { kind: 'arrow', total: 6 }] });
    expect(scorePlacement(arrows, setup({ lenses: lenses('arrow') }), fresh).mult).toBe(3 * LENS.arrow ** 2);
    const dots = facts({ clues: [{ kind: 'kropki', total: 3 }, { kind: 'xv', total: 10 }] });
    expect(scorePlacement(dots, setup({ lenses: lenses('dot') }), fresh).chips).toBe(10 + 2 * LENS.dot);
    expect(scorePlacement(facts({ digit: 9 }), setup({ lenses: lenses('redShift') }), fresh).mult).toBe(1 + LENS.redShift);
    expect(scorePlacement(facts({ digit: 1 }), setup({ lenses: lenses('blueShift') }), fresh).chips).toBe(10 + LENS.blueShift);
  });

  it('lifts the flow cap with Undertow and pays Riptide while the flow is full', () => {
    const u = setup({ lenses: lenses('undertow') });
    expect(flowOf(20, u)).toBe(LENS.undertowCap);
    expect(scorePlacement(facts(), u, { streak: 15, chain: 0 }).fired).toEqual([0]);
    expect(scorePlacement(facts(), u, { streak: 5, chain: 0 }).fired).toEqual([]);
    const r = setup({ lenses: lenses('riptide') });
    expect(scorePlacement(facts(), r, { streak: 10, chain: 0 }).mult).toBe(2 + LENS.riptide);
    expect(scorePlacement(facts(), r, { streak: 9, chain: 0 }).fired).toEqual([]);
  });

  it('pays Clear Glass for clean units, Clutch on the last heart and Glass Cannon always', () => {
    expect(scorePlacement(facts({ units: 1, clean: 1 }), setup({ lenses: lenses('clearGlass') }), fresh).mult).toBe(2 * 1.5 + LENS.clearGlass);
    expect(scorePlacement(facts(), setup({ lenses: lenses('clutch'), hearts: 1 }), fresh).mult).toBe(LENS.clutch);
    expect(scorePlacement(facts(), setup({ lenses: lenses('clutch'), hearts: 2 }), fresh).fired).toEqual([]);
    expect(scorePlacement(facts(), setup({ lenses: lenses('glassCannon') }), fresh).mult).toBe(LENS.glassCannon);
  });

  it('grows Kaleidoscope with its counter', () => {
    expect(scorePlacement(facts(), setup({ lenses: [{ id: 'kaleidoscope', n: 0 }] }), fresh).fired).toEqual([]);
    expect(scorePlacement(facts(), setup({ lenses: [{ id: 'kaleidoscope', n: 12 }] }), fresh).mult).toBe(1 + 12 * LENS.kaleidoscope);
  });

  it('lets Mirror copy the lens to its left, and nothing with nothing there', () => {
    const f = facts({ tier: 5 });
    expect(scorePlacement(f, setup({ lenses: lenses('spyglass', 'mirror') }), fresh).mult).toBe(4);
    expect(scorePlacement(f, setup({ lenses: lenses('spyglass', 'mirror', 'mirror') }), fresh).mult).toBe(8);
    expect(scorePlacement(f, setup({ lenses: lenses('mirror', 'spyglass') }), fresh).fired).toEqual([1]);
  });

  it('applies the all-scoring multiplier after the lenses', () => {
    const s = scorePlacement(facts({ tier: 4 }), setup({ lenses: lenses('monocle'), perks: { prismShard: 1 } }), fresh);
    expect(s.mult).toBeCloseTo((1 + LENS.monocle) * 1.2, 9);
    expect(s.points).toBe(Math.round(50 * 3.6));
  });
});
