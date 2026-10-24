// Daily puzzles: a fixed weekday schedule and precomputed month files in
// src/data/daily. Months that are not stored are made on the device by
// dailygen.ts, which loads on demand.
//
// Until 2026-10-23 the Daily was 6x6 from Monday to Saturday and 9x9 on
// Sunday; those dates keep that schedule and generator, so their boards
// never change. From 2026-10-24 every Daily is a crafted 9x9 (craft.ts).
import { CONSTELLATIONS } from './constellations';
import { ALL_KINDS, boxDims, LOCAL_KINDS } from './generator';
import { makeRng, shuffle } from './rng';
import type { Clue, ClueKind, Difficulty, Puzzle, Size } from './types';

export interface DailySpec {
  size: Size;
  difficulty: Difficulty;
  minKinds: number;
  maxKinds: number;
  rules: ClueKind[];
  /** 9x9 Dailies: the estimated solving time the board is cut to, in minutes for an experienced player. */
  minutes?: [number, number];
}

/** The first date with a 9x9 Daily every day. */
export const NINE_FROM = '2026-10-24';

const DIFF_BY_DAY: Difficulty[] = [3, 1, 2, 2, 3, 3, 4];

/**
 * The 9x9 week, Sunday first. Monday is gentle with one rule; Tuesday to
 * Friday climb through easy and medium with two rules; Saturday is the
 * hardest level with two rules; Sunday is a longer medium board with three.
 */
const NINE_BY_DAY: { difficulty: Difficulty; kinds: number; minutes: [number, number] }[] = [
  { difficulty: 3, kinds: 3, minutes: [19, 25] },
  { difficulty: 1, kinds: 1, minutes: [5, 8] },
  { difficulty: 2, kinds: 2, minutes: [8, 11] },
  { difficulty: 2, kinds: 2, minutes: [11, 14] },
  { difficulty: 3, kinds: 2, minutes: [14, 17] },
  { difficulty: 3, kinds: 2, minutes: [17, 20] },
  { difficulty: 4, kinds: 2, minutes: [21, 29] },
];

function parseDate(date: string): { y: number; m: number; d: number } {
  const [y, m, d] = date.split('-').map(Number);
  return { y, m, d };
}

/** Days since 1970-01-01 for a YYYY-MM-DD date, ignoring time zones. */
export function dayNumber(date: string): number {
  const { y, m, d } = parseDate(date);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}

