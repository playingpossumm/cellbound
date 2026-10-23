// Daily puzzles: a fixed weekday schedule, precomputed month files in
// src/data/daily, and the same generator as a fallback for missing months.
import { CONSTELLATIONS } from './constellations';
import { ALL_KINDS, boxDims, generatePuzzle } from './generator';
import type { Clue, ClueKind, Difficulty, Puzzle, Size } from './types';

export interface DailySpec {
  size: Size;
  difficulty: Difficulty;
  minKinds: number;
  maxKinds: number;
  rules: ClueKind[];
}

const DIFF_BY_DAY: Difficulty[] = [3, 1, 2, 2, 3, 3, 4];

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

/** The schedule: Mon to Sat 6x6, Sunday 9x9; difficulty by weekday. */
export function dailySpec(date: string): DailySpec {
  const wd = weekday(date);
  return {
    size: wd === 0 ? 9 : 6,
    difficulty: DIFF_BY_DAY[wd],
    minKinds: wd === 1 ? 1 : 2,
    maxKinds: wd === 1 ? 2 : 3,
    rules: ALL_KINDS.slice(),
  };
}

export function dailyName(date: string): string {
  const k = ((dayNumber(date) * 37) % 88 + 88) % 88;
  return CONSTELLATIONS[k];
}

/** Generates the daily for a date from scratch. Deterministic. */
export function generateDaily(date: string): Puzzle {
  const spec = dailySpec(date);
  let best: Puzzle | null = null;
  for (let k = 0; k < 6; k++) {
    const p = generatePuzzle({
      size: spec.size,
      seed: k ? `daily:${date}#${k}` : `daily:${date}`,
      rules: spec.rules,
      difficulty: spec.difficulty,
      minKinds: spec.minKinds,
      maxKinds: spec.maxKinds,
    });
    if (!best || Math.abs(p.difficulty - spec.difficulty) < Math.abs(best.difficulty - spec.difficulty)) best = p;
    if (p.difficulty === spec.difficulty) break;
  }
  return { ...best!, id: `daily-${date}`, seed: `daily:${date}`, name: dailyName(date) };
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
  return day ? unpackDay(date, day) : generateDaily(date);
}
