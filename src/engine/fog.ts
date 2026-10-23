// Fog layouts. A start area of about a third of the board is grown around
// the givens until a logical solver that sees only cleared cells (and clues
// lying fully inside them) can finish, clearing radius 1 around each
// correct placement. Hidden givens and clues are simply unknown to it, so
// every deduction it makes is also valid for the full puzzle.
import { gentleFloor, gradeShape, Logic, type Grade, type Tech } from './logic';
import { buildModel, clueCells } from './model';
import { makeRng, shuffle } from './rng';
import type { CellIndex, FogSpec, Puzzle } from './types';

function around(n: number, c: CellIndex): CellIndex[] {
  const r = Math.floor(c / n), col = c % n;
  const out: CellIndex[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const rr = r + dr, cc = col + dc;
      if (rr >= 0 && rr < n && cc >= 0 && cc < n) out.push(rr * n + cc);
    }
  }
  return out;
}

export type FogPuzzle = Pick<Puzzle, 'size' | 'boxW' | 'boxH' | 'regions' | 'givens' | 'solution' | 'clues'>;

export interface FogRun {
  solved: boolean;
  /** Cells cleared when the solver finished or got stuck. */
  cleared: Uint8Array;
  /** Digits known at that point. */
  values: number[];
  /** Hardest technique the run needed, and its total step cost. */
  maxUsed: number;
  score: number;
}

/** True when the fog solver can finish from these start cells. */
export function fogSolvable(p: FogPuzzle, start: CellIndex[], maxTech: Tech = 3): boolean {
  return fogRun(p, start, maxTech).solved;
}

/** Runs the fog solver; returns whether it finished and which cells it cleared. */
export function fogRun(p: FogPuzzle, start: CellIndex[], maxTech: Tech = 3): FogRun {
  const n = p.size;
  const N = n * n;
  const cleared = new Uint8Array(N);
  for (const c of start) cleared[c] = 1;
  const visible = () => p.clues.filter((cl) => clueCells(cl).every((c) => cleared[c]));
  let shown = visible();
  const make = (values: ArrayLike<number>) => {
    const L = new Logic(buildModel({ ...p, clues: shown, negativeKropki: false }), values);
    L.canPlace = (c) => cleared[c] === 1;
    L.probeBudget = n === 9 ? 10 : 30;
    return L;
  };
  let L = make(p.givens.map((d, i) => (cleared[i] ? d : 0)));
  let pastScore = 0, pastMax = 0;
  const done = (solved: boolean): FogRun => ({
    solved, cleared, values: L.values.slice(), maxUsed: Math.max(pastMax, L.maxUsed), score: pastScore + L.score,
  });
  for (let step = 0; step < N * 12; step++) {
    if (L.broken) return done(false);
    if (L.values.every((v) => v)) return done(L.values.every((v, i) => v === p.solution[i]));
    const s = L.next(maxTech);
    if (!s) return done(false);
    if (!s.place) continue;
    const { cell, digit } = s.place;
    if (digit !== p.solution[cell]) return done(false);
    for (const q of around(n, cell)) {
      if (cleared[q]) continue;
      cleared[q] = 1;
      if (p.givens[q] && !L.values[q]) L.placeRaw(q, p.givens[q]);
    }
    const now = visible();
    if (now.length !== shown.length) {
      shown = now;
      pastScore += L.score;
      pastMax = Math.max(pastMax, L.maxUsed);
      L = make(L.values);
    }
  }
  return done(false);
}

/** Grades a fog board as it plays: by the hardest technique the fog solver needs from these start cells. */
export function gradeFog(p: FogPuzzle, start: CellIndex[]): Grade {
  const givens = p.givens.filter((d) => d > 0).length;
  const r3 = fogRun(p, start, 3);
  if (r3.solved) {
    const difficulty = r3.maxUsed >= 3 ? 3 : givens >= gentleFloor(p.size) ? 1 : 2;
    return { difficulty, score: Math.round(r3.score), solved: true, maxUsed: r3.maxUsed };
  }
  const r4 = fogRun(p, start, 4);
  return { difficulty: r4.solved ? 4 : 5, score: Math.round(r4.score + (r4.solved ? 0 : 200)), solved: r4.solved, maxUsed: r4.solved ? 4 : 5 };
}

