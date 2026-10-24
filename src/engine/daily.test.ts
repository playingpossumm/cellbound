import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { clueHolds } from './conflicts';
import { FAIR_DEPTH } from './craft';
import {
  dailyName,
  dailySpec,
  dayNumber,
  isNineDaily,
  NINE_FROM,
  packDay,
  unpackDay,
  weekday,
  weekRules,
  type MonthFile,
} from './daily';
import { generateDaily } from './dailygen';
import { estimateEffort } from './effort';
import { ALL_KINDS, GLOBAL_KINDS, LOCAL_KINDS } from './generator';
import { CONSTELLATIONS, conflicts, countSolutions, dailyDate, dailyPuzzle, grade, hint } from './index';
import { Logic, type Tech } from './logic';
import { buildModel } from './model';
import type { Clue, ClueKind, Puzzle } from './types';

const stored = import.meta.glob('../data/daily/*.json', { eager: true, import: 'default' }) as Record<string, MonthFile>;
const october = stored['../data/daily/2026-10.json'];
const nineDays: Puzzle[] = Object.values(stored)
  .flatMap((m) => Object.entries(m))
  .filter(([date]) => isNineDaily(date))
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([date, packed]) => unpackDay(date, packed));

/**
 * Every stored Daily before the 9x9 cut-over, as it was stored before the
 * cut-over: the first 16 hex digits of the SHA-256 of its packed form.
 */
const BEFORE_NINE: Record<string, string> = {
  '2026-10-01': 'ad7f0ed76dab92c7',
  '2026-10-02': '15e2578005708186',
  '2026-10-03': 'b4738ad0e8546a8d',
  '2026-10-04': 'a9b430131d156f9f',
  '2026-10-05': 'e5a545c4cd519182',
  '2026-10-06': '36ebfaaf3e1f6e76',
  '2026-10-07': '1af854a68fae7afd',
  '2026-10-08': '334ed2f036a887ae',
  '2026-10-09': '2bed901de1be8e90',
  '2026-10-10': 'aa63c65208f1f92c',
  '2026-10-11': '3c499953a3be697b',
  '2026-10-12': '33e51a42abaf513a',
  '2026-10-13': '4549d06a7d9ebf57',
  '2026-10-14': '7f5b1220975b59e3',
  '2026-10-15': '643daead1195641a',
  '2026-10-16': '9680ee13eeb508e2',
  '2026-10-17': '447a387d4219927a',
  '2026-10-18': '1902ae52c9dfa5be',
  '2026-10-19': '02a735b8806fb07b',
  '2026-10-20': 'add837b95369d9f4',
  '2026-10-21': 'f2a1a77240fe0450',
  '2026-10-22': '3ccf0f4f22ff8f62',
  '2026-10-23': 'a93420230d939b10',
};

const digest = (x: unknown) => createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0, 16);
const dateOf = (dn: number) => new Date(dn * 86400000).toISOString().slice(0, 10);
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** The grader's solver with short contradiction tests only, as the 9x9 Dailies are made. */
function fairSolves(p: Puzzle, clues: Clue[], tech: Tech): boolean {
  const L = new Logic(buildModel({ ...p, clues }), p.givens);
  L.probeBudget = 12;
  L.probeDepth = FAIR_DEPTH;
  return L.run(tech) && L.values.every((v, i) => v === p.solution[i]);
}

const TECH: Record<number, Tech> = { 1: 2, 2: 2, 3: 3, 4: 4 };

