import { describe, expect, it } from 'vitest';
import { countSolutions } from '../../engine';
import type { TierProfile } from '../../engine/techniques';
import type { GeneratedPuzzle, GenerateOptions } from '../../engine/types';
import { LYRA } from '../../engine/fixtures';
import { optionsFor } from './boards';
import { prepareBoard } from './board';
import { bossText, BOSS_RULES, clockMs, fishIn, pickFishBoard, returning, thiefCells, withStolen } from './bosses';
import { BOSS } from './tuning';

const profile = (expert: number[]): TierProfile => ({ typical: [0, 30, 10, 5, 0, 0, 0, 0, 0], expert });
const flat = profile([0, 20, 10, 5, 2, 1, 0, 0, 0]);
const fishy = profile([0, 20, 10, 5, 2, 1, 1, 0, 0]);

/** A stand-in generator: a puzzle that carries its seed, so the fake profile can tell boards apart. */
const fakeGen = async (o: GenerateOptions): Promise<GeneratedPuzzle> => ({ ...LYRA, id: o.seed, seed: o.seed });

describe('Fish Market picks a board with a tier 6 or harder deduction', () => {
  it('counts the expert placements of tier 6 and up', () => {
    expect(fishIn(flat)).toBe(0);
    expect(fishIn(fishy)).toBe(1);
    expect(fishIn(profile([0, 0, 0, 0, 0, 0, 2, 3, 1]))).toBe(6);
  });

  it('takes the first board in its fixed order whose expert profile has one', async () => {
    const base = optionsFor('t:fish', 8);
    const tried: string[] = [];
    const profileOf = (p: { seed: string }) => {
      tried.push(p.seed);
      return p.seed.endsWith(':fish3') ? fishy : flat;
    };
    const pick = await pickFishBoard(base, fakeGen, profileOf);
    expect(pick.attempt).toBe(3);
    expect(pick.puzzle.seed).toBe(`${base.seed}:fish3`);
    expect(tried).toEqual([base.seed, `${base.seed}:fish1`, `${base.seed}:fish2`, `${base.seed}:fish3`]);
  });

  it('takes the board itself when it already has one', async () => {
    const pick = await pickFishBoard(optionsFor('t:fish', 8), fakeGen, () => fishy);
    expect(pick.attempt).toBe(0);
  });

  it('keeps the board with the most when none has one, and the first on a tie', async () => {
    const all = await pickFishBoard(optionsFor('t:fish', 8), fakeGen, () => flat);
    expect(all.attempt).toBe(0);
    let n = 0;
    const tries: string[] = [];
    await pickFishBoard(optionsFor('t:fish', 8), fakeGen, (p) => (tries.push(p.seed), n++, flat));
    expect(n).toBe(BOSS.fishTries);
  });

  it('skips a board that cannot be built', async () => {
    const gen = async (o: GenerateOptions) => {
      if (!o.seed.includes('fish')) throw new Error('no');
      return fakeGen(o);
    };
    const pick = await pickFishBoard(optionsFor('t:fish', 8), gen, (p) => (p.seed.endsWith('fish1') ? fishy : flat));
    expect(pick.attempt).toBe(1);
  });

  it('prepares a Fish Market boss through the same selection, and its target from the picked board', async () => {
    const run = { seed: 't:market', bosses: ['fog', 'mute', 'fish'] as const };
    const profileOf = (p: { seed: string }) => (p.seed.endsWith(':fish2') ? fishy : flat);
    const p = await prepareBoard({ ...run, bosses: [...run.bosses] }, 8, { gen: fakeGen, profileOf });
    expect(p.puzzle.seed).toBe(`${optionsFor(run.seed, 8).seed}:fish2`);
    expect(p.target).toBeGreaterThan(0);
  });
});

describe('Thief hides givens', () => {
  it('takes givens that leave a single solution, spaced apart, in an order fixed by the board', () => {
    const stolen = thiefCells(LYRA, 3);
    expect(stolen.length).toBeGreaterThan(0);
    expect(stolen.length).toBeLessThanOrEqual(3);
    expect(stolen.every((c) => LYRA.givens[c])).toBe(true);
    expect(countSolutions(withStolen(LYRA, stolen), 2)).toBe(1);
    expect(thiefCells(LYRA, 3)).toEqual(stolen);
    for (const a of stolen) for (const b of stolen) if (a !== b) expect(Math.max(Math.abs(Math.floor(a / 6) - Math.floor(b / 6)), Math.abs((a % 6) - (b % 6)))).toBeGreaterThanOrEqual(2);
  });

  it('takes none when every given is needed', () => {
    expect(thiefCells(LYRA, 6, () => false)).toEqual([]);
  });

  it('deals the board without them, under a new id, and brings each back next to a solved cell', () => {
    const p = withStolen(LYRA, [5]);
    expect(p.givens[5]).toBe(0);
    expect(p.id).not.toBe(LYRA.id);
    expect(withStolen(LYRA, [])).toBe(LYRA);
    expect(returning(6, [5, 20], 4)).toEqual([5]);
    expect(returning(6, [5, 20], 14)).toEqual([20]);
    expect(returning(6, [5, 20], 0)).toEqual([]);
  });
});

describe('the other rules', () => {
  it('gives the clock a quarter more than the high end of the window, to the minute', () => {
    expect(clockMs([7, 8.5])).toBe(11 * 60_000);
    expect(clockMs([13, 15])).toBe(19 * 60_000);
  });

  it('words every rule plainly', () => {
    for (const r of BOSS_RULES) expect(bossText(r).length).toBeGreaterThan(10);
    expect(bossText('clock', 11)).toContain('11 minutes');
  });
});
