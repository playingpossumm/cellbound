import { describe, expect, it } from 'vitest';
import { clueHolds } from './conflicts';
import { dailySpec, dailyName, generateDaily, packDay, unpackDay, weekday, type MonthFile } from './daily';
import { CONSTELLATIONS, conflicts, countSolutions, dailyDate, dailyPuzzle } from './index';
import { clueCells } from './model';

const stored = import.meta.glob('../data/daily/*.json', { eager: true, import: 'default' }) as Record<string, MonthFile>;

describe('daily schedule', () => {
  it('follows the weekday table', () => {
    // 2026-10-19 is a Monday.
    const want = [
      ['2026-10-19', 6, 1], ['2026-10-20', 6, 2], ['2026-10-21', 6, 2], ['2026-10-22', 6, 3],
      ['2026-10-23', 6, 3], ['2026-10-24', 6, 4], ['2026-10-25', 9, 3],
    ] as const;
    for (const [date, size, difficulty] of want) {
      const s = dailySpec(date);
      expect([date, s.size, s.difficulty]).toEqual([date, size, difficulty]);
    }
    expect(weekday('2026-10-19')).toBe(1);
    expect(dailySpec('2026-10-19').maxKinds).toBe(2);
    expect(dailySpec('2026-10-20').minKinds).toBe(2);
  });

  it('names each day after a constellation', () => {
    const names = new Set<string>();
    for (let d = 1; d <= 31; d++) names.add(dailyName(`2026-12-${String(d).padStart(2, '0')}`));
    expect(names.size).toBe(31);
    for (const n of names) expect(CONSTELLATIONS).toContain(n);
  });

  it('formats local dates', () => {
    expect(dailyDate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('daily puzzles', () => {
  it('loads stored months and they match the schedule', async () => {
    for (const date of ['2026-10-23', '2026-10-24', '2026-10-25', '2027-06-15', '2027-12-31']) {
      const p = await dailyPuzzle(date);
      const s = dailySpec(date);
      expect(p.id).toBe(`daily-${date}`);
      expect(p.size).toBe(s.size);
      expect(p.difficulty).toBe(s.difficulty);
      expect(p.name).toBe(dailyName(date));
      expect(countSolutions(p, 2)).toBe(1);
      for (const c of p.clues) expect(clueHolds(c, p.solution, p.size)).toBe(true);
      const kinds = new Set(p.clues.map((c) => c.kind)).size;
      expect(kinds).toBeLessThanOrEqual(s.maxKinds);
    }
  });

  it('stores every day from 2026-10 to 2027-12, each valid and on schedule', () => {
    let days = 0;
    for (const [path, month] of Object.entries(stored)) {
      for (const [date, packed] of Object.entries(month)) {
        expect(path).toContain(`${date.slice(0, 7)}.json`);
        const p = unpackDay(date, packed);
        const s = dailySpec(date);
        expect([date, p.size, p.difficulty]).toEqual([date, s.size, s.difficulty]);
        const kinds = new Set(p.clues.map((c) => c.kind));
        expect(kinds.size, date).toBeGreaterThanOrEqual(s.minKinds);
        expect(kinds.size, date).toBeLessThanOrEqual(s.maxKinds);
        expect(p.clues.some((c) => clueCells(c).length > 0), date).toBe(true);
        p.givens.forEach((d, i) => { if (d) expect(d).toBe(p.solution[i]); });
        expect(conflicts(p, p.solution)).toEqual([]);
        for (const c of p.clues) expect(clueHolds(c, p.solution, p.size), date).toBe(true);
        expect(countSolutions(p, 2), date).toBe(1);
        days++;
      }
    }
    expect(days).toBe(92 + 365);
  });

  it('is the same on every call', async () => {
    expect(await dailyPuzzle('2027-03-03')).toEqual(await dailyPuzzle('2027-03-03'));
  });

  it('falls back to generating when a month is missing', async () => {
    const p = await dailyPuzzle('2031-02-02');
    expect(p.size).toBe(dailySpec('2031-02-02').size);
    expect(countSolutions(p, 2)).toBe(1);
    expect(p).toEqual(generateDaily('2031-02-02'));
  });

  it('packs and unpacks without loss', () => {
    const p = generateDaily('2031-02-03');
    expect(unpackDay('2031-02-03', packDay(p))).toEqual(p);
  });
});