/** 0 is Sunday, 6 is Saturday. */
export function weekday(date: string): number {
  const { y, m, d } = parseDate(date);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** True for dates from NINE_FROM on. */
export function isNineDaily(date: string): boolean {
  return dayNumber(date) >= dayNumber(NINE_FROM);
}

/** The schedule before NINE_FROM: Mon to Sat 6x6, Sunday 9x9; difficulty by weekday. */
export function legacySpec(date: string): DailySpec {
  const wd = weekday(date);
  return {
    size: wd === 0 ? 9 : 6,
    difficulty: DIFF_BY_DAY[wd],
    minKinds: wd === 1 ? 1 : 2,
    maxKinds: wd === 1 ? 2 : 3,
    rules: ALL_KINDS.slice(),
  };
}

/** Rule slots per day of a 9x9 week, Monday first. */
const SLOTS = [1, 2, 2, 2, 2, 2, 3];
const weeks = new Map<number, ClueKind[][]>();

/**
 * The rules for each day of the week that starts on the Monday with this day
 * number, Monday first. Every one of the nine rules appears at least once a
 * week, the two global rules go to different days after Monday, every day
 * has a drawn rule, and a drawn rule never runs on two days in a row.
 */
export function weekRules(monday: number): ClueKind[][] {
  const hit = weeks.get(monday);
  if (hit) return hit;
  const rng = makeRng(`daily9-week|${monday}`);
  let plan: ClueKind[][] | null = null;
  for (let attempt = 0; attempt < 1000 && !plan; attempt++) {
    const days: ClueKind[][] = SLOTS.map(() => []);
    const [a, b] = shuffle(rng, [1, 2, 3, 4, 5, 6]);
    days[a].push('diagonal');
    days[b].push('antiKnight');
    const fits = (d: number, k: ClueKind) =>
      days[d].length < SLOTS[d] && !days[d].includes(k) && !(d > 0 && days[d - 1].includes(k)) && !(d < 6 && days[d + 1].includes(k));
    let ok = true;
    for (const k of shuffle(rng, LOCAL_KINDS.slice())) {
      const room = [0, 1, 2, 3, 4, 5, 6].filter((d) => fits(d, k));
      if (!room.length) { ok = false; break; }
      days[room[Math.floor(rng() * room.length)]].push(k);
    }
    for (let d = 0; ok && d < 7; d++) {
      while (days[d].length < SLOTS[d]) {
        const opts = LOCAL_KINDS.filter((k) => fits(d, k));
        if (!opts.length) { ok = false; break; }
        days[d].push(opts[Math.floor(rng() * opts.length)]);
      }
    }
    if (ok) plan = days.map((ks) => ALL_KINDS.filter((k) => ks.includes(k)));
  }
  if (!plan) throw new Error(`no rule plan for week ${monday}`);
  weeks.set(monday, plan);
  return plan;
}

/** The schedule: before NINE_FROM as it was, from then on a 9x9 every day with its level, rules and target time. */
export function dailySpec(date: string): DailySpec {
  if (!isNineDaily(date)) return legacySpec(date);
  const wd = weekday(date);
  const plan = NINE_BY_DAY[wd];
  const monday = dayNumber(date) - ((wd + 6) % 7);
  const rules = weekRules(monday)[(wd + 6) % 7].slice();
  return {
    size: 9,
    difficulty: plan.difficulty,
    minKinds: plan.kinds,
    maxKinds: plan.kinds,
    rules,
    minutes: [plan.minutes[0], plan.minutes[1]],
  };
}

export function dailyName(date: string): string {
  const k = ((dayNumber(date) * 37) % 88 + 88) % 88;
  return CONSTELLATIONS[k];
}

// Compact month files: digits as strings, clues as short arrays.
export type PackedClue = (string | number | number[] | null)[];
export interface PackedDay {
  /** Givens, one character per cell. */
  g: string;
  /** Solution. */
  s: string;
  c: PackedClue[];
  d: Difficulty;
  sc: number;
}
export type MonthFile = Record<string, PackedDay>;

export function packClue(c: Clue): PackedClue {
  switch (c.kind) {
    case 'thermo': return ['t', c.cells];
    case 'arrow': return ['a', c.circle, c.path];
    case 'cage': return ['c', c.cells, c.sum];
    case 'renban': return ['r', c.cells];
    case 'whisper': return ['w', c.cells, c.minDiff];
    case 'kropki': return ['k', c.a, c.b, c.color === 'white' ? 'w' : 'b'];
    case 'xv': return ['x', c.a, c.b, c.sum];
    case 'diagonal': return ['d'];
    case 'antiKnight': return ['n'];
  }
}

export function unpackClue(p: PackedClue): Clue {
  const [k, a, b, c] = p as [string, unknown, unknown, unknown];
  switch (k) {
    case 't': return { kind: 'thermo', cells: a as number[] };
    case 'a': return { kind: 'arrow', circle: a as number, path: b as number[] };
    case 'c': return { kind: 'cage', cells: a as number[], sum: b as number | null };
    case 'r': return { kind: 'renban', cells: a as number[] };
    case 'w': return { kind: 'whisper', cells: a as number[], minDiff: b as number };
    case 'k': return { kind: 'kropki', a: a as number, b: b as number, color: c === 'w' ? 'white' : 'black' };
    case 'x': return { kind: 'xv', a: a as number, b: b as number, sum: c === 5 ? 5 : 10 };
    case 'd': return { kind: 'diagonal' };
    default: return { kind: 'antiKnight' };
  }
}

export function packDay(p: Puzzle): PackedDay {
  return { g: p.givens.join(''), s: p.solution.join(''), c: p.clues.map(packClue), d: p.difficulty, sc: p.score };
}

export function unpackDay(date: string, x: PackedDay): Puzzle {
  const givens = [...x.g].map(Number);
  const size = Math.round(Math.sqrt(givens.length)) as Size;
  return {
    id: `daily-${date}`,
    seed: `daily:${date}`,
    size,
    ...boxDims(size),
    givens,
    solution: [...x.s].map(Number),
    clues: x.c.map(unpackClue),
    difficulty: x.d,
    score: x.sc,
    name: dailyName(date),
  };
}

type Loader = () => Promise<unknown>;
let loaders: Record<string, Loader> | null = null;
const months = new Map<string, Promise<MonthFile | null>>();

function monthLoaders(): Record<string, Loader> {
  if (loaders) return loaders;
  try {
    loaders = import.meta.glob('../data/daily/*.json', { import: 'default' }) as Record<string, Loader>;
  } catch {
    loaders = {};
  }
  return loaders ?? {};
}

function loadMonth(ym: string): Promise<MonthFile | null> {
  let hit = months.get(ym);
  if (!hit) {
    const load = monthLoaders()[`../data/daily/${ym}.json`];
    hit = load ? load().then((x) => x as MonthFile).catch(() => null) : Promise.resolve(null);
    months.set(ym, hit);
  }
  return hit;
}

export async function dailyPuzzleFor(date: string): Promise<Puzzle> {
  const month = await loadMonth(date.slice(0, 7));
  const day = month?.[date];
  if (day) return unpackDay(date, day);
  // A month that is not stored is made here from the same seed, so it still matches every other device.
  const { generateDaily } = await import('./dailygen');
  return generateDaily(date);
}
