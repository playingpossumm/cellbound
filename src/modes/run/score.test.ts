import { describe, expect, it } from 'vitest';
import { BASE_SCORE, PAR_MS } from './boards';
import { HEART_BONUS, HINT_COST_SHARE, TIME_BONUS_SHARE, endBonus, formatMs, formatScore, scoreBoard } from './score';

const input = (d: number, over: Partial<Parameters<typeof scoreBoard>[0]> = {}) => ({
  difficulty: d,
  parMs: PAR_MS[d],
  elapsedMs: PAR_MS[d],
  hintsUsed: 0,
  mult: 1,
  ...over,
});

describe('scoreBoard', () => {
  it('gives the base score and no time bonus at or over par', () => {
    const s = scoreBoard(input(2));
    expect(s).toMatchObject({ base: BASE_SCORE[2], timeBonus: 0, hintPenalty: 0, subtotal: BASE_SCORE[2], total: BASE_SCORE[2] });
    expect(scoreBoard(input(2, { elapsedMs: PAR_MS[2] * 3 })).timeBonus).toBe(0);
  });

  it('adds up to half the base for a fast solve, shrinking linearly to par', () => {
    expect(scoreBoard(input(3, { elapsedMs: 0 })).timeBonus).toBe(BASE_SCORE[3] * TIME_BONUS_SHARE);
    expect(scoreBoard(input(3, { elapsedMs: PAR_MS[3] / 2 })).timeBonus).toBe((BASE_SCORE[3] * TIME_BONUS_SHARE) / 2);
  });

  it('measures the time bonus against the par it is given, not the base difficulty', () => {
    // An easier board has a shorter par, so the same time earns less.
    const easy = scoreBoard(input(3, { parMs: PAR_MS[2], elapsedMs: 100_000 }));
    const normal = scoreBoard(input(3, { elapsedMs: 100_000 }));
    expect(easy.base).toBe(normal.base);
    expect(easy.timeBonus).toBeLessThan(normal.timeBonus);
  });

  it('applies the curse multiplier to the subtotal', () => {
    const s = scoreBoard(input(1, { mult: 1.5 }));
    expect(s.total).toBe(150);
    expect(s.mult).toBe(1.5);
  });

  it('never lets the multiplier drop below 1', () => {
    expect(scoreBoard(input(1, { mult: 0.2 })).total).toBe(BASE_SCORE[1]);
  });

  it('charges each hint a share of the base and floors at zero', () => {
    const one = scoreBoard(input(2, { hintsUsed: 1 }));
    expect(one.hintPenalty).toBe(Math.round(BASE_SCORE[2] * HINT_COST_SHARE));
    expect(one.total).toBe(BASE_SCORE[2] - one.hintPenalty);
    expect(scoreBoard(input(1, { hintsUsed: 99, mult: 2 })).total).toBe(0);
  });

  it('keeps the breakdown consistent with the total', () => {
    for (let d = 1; d <= 5; d++) {
      for (const t of [0, 40_000, 200_000, 900_000]) {
        for (const h of [0, 2]) {
          const s = scoreBoard(input(d, { elapsedMs: t, hintsUsed: h, mult: 1.35 }));
          expect(s.subtotal).toBe(Math.max(0, s.base + s.timeBonus - s.hintPenalty));
          expect(s.total).toBe(Math.round(s.subtotal * s.mult));
        }
      }
    }
  });

  it('rises with difficulty for the same time ratio', () => {
    const totals = [1, 2, 3, 4].map((d) => scoreBoard(input(d, { elapsedMs: PAR_MS[d] / 2 })).total);
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