describe('the cut-over to 9x9 on 2026-10-24', () => {
  it('keeps every earlier Daily byte for byte', () => {
    for (const [date, want] of Object.entries(BEFORE_NINE)) expect(digest(october[date]), date).toBe(want);
    const earlier = Object.values(stored).flatMap((m) => Object.keys(m)).filter((d) => !isNineDaily(d)).sort();
    expect(earlier).toEqual(Object.keys(BEFORE_NINE));
  });

  it('still generates the earlier Dailies exactly as stored', () => {
    for (const date of Object.keys(BEFORE_NINE)) expect(JSON.stringify(packDay(generateDaily(date))), date).toBe(JSON.stringify(october[date]));
  });

  it('switches on 2026-10-24', () => {
    expect(NINE_FROM).toBe('2026-10-24');
    expect(isNineDaily('2026-10-23')).toBe(false);
    expect(isNineDaily('2026-10-24')).toBe(true);
    expect(dailySpec('2026-10-23').size).toBe(6);
    expect(dailySpec('2026-10-24').size).toBe(9);
    for (const [date] of Object.entries(october)) expect(unpackDay(date, october[date]).size, date).toBe(isNineDaily(date) ? 9 : weekday(date) === 0 ? 9 : 6);
  });
});

describe('daily schedule', () => {
  it('follows the old weekday table before the cut-over', () => {
    // 2026-10-12 is a Monday.
    const want = [[6, 1], [6, 2], [6, 2], [6, 3], [6, 3], [6, 4], [9, 3]];
    for (let i = 0; i < 7; i++) {
      const date = dateOf(dayNumber('2026-10-12') + i);
      const s = dailySpec(date);
      expect([date, s.size, s.difficulty], date).toEqual([date, ...want[i]]);
      expect(s.rules).toEqual(ALL_KINDS);
      expect(s.minutes).toBeUndefined();
    }
    expect(weekday('2026-10-12')).toBe(1);
    expect(dailySpec('2026-10-12').maxKinds).toBe(2);
    expect(dailySpec('2026-10-13').minKinds).toBe(2);
  });

  it('climbs from a gentle Monday to a hard Saturday, with a longer Sunday', () => {
    // Levels, rule counts and target minutes from Monday 2026-10-26 to Sunday 2026-11-01.
    const want: [number, number, number, number][] = [[1, 1, 5, 8], [2, 2, 8, 11], [2, 2, 11, 14], [3, 2, 14, 17], [3, 2, 17, 20], [4, 2, 21, 29], [3, 3, 19, 25]];
    for (let i = 0; i < 7; i++) {
      const date = dateOf(dayNumber('2026-10-26') + i);
      const s = dailySpec(date);
      expect([DAYS[weekday(date)], s.size, s.difficulty, s.rules.length, ...s.minutes!]).toEqual([DAYS[(i + 1) % 7], 9, ...want[i]]);
      expect([s.minKinds, s.maxKinds]).toEqual([want[i][1], want[i][1]]);
    }
    expect(dailySpec('2026-10-24').difficulty).toBe(4);
    expect(dailySpec('2026-10-25').difficulty).toBe(3);
  });

  it('uses all nine rules every week and spreads them out', () => {
    for (let monday = dayNumber('2026-10-26'); monday < dayNumber('2031-01-01'); monday += 7) {
      const week = weekRules(monday);
      const at = dateOf(monday);
      expect(week.map((d) => d.length), at).toEqual([1, 2, 2, 2, 2, 2, 3]);
      expect(new Set(week.flat()).size, at).toBe(9);
      for (const g of GLOBAL_KINDS) expect(week.filter((d) => d.includes(g)).length, at).toBe(1);
      expect(week.findIndex((d) => d.includes('diagonal')), at).not.toBe(week.findIndex((d) => d.includes('antiKnight')));
      expect(week[0].every((k) => LOCAL_KINDS.includes(k)), at).toBe(true);
      week.forEach((day, i) => {
        expect(new Set(day).size, at).toBe(day.length);
        expect(day.some((k) => LOCAL_KINDS.includes(k)), at).toBe(true);
        if (i) for (const k of day) if (LOCAL_KINDS.includes(k)) expect(week[i - 1].includes(k), `${at} ${k}`).toBe(false);
        expect(dailySpec(dateOf(monday + i)).rules).toEqual(day);
      });
    }
  });

  it('names each day after a constellation, as before', () => {
    const names = new Set<string>();
    for (let d = 1; d <= 31; d++) names.add(dailyName(`2026-12-${String(d).padStart(2, '0')}`));
    expect(names.size).toBe(31);
    for (const n of names) expect(CONSTELLATIONS).toContain(n);
    expect(dailyName('2026-10-24')).toBe(CONSTELLATIONS[(dayNumber('2026-10-24') * 37) % 88]);
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

  it('stores every day from 2026-10 to 2027-12', () => {
    const days = Object.values(stored).reduce((a, m) => a + Object.keys(m).length, 0);
    expect(Object.keys(stored)).toHaveLength(15);
    expect(days).toBe(92 + 365);
  });

  for (const [path, month] of Object.entries(stored)) {
    const ym = path.slice(-12, -5);
    it(`stores ${ym} valid and on schedule`, () => {
      for (const [date, packed] of Object.entries(month)) {
        expect(date.slice(0, 7)).toBe(ym);
        const p = unpackDay(date, packed);
        const s = dailySpec(date);
        expect([date, p.size, p.difficulty]).toEqual([date, s.size, s.difficulty]);
        const kinds = new Set(p.clues.map((c) => c.kind));
        expect(kinds.size, date).toBeGreaterThanOrEqual(s.minKinds);
        expect(kinds.size, date).toBeLessThanOrEqual(s.maxKinds);
        if (isNineDaily(date)) expect([...kinds].sort(), date).toEqual([...s.rules].sort());
        expect(p.clues.some((c) => c.kind !== 'diagonal' && c.kind !== 'antiKnight'), date).toBe(true);
        p.givens.forEach((d, i) => { if (d) expect(d).toBe(p.solution[i]); });
        expect(conflicts(p, p.solution)).toEqual([]);
        for (const c of p.clues) expect(clueHolds(c, p.solution, p.size), date).toBe(true);
        expect(countSolutions(p, 2), date).toBe(1);
      }
    });
  }

  it('makes every 9x9 Daily fair at its level, with work for every rule', () => {
    for (const p of nineDays) {
      const date = p.id.slice(6);
      const tech = TECH[p.difficulty];
      expect(grade(p).difficulty, date).toBe(p.difficulty);
      expect(fairSolves(p, p.clues, tech), date).toBe(true);
      if (tech > 2) expect(fairSolves(p, p.clues, (tech - 1) as Tech), date).toBe(false);
      const givens = p.givens.filter((d) => d).length;
      if (p.difficulty === 1) expect(givens, date).toBeGreaterThanOrEqual(30);
      if (p.difficulty === 2) expect(givens, date).toBeLessThan(30);
      for (const k of new Set(p.clues.map((c) => c.kind))) {
        expect(fairSolves(p, p.clues.filter((c) => c.kind !== k), tech), `${date} without ${k}`).toBe(false);
      }
    }
  });

  it('paces the week: each day near its target time, rising from Monday to Saturday', () => {
    const byDay: number[][] = [[], [], [], [], [], [], []];
    let outside = 0;
    for (const p of nineDays) {
      const date = p.id.slice(6);
      const e = estimateEffort(p, { probeDepth: FAIR_DEPTH });
      const [lo, hi] = dailySpec(date).minutes!;
      expect(e.seconds, date).toBeGreaterThanOrEqual(lo * 60 - 60);
      expect(e.seconds, date).toBeLessThanOrEqual(hi * 60 + 60);
      if (e.seconds < lo * 60 || e.seconds > hi * 60) outside++;
      byDay[weekday(date)].push(e.seconds);
      // A gentle Monday still needs its rule a few times.
      if (weekday(date) === 1) expect(Object.values(e.clueSteps).reduce((a, b) => a + b, 0), date).toBeGreaterThanOrEqual(3);
    }
    expect(outside).toBeLessThanOrEqual(2);
    const median = (xs: number[]) => xs.slice().sort((a, b) => a - b)[xs.length >> 1];
    const m = byDay.map(median);
    for (let d = 2; d <= 6; d++) expect(m[d], DAYS[d]).toBeGreaterThan(m[d - 1]);
    expect(m[0]).toBeGreaterThan(m[5]);
    expect(m[0]).toBeLessThan(m[6]);
  });

  it('lays clean clues on every 9x9 Daily', () => {
    const rc = (c: number) => [Math.floor(c / 9), c % 9];
    const touch = (a: number, b: number, orthogonal: boolean) => {
      const [ra, ca] = rc(a), [rb, cb] = rc(b);
      const dr = Math.abs(ra - rb), dc = Math.abs(ca - cb);
      return orthogonal ? dr + dc === 1 : Math.max(dr, dc) === 1;
    };
    for (const p of nineDays) {
      const date = p.id.slice(6);
      const lines: { kind: ClueKind; cells: number[] }[] = [];
      const cages: number[][] = [];
      for (const c of p.clues) {
        if (c.kind === 'arrow') lines.push({ kind: c.kind, cells: [c.circle, ...c.path] });
        else if (c.kind === 'thermo' || c.kind === 'renban' || c.kind === 'whisper') lines.push({ kind: c.kind, cells: c.cells });
        else if (c.kind === 'cage') cages.push(c.cells);
      }
      const steps = new Set<string>();
      for (const { cells } of lines) for (let i = 1; i < cells.length; i++) steps.add([cells[i - 1], cells[i]].sort((a, b) => a - b).join(':'));
      for (const { cells } of lines) {
        let bends = 0;
        for (let i = 1; i < cells.length; i++) {
          expect(touch(cells[i - 1], cells[i], false), date).toBe(true);
          const [r0, c0] = rc(cells[i - 1]), [r1, c1] = rc(cells[i]);
          // A diagonal step never crosses another step.
          if (r0 !== r1 && c0 !== c1) expect(steps.has([r0 * 9 + c1, r1 * 9 + c0].sort((a, b) => a - b).join(':')), date).toBe(false);
          if (i >= 2) {
            const [rp, cp] = rc(cells[i - 2]);
            const turn = (r0 - rp) * (r1 - r0) + (c0 - cp) * (c1 - c0);
            expect(turn, `${date} sharp turn`).toBeGreaterThanOrEqual(0);
            if (r1 - r0 !== r0 - rp || c1 - c0 !== c0 - cp) bends++;
          }
          for (let j = 0; j + 3 <= i; j++) expect(touch(cells[j], cells[i], false), `${date} knot`).toBe(false);
        }
        expect(bends, date).toBeLessThanOrEqual(2);
      }
      for (let a = 0; a < lines.length; a++) {
        for (let b = a + 1; b < lines.length; b++) {
          const same = lines[a].kind === lines[b].kind;
          for (const x of lines[a].cells) for (const y of lines[b].cells) expect(touch(x, y, !same), `${date} lines ${a} ${b}`).toBe(false);
        }
      }
      for (let a = 0; a < cages.length; a++) {
        for (let b = a + 1; b < cages.length; b++) {
          for (const x of cages[a]) for (const y of cages[b]) expect(touch(x, y, true), `${date} cages`).toBe(false);
        }
      }
    }
  });

  it('generates the same 9x9 Dailies on every device as the stored ones', () => {
    for (const date of ['2026-10-24', '2026-10-25', '2027-03-01', '2027-05-04', '2027-08-11', '2027-11-18', '2027-12-31']) {
      const month = stored[`../data/daily/${date.slice(0, 7)}.json`];
      expect(generateDaily(date), date).toEqual(unpackDay(date, month[date]));
    }
  });

  it('can be solved with hints alone on every weekday', () => {
    for (let i = 0; i < 7; i++) {
      const p = nineDays[2 + i];
      const v = p.givens.slice();
      for (let k = 0; k < 81; k++) {
        const h = hint(p, v);
        if (!h) break;
        const mv = h[2].move!;
        expect(mv.digit, p.id).toBe(p.solution[mv.cell]);
        expect(h[1].text, p.id).not.toMatch(/fewest options/);
        v[mv.cell] = mv.digit;
      }
      expect(v, p.id).toEqual(p.solution);
    }
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