interface Area {
  area: CellIndex[];
  inArea: Uint8Array;
  rank: number[];
  givenNear: (c: CellIndex) => number;
  add: (c: CellIndex) => void;
  grow: (count: number) => void;
}

/** A compact area of about a third of the board, centred where givens cluster. */
function startArea(p: FogPuzzle, seed: string): Area {
  const n = p.size;
  const N = n * n;
  const rng = makeRng(`fog|${seed}`);
  const order = shuffle(rng, Array.from({ length: N }, (_, i) => i));
  const rank = new Array<number>(N);
  order.forEach((c, i) => (rank[c] = i));
  const givenNear = (c: CellIndex) => around(n, c).filter((q) => p.givens[q]).length;
  let center = order[0];
  for (const c of order) if (givenNear(c) > givenNear(center)) center = c;
  const inArea = new Uint8Array(N);
  const area: CellIndex[] = [];
  const add = (c: CellIndex) => { inArea[c] = 1; area.push(c); };
  add(center);
  const grow = (count: number) => {
    for (let k = 0; k < count && area.length < N; k++) {
      let best = -1, bestScore = -Infinity;
      for (let c = 0; c < N; c++) {
        if (inArea[c]) continue;
        const touching = around(n, c).filter((q) => inArea[q]).length;
        if (!touching) continue;
        const score = touching + (p.givens[c] ? 3 : 0) + givenNear(c) * 0.5 - rank[c] / (N * 10);
        if (score > bestScore) { bestScore = score; best = c; }
      }
      if (best < 0) best = order.find((c) => !inArea[c])!;
      add(best);
    }
  };
  grow(Math.round(N / 3) - 1);
  return { area, inArea, rank, givenNear, add, grow };
}

/** Start cells of about a third of the board, for the generator. */
export function fogStartArea(p: FogPuzzle, seed: string): CellIndex[] {
  return startArea(p, seed).area.slice().sort((a, b) => a - b);
}

/** Picks the start cells for a fog board. */
export function fogLayout(p: Puzzle): FogSpec {
  const n = p.size;
  const N = n * n;
  const { area, inArea, rank, givenNear, add, grow } = startArea(p, `${p.id}|${p.seed}`);
  const tech: Tech = gradeShape(p).difficulty >= 4 ? 4 : 3;
  const stepSize = Math.max(1, Math.round(n / 3));
  for (let guard = 0; guard < N && area.length < N; guard++) {
    const run = fogRun(p, area, tech);
    if (run.solved) break;
    // Reveal more just outside what the solver managed to clear, preferring
    // cells that complete a clue, then givens, then cells next to givens.
    const cl = run.cleared;
    const scored: [number, CellIndex][] = [];
    for (let c = 0; c < N; c++) {
      if (cl[c] || inArea[c]) continue;
      const touching = around(n, c).some((q) => cl[q]);
      if (!touching) continue;
      let score = (p.givens[c] ? 4 : 0) + givenNear(c) * 0.5 - rank[c] / (N * 10);
      for (const clue of p.clues) {
        const cells = clueCells(clue);
        if (cells.includes(c) && cells.every((q) => q === c || cl[q])) score += 6;
      }
      scored.push([score, c]);
    }
    if (!scored.length) { grow(stepSize); continue; }
    scored.sort((x, y) => y[0] - x[0]);
    for (const [, c] of scored.slice(0, stepSize)) add(c);
  }
  return { start: area.slice().sort((a, b) => a - b), radius: 1 };
}
