import { describe, expect, it } from 'vitest';
import { BOARD_SPECS, baseFor } from './boards';
import { baseOf, clockOf, parOf, POINTS_PER_MINUTE, scaleWindow } from './scale';
import { HEART_BONUS, HINT_COST_SHARE, TIME_BONUS_SHARE, endBonus, formatMs, formatScore, scoreBoard, type ScoreInput } from './score';

const BASE = 300;
const PAR = 600_000;
const input = (over: Partial<ScoreInput> = {}): ScoreInput => ({ base: BASE, parMs: PAR, elapsedMs: PAR, hintsUsed: 0, mult: 1, ...over });

describe('a board\'s numbers from its time window', () => {
  it('sets par at the middle of the window, to the half minute', () => {
    expect(parOf([10, 11.5])).toBe(660_000);
    expect(parOf([8, 9])).toBe(510_000);
    expect(parOf([6.5, 7.5])).toBe(420_000);
  });

  it('sets the Tight clock a minute over par, up to the whole minute', () => {
    expect(clockOf([6.5, 7.5])).toBe(480_000);
    expect(clockOf([8, 9])).toBe(600_000);
    expect(clockOf([11.5, 12.5])).toBe(780_000);
  });

  it('scales a window to the tenth of a minute', () => {
    expect(scaleWindow([9.5, 10.5], 0.8)).toEqual([7.6, 8.4]);
    expect(scaleWindow([7.2, 7.2], 1.25)).toEqual([9, 9]);
  });

  it('pays 30 points a minute of the window', () => {
    expect(POINTS_PER_MINUTE).toBe(30);
    expect(baseOf([11.5, 12.5])).toBe(360);
    expect(baseOf([5, 6.5])).toBe(170);
  });

  it('gives every slot of the run a higher base than the one before', () => {
    const bases = BOARD_SPECS.map((_, i) => baseFor(i));
    for (let i = 1; i < bases.length; i++) expect(bases[i], `board ${i + 1}`).toBeGreaterThan(bases[i - 1]);
  });
});

describe('scoreBoard', () => {
  it('gives the base score and no time bonus at or over par', () => {
    expect(scoreBoard(input())).toMatchObject({ base: BASE, timeBonus: 0, hintPenalty: 0, subtotal: BASE, total: BASE });
    expect(scoreBoard(input({ elapsedMs: PAR * 3 })).timeBonus).toBe(0);
  });

  it('adds up to half the base for a fast solve, shrinking linearly to par', () => {
    expect(scoreBoard(input({ elapsedMs: 0 })).timeBonus).toBe(BASE * TIME_BONUS_SHARE);
    expect(scoreBoard(input({ elapsedMs: PAR / 2 })).timeBonus).toBe((BASE * TIME_BONUS_SHARE) / 2);
  });

  it('measures the time bonus against the par it is given', () => {
    // An easier board has a shorter par, so the same time earns less; the base stays.
    const easy = scoreBoard(input({ parMs: parOf(scaleWindow([10, 11.5], 0.8)), elapsedMs: 300_000 }));
    const normal = scoreBoard(input({ elapsedMs: 300_000 }));
    expect(easy.base).toBe(normal.base);
    expect(easy.timeBonus).toBeLessThan(normal.timeBonus);
  });

  it('applies the curse multiplier to the subtotal', () => {
    const s = scoreBoard(input({ mult: 1.5 }));
    expect(s.total).toBe(450);
    expect(s.mult).toBe(1.5);
  });

  it('never lets the multiplier drop below 1', () => {
    expect(scoreBoard(input({ mult: 0.2 })).total).toBe(BASE);
  });

  it('charges each hint a share of the base and floors at zero', () => {
    const one = scoreBoard(input({ hintsUsed: 1 }));
    expect(one.hintPenalty).toBe(Math.round(BASE * HINT_COST_SHARE));
    expect(one.total).toBe(BASE - one.hintPenalty);
    expect(scoreBoard(input({ hintsUsed: 99, mult: 2 })).total).toBe(0);
  });

  it('keeps the breakdown consistent with the total', () => {
    for (let i = 0; i < BOARD_SPECS.length; i++) {
      for (const t of [0, 40_000, 400_000, 900_000]) {
        for (const h of [0, 2]) {
          const s = scoreBoard({ base: baseFor(i), parMs: parOf(BOARD_SPECS[i].minutes), elapsedMs: t, hintsUsed: h, mult: 1.35 });
          expect(s.subtotal).toBe(Math.max(0, s.base + s.timeBonus - s.hintPenalty));
          expect(s.total).toBe(Math.round(s.subtotal * s.mult));
        }
      }
    }
  });

  it('rises along the run for the same share of par', () => {
    const totals = BOARD_SPECS.map((spec, i) => {
      const par = parOf(spec.minutes);
      return scoreBoard({ base: baseFor(i), parMs: par, elapsedMs: par / 2, hintsUsed: 0, mult: 1 }).total;
    });
    expect([...totals].sort((a, b) => a - b)).toEqual(totals);
  });
});

describe('end bonus and formatting', () => {
  it('pays per heart left', () => {
    expect(endBonus(0)).toBe(0);
    expect(endBonus(3)).toBe(3 * HEART_BONUS);
    expect(endBonus(-2)).toBe(0);
  });
  it('formats scores and times', () => {
    expect(formatScore(0)).toBe('0');
    expect(formatScore(999)).toBe('999');
    expect(formatScore(1250)).toBe('1,250');
    expect(formatScore(1234567)).toBe('1,234,567');
    expect(formatMs(0)).toBe('0:00');
    expect(formatMs(65_000)).toBe('1:05');
    expect(formatMs(240_000)).toBe('4:00');
  });
});
