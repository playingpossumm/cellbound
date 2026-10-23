// Engine API. This file is a STUB so the app, themes and modes can be built in
// parallel; the engine agent replaces the bodies and keeps every signature.
import { LYRA } from './fixtures';
import type {
  CellIndex,
  Conflict,
  Digit,
  FogSpec,
  GeneratedPuzzle,
  GenerateOptions,
  HintStep,
  Puzzle,
  PuzzleShape,
} from './types';

export * from './types';

/** Deterministic PRNG from a string seed, returning floats in [0, 1). */
export function makeRng(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Generate a puzzle. Synchronous; the UI calls it through the worker client. */
export function generate(opts: GenerateOptions): GeneratedPuzzle {
  const p: GeneratedPuzzle = { ...LYRA, id: `stub-${opts.seed}`, seed: opts.seed };
  if (opts.fog) p.fog = fogFor(p);
  return p;
}

/** Count solutions up to limit. */
export function countSolutions(_p: PuzzleShape, _limit = 2): number {
  return 1;
}

/** The unique solution, or null when there is none. */
export function solve(_p: PuzzleShape): Digit[] | null {
  return LYRA.solution.slice();
}

/** Rule breaks among filled cells. values is the full grid (givens plus entries). */
export function conflicts(p: Puzzle, values: Digit[]): Conflict[] {
  const out: Conflict[] = [];
  const n = p.size;
  const unitOf = (kind: 'row' | 'column' | 'box', k: number): CellIndex[] => {
    const cells: CellIndex[] = [];
    for (let i = 0; i < n * n; i++) {
      const r = Math.floor(i / n), c = i % n;
      const b = Math.floor(r / p.boxH) * (n / p.boxW) + Math.floor(c / p.boxW);
      if ((kind === 'row' && r === k) || (kind === 'column' && c === k) || (kind === 'box' && b === k)) cells.push(i);
    }
    return cells;
  };
  for (const kind of ['row', 'column', 'box'] as const) {
    for (let k = 0; k < n; k++) {
      const seen = new Map<Digit, CellIndex[]>();
      for (const i of unitOf(kind, k)) {
        const d = values[i];
        if (!d) continue;
        seen.set(d, [...(seen.get(d) ?? []), i]);
      }
      for (const cells of seen.values()) if (cells.length > 1) out.push({ cells, rule: kind });
    }
  }
  return out;
}

/** Candidate bitmask per cell (bit d set means d is still possible). */
export function candidates(p: Puzzle, _values: Digit[]): number[] {
  const all = ((1 << (p.size + 1)) - 1) & ~1;
  return p.givens.map(() => all);
}

/** One deduction as three escalating steps, or null when none is found. */
export function hint(_p: Puzzle, _values: Digit[], _notes?: number[]): HintStep[] | null {
  return null;
}

/** Local calendar date as YYYY-MM-DD. */
export function dailyDate(d: Date = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** The shared puzzle for a date. Async because the real engine lazy-loads precomputed months. */
export async function dailyPuzzle(date: string): Promise<Puzzle> {
  return { ...LYRA, id: `daily-${date}`, seed: `daily:${date}` };
}

export function dailyRunSeed(date: string): string {
  return `run:${date}`;
}

/** Fog layout for a puzzle. */
export function fogFor(p: Puzzle): FogSpec {
  const n = p.size;
  const start: CellIndex[] = [];
  for (let i = 0; i < n * n; i++) {
    const r = Math.floor(i / n), c = i % n;
    if (r < n / 2 || c < n / 2) start.push(i);
  }
  return { start, radius: 1 };
}
