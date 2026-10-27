// Pure board helpers shared by the store and the board. No React, no state.
import type { CellIndex, Clue, ClueKind, Digit, Puzzle } from '../engine/types';

export function rowOf(n: number, i: CellIndex): number {
  return Math.floor(i / n);
}

export function colOf(n: number, i: CellIndex): number {
  return i % n;
}

/** Region id of a cell: the irregular region when present, otherwise the box. */
export function regionOf(p: Pick<Puzzle, 'size' | 'boxW' | 'boxH' | 'regions'>, i: CellIndex): number {
  if (p.regions && p.regions.length === p.size * p.size) return p.regions[i];
  const n = p.size;
  const r = Math.floor(i / n);
  const c = i % n;
  return Math.floor(r / p.boxH) * (n / p.boxW) + Math.floor(c / p.boxW);
}

export function rowCells(n: number, r: number): CellIndex[] {
  return Array.from({ length: n }, (_, c) => r * n + c);
}

export function colCells(n: number, c: number): CellIndex[] {
  return Array.from({ length: n }, (_, r) => r * n + c);
}

export function regionCells(p: Pick<Puzzle, 'size' | 'boxW' | 'boxH' | 'regions'>, b: number): CellIndex[] {
  const out: CellIndex[] = [];
  for (let i = 0; i < p.size * p.size; i++) if (regionOf(p, i) === b) out.push(i);
  return out;
}

/** Givens plus player entries. */
export function fullGrid(p: Puzzle, values: Digit[]): Digit[] {
  return p.givens.map((d, i) => d || values[i] || 0);
}

export function isSolvedGrid(p: Puzzle, grid: Digit[]): boolean {
  return grid.every((v, i) => v === p.solution[i]);
}

export type UnitKind = 'row' | 'column' | 'box';

export interface UnitHit {
  kind: UnitKind;
  index: number;
  cells: CellIndex[];
}

/** Units through cell i whose every cell now matches the solution. */
export function completedUnits(p: Puzzle, grid: Digit[], i: CellIndex): UnitHit[] {
  const n = p.size;
  const units: UnitHit[] = [
    { kind: 'row', index: rowOf(n, i), cells: rowCells(n, rowOf(n, i)) },
    { kind: 'column', index: colOf(n, i), cells: colCells(n, colOf(n, i)) },
    { kind: 'box', index: regionOf(p, i), cells: regionCells(p, regionOf(p, i)) },
  ];
  return units.filter((u) => u.cells.every((j) => grid[j] === p.solution[j]));
}

export interface ClueHit {
  /** Index into puzzle.clues. */
  index: number;
  kind: ClueKind;
  cells: CellIndex[];
}

/** The cells of a clue, as lists: a line or a cage is one, the diagonal rule is its two diagonals, anti-knight none. */
export function clueParts(clue: Clue, n: number): CellIndex[][] {
  switch (clue.kind) {
    case 'thermo':
    case 'cage':
    case 'renban':
    case 'whisper':
      return [clue.cells];
    case 'arrow':
      return [[clue.circle, ...clue.path]];
    case 'kropki':
    case 'xv':
      return [[clue.a, clue.b]];
    case 'diagonal':
      return [
        Array.from({ length: n }, (_, r) => r * n + r),
        Array.from({ length: n }, (_, r) => r * n + (n - 1 - r)),
      ];
    default:
      return [];
  }
}

/** Clues through cell i whose every cell now matches the solution. Each finished diagonal counts once. */
export function completedClues(p: Puzzle, grid: Digit[], i: CellIndex): ClueHit[] {
  const out: ClueHit[] = [];
  p.clues.forEach((clue, index) => {
    for (const cells of clueParts(clue, p.size)) {
      if (cells.includes(i) && cells.every((j) => grid[j] === p.solution[j])) out.push({ index, kind: clue.kind, cells });
    }
  });
  return out;
}

/** Regions whose every cell matches the solution, keeping the order of `previous` first. */
export function doneRegions(p: Puzzle, grid: Digit[], previous: number[]): number[] {
  const n = p.size;
  const count = p.regions ? Math.max(...p.regions) + 1 : n;
  const done = new Set<number>();
  for (let b = 0; b < count; b++) {
    const cells = regionCells(p, b);
    if (cells.length && cells.every((j) => grid[j] === p.solution[j])) done.add(b);
  }
  const out = previous.filter((b) => done.has(b));
  for (const b of done) if (!out.includes(b)) out.push(b);
  return out;
}

/** Chebyshev distance between two cells. */
export function cellDistance(n: number, a: CellIndex, b: CellIndex): number {
  return Math.max(Math.abs(rowOf(n, a) - rowOf(n, b)), Math.abs(colOf(n, a) - colOf(n, b)));
}

/** Clears every cell within `radius` of cell i. Returns a new array. */
export function clearAround(cleared: boolean[], n: number, i: CellIndex, radius = 1): boolean[] {
  const out = cleared.slice();
  for (let j = 0; j < n * n; j++) if (cellDistance(n, i, j) <= radius) out[j] = true;
  return out;
}

/** Small string hash (FNV-1a), stable across devices. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let k = 0; k < s.length; k++) {
    h ^= s.charCodeAt(k);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function bitCount(mask: number): number {
  let c = 0;
  let m = mask;
  while (m) {
    m &= m - 1;
    c++;
  }
  return c;
}

/** Formats milliseconds as m:ss, or h:mm:ss past an hour. */
export function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** "2026-10-23" to "Friday 23 October". */
export function formatDateLong(date: string): string {
  const d = parseLocalDate(date);
  if (!d) return date;
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function parseLocalDate(date: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (d.getMonth() !== Number(m[2]) - 1) return null;
  return d;
}

/** Local date string for a Date, YYYY-MM-DD. */
export function localDate(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The local date one day before or after. */
export function shiftDate(date: string, days: number): string {
  const d = parseLocalDate(date);
  if (!d) return date;
  d.setDate(d.getDate() + days);
  return localDate(d);
}
