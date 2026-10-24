// Crafted 9x9 boards for the Daily from 2026-10-24 on. The free generator in
// generator.ts is left as it was, so challenge links and earlier Dailies keep
// their boards. Compared with it, this module:
// - draws lines as clean shapes: no knots, no crossings, no turn sharper
//   than a right angle and at most two bends;
// - spreads the clues over the board and keeps them from crowding together;
// - removes givens in a recorded order, clue cells first and then from the
//   fullest boxes, rows and columns, so the givens that stay are spread out;
// - stops at the point where the level is exact and the estimated solving
//   time fits the day, with every rule on the board needed for that solve.
//
// Every 9x9 Daily comes from this module, effort.ts and the short
// contradiction test in logic.ts. A change to any of them changes the
// Dailies, so make it behind a new cut-over date (see NINE_FROM in daily.ts).
import { estimateEffort } from './effort';
import { fillSolution, GLOBAL_KINDS, LOCAL_KINDS, whisperDiff } from './generator';
import { gradeShape, Logic, type Tech } from './logic';
import { buildModel, clueCells, type Model } from './model';
import { makeRng, randInt, shuffle, type Rng } from './rng';
import type { Clue, ClueKind, Difficulty } from './types';

const n = 9;
const N = 81;

export interface CraftSpec {
  difficulty: Difficulty;
  /** The clue kinds on the board, global rules included. */
  kinds: ClueKind[];
  /** Estimated solving time in seconds, low and high end. */
  seconds: [number, number];
}

export interface Crafted {
  givens: number[];
  solution: number[];
  clues: Clue[];
  difficulty: Difficulty;
  score: number;
  /** Estimated solving time in seconds. */
  seconds: number;
  /** 0 when the board meets every target; otherwise how far it is off. */
  miss: number;
}

const row = (c: number) => Math.floor(c / n);
const col = (c: number) => c % n;
const boxOf = (c: number) => Math.floor(row(c) / 3) * 3 + Math.floor(col(c) / 3);
const king = (a: number, b: number) => Math.max(Math.abs(row(a) - row(b)), Math.abs(col(a) - col(b))) <= 1;
const DIRS: [number, number][] = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];

function neighbours(c: number, diag: boolean): number[] {
  const out: number[] = [];
  for (const [dr, dc] of DIRS) {
    if (!diag && dr && dc) continue;
    const r = row(c) + dr, k = col(c) + dc;
    if (r >= 0 && r < n && k >= 0 && k < n) out.push(r * n + k);
  }
  return out;
}

/** Clues per kind, by the number of drawn kinds on the board (one, two or three). */
const COUNT: Record<string, [number, number, number]> = {
  thermo: [5, 3, 3],
  arrow: [5, 3, 2],
  cage: [7, 4, 3],
  renban: [4, 3, 2],
  whisper: [4, 3, 2],
  kropki: [10, 6, 5],
  xv: [9, 6, 5],
};

interface Board {
  sol: number[];
  used: Uint8Array;
  cage: Uint8Array;
  /** Line segments as a * 81 + b with a < b, for the crossing test. */
  segs: Set<number>;
  /** The kind of line on each cell, or an empty string. */
  line: string[];
  load: number[];
  rng: Rng;
}

/** True when a line cell here would sit beside another line: orthogonally next to any line, or touching one of the same kind. */
function besideLine(B: Board, kind: ClueKind, c: number): boolean {
  for (const q of neighbours(c, true)) {
    const k = B.line[q];
    if (k && (k === kind || row(q) === row(c) || col(q) === col(c))) return true;
  }
  return false;
}

const segKey = (a: number, b: number) => (a < b ? a * N + b : b * N + a);

/** True when the diagonal step a-b crosses a drawn segment. */
function crosses(a: number, b: number, segs: Set<number>, own: Set<number>): boolean {
  if (row(a) === row(b) || col(a) === col(b)) return false;
  const k = segKey(row(a) * n + col(b), row(b) * n + col(a));
  return segs.has(k) || own.has(k);
}

/** A random line of len cells that bends gently, touches neither itself nor other lines, and keeps ok() true. */
function drawLine(B: Board, kind: ClueKind, len: number, bends: number, ok: (path: number[], next: number) => boolean): number[] | null {
  const free: number[] = [];
  for (let c = 0; c < N; c++) if (!B.used[c]) free.push(c);
  if (free.length < len) return null;
  for (let t = 0; t < 40; t++) {
    const start = free[Math.floor(B.rng() * free.length)];
    if (besideLine(B, kind, start) || !ok([], start)) continue;
    const path = [start];
    const own = new Set<number>();
    let dir = -1, turns = 0;
    while (path.length < len) {
      const last = path[path.length - 1];
      const opts: number[] = [];
      for (let d = 0; d < 8; d++) {
        if (dir >= 0) {
          // No turn sharper than a right angle, and a limited number of bends.
          if (DIRS[d][0] * DIRS[dir][0] + DIRS[d][1] * DIRS[dir][1] < 0) continue;
          if (d !== dir && turns >= bends) continue;
        }
        const r = row(last) + DIRS[d][0], k = col(last) + DIRS[d][1];
        if (r < 0 || r >= n || k < 0 || k >= n) continue;
        const next = r * n + k;
        if (B.used[next] || path.includes(next) || crosses(last, next, B.segs, own) || besideLine(B, kind, next)) continue;
        // No knots: the line never comes back next to its own earlier cells.
        let knot = false;
        for (let i = 0; i < path.length - 2 && !knot; i++) knot = king(path[i], next);
        if (knot || !ok(path, next)) continue;
        opts.push(d);
      }
      if (!opts.length) break;
      // Straight on is likelier than a bend, so lines read as deliberate shapes.
      const d = dir >= 0 && opts.includes(dir) && B.rng() < 0.6 ? dir : opts[Math.floor(B.rng() * opts.length)];
      const next = (row(last) + DIRS[d][0]) * n + col(last) + DIRS[d][1];
      own.add(segKey(last, next));
      if (dir >= 0 && d !== dir) turns++;
      dir = d;
      path.push(next);
    }
    if (path.length === len) return path;
  }
  return null;
}

/** A compact cage of size cells with distinct digits that shares no edge with another cage. */
function drawCage(B: Board, size: number): number[] | null {
  const s = B.sol;
  const clear = (c: number) => !B.used[c] && !neighbours(c, false).some((q) => B.cage[q]);
  const free: number[] = [];
  for (let c = 0; c < N; c++) if (clear(c)) free.push(c);
  if (!free.length) return null;
  for (let t = 0; t < 40; t++) {
    const cells = [free[Math.floor(B.rng() * free.length)]];
    while (cells.length < size) {
      const opts: number[] = [];
      for (const c of cells) {
        for (const q of neighbours(c, false)) {
          if (!cells.includes(q) && !opts.includes(q) && clear(q) && !cells.some((x) => s[x] === s[q])) opts.push(q);
        }
      }
      if (!opts.length) break;
      cells.push(opts[Math.floor(B.rng() * opts.length)]);
    }
    if (cells.length === size) return cells;
  }
  return null;
}

/** Two orthogonal neighbours for a dot or an X or V. */
function drawPair(B: Board, ok: (a: number, b: number) => boolean): number[] | null {
  for (let t = 0; t < 60; t++) {
    const a = Math.floor(B.rng() * N);
    if (B.used[a]) continue;
    for (const b of shuffle(B.rng, neighbours(a, false))) {
      if (!B.used[b] && ok(B.sol[a], B.sol[b])) return a < b ? [a, b] : [b, a];
    }
  }
  return null;
}

function shapeFor(B: Board, kind: ClueKind): { cells: number[]; clue: Clue } | null {
  const s = (c: number) => B.sol[c];
  const rng = B.rng;
  switch (kind) {
    case 'thermo': {
      const len = randInt(rng, 4, 6);
      const cells = drawLine(B, kind, len, len >= 6 ? 2 : 1, (p, c) => {
        if (!p.length) return s(c) <= n - len + 1;
        return s(c) > s(p[p.length - 1]) && s(c) <= n - (len - 1 - p.length);
      });
      return cells && { cells, clue: { kind, cells } };
    }
    case 'arrow': {
      const len = randInt(rng, 2, 3);
      const cells = drawLine(B, kind, len + 1, 1, (p, c) => {
        if (!p.length) return s(c) >= len + 1;
        const sum = p.slice(1).reduce((a, x) => a + s(x), 0) + s(c);
        const left = len - p.length;
        return sum + left <= s(p[0]) && (left > 0 || sum === s(p[0]));
      });
      return cells && { cells, clue: { kind, circle: cells[0], path: cells.slice(1) } };
    }
    case 'renban': {
      const len = randInt(rng, 3, 5);
      const cells = drawLine(B, kind, len, 1, (p, c) => {
        if (p.some((x) => s(x) === s(c))) return false;
        const ds = [...p.map(s), s(c)];
        return Math.max(...ds) - Math.min(...ds) <= len - 1;
      });
      return cells && { cells, clue: { kind, cells } };
    }
    case 'whisper': {
      const md = whisperDiff(n);
      const len = randInt(rng, 4, 6);
      const cells = drawLine(B, kind, len, len >= 6 ? 2 : 1, (p, c) => !p.length || Math.abs(s(c) - s(p[p.length - 1])) >= md);
      return cells && { cells, clue: { kind, cells, minDiff: md } };
    }
    case 'cage': {
      const cells = drawCage(B, randInt(rng, 2, 4));
      return cells && { cells, clue: { kind, cells, sum: cells.reduce((a, c) => a + s(c), 0) } };
    }
    case 'kropki': {
      const cells = drawPair(B, (x, y) => Math.abs(x - y) === 1 || x === 2 * y || y === 2 * x);
      if (!cells) return null;
      const [a, b] = cells;
      const white = Math.abs(s(a) - s(b)) === 1;
      const black = s(a) === 2 * s(b) || s(b) === 2 * s(a);
      return { cells, clue: { kind, a, b, color: white && black ? (rng() < 0.5 ? 'white' : 'black') : white ? 'white' : 'black' } };
    }
    case 'xv': {
      const cells = drawPair(B, (x, y) => x + y === 5 || x + y === 10);
      if (!cells) return null;
      const [a, b] = cells;
      return { cells, clue: { kind, a, b, sum: s(a) + s(b) === 5 ? 5 : 10 } };
    }
    default:
      return null;
  }
}

/** How crowded a placement would be: clue cells around it and clue cells already in its boxes. */
function crowding(B: Board, cells: number[]): number {
  let score = 0;
  for (const c of cells) {
    for (const q of neighbours(c, true)) {
      if (B.used[q] && !cells.includes(q)) score += row(q) === row(c) || col(q) === col(c) ? 2 : 1;
    }
    score += B.load[boxOf(c)] * 0.35;
  }
  return score / cells.length;
}

function claim(B: Board, kind: ClueKind, cells: number[]) {
  for (const c of cells) {
    B.used[c] = 1;
    B.load[boxOf(c)]++;
    if (kind === 'cage') B.cage[c] = 1;
  }
  if (kind !== 'cage' && kind !== 'kropki' && kind !== 'xv') {
    for (const c of cells) B.line[c] = kind;
    for (let i = 0; i + 1 < cells.length; i++) B.segs.add(segKey(cells[i], cells[i + 1]));
  }
}

/** Lays the drawn clues: lines and cages first, then dots and X/V marks, each in the least crowded of several tries. */
function layout(sol: number[], kinds: ClueKind[], rng: Rng): Clue[] {
  const B: Board = { sol, used: new Uint8Array(N), cage: new Uint8Array(N), segs: new Set(), line: new Array(N).fill(''), load: new Array(n).fill(0), rng };
  const local = LOCAL_KINDS.filter((k) => kinds.includes(k));
  const slot = Math.min(local.length, 3) - 1;
  const queue = (group: ClueKind[]) => {
    const left = group.map((k) => COUNT[k][slot]);
    const out: ClueKind[] = [];
    while (left.some((x) => x > 0)) group.forEach((k, i) => { if (left[i]-- > 0) out.push(k); });
    return out;
  };
  const order = [
    ...queue(local.filter((k) => k !== 'kropki' && k !== 'xv')),
    ...queue(local.filter((k) => k === 'kropki' || k === 'xv')),
  ];
  const clues: Clue[] = [];
  for (const kind of order) {
    let best: { cells: number[]; clue: Clue } | null = null;
    let bestScore = Infinity;
    for (let t = 0; t < 8; t++) {
      const s = shapeFor(B, kind);
      if (!s) continue;
      const score = crowding(B, s.cells);
      if (score < bestScore) { best = s; bestScore = score; }
    }
    if (!best) continue;
    claim(B, kind, best.cells);
    clues.push(best.clue);
  }
  return clues;
}

/**
 * Longest chain a Daily's contradiction test may use, counted in the cells it
 * forces before the contradiction shows. Longer chains feel like guessing.
 */
export const FAIR_DEPTH = 8;

/** Fewest clue steps a gentle board may have, so its rule does real work. */
const GENTLE_CLUE_STEPS = 3;

/** The grader's steps and contradiction budget, with short contradiction tests only. */
function solves(m: Model, givens: ArrayLike<number>, tech: Tech, sol: ArrayLike<number>): boolean {
  const L = new Logic(m, givens);
  L.probeBudget = 12;
  L.probeDepth = FAIR_DEPTH;
  if (!L.run(tech)) return false;
  for (let i = 0; i < N; i++) if (L.values[i] !== sol[i]) return false;
  return true;
}

const TECH: Record<Difficulty, Tech> = { 1: 2, 2: 2, 3: 3, 4: 4, 5: 4 };

/** True when every kind on the board is needed: without its clues the same solver gets stuck. */
function kindsNeeded(clues: Clue[], givens: number[], sol: number[], tech: Tech): boolean {
  const kinds = [...new Set(clues.map((c) => c.kind))];
  if (kinds.length === 0) return true;
  for (const k of kinds) {
    const rest = clues.filter((c) => c.kind !== k);
    const m = buildModel({ size: n, boxW: 3, boxH: 3, clues: rest });
    if (solves(m, givens, tech, sol)) return false;
  }
  return true;
}

/** One candidate board, or null when the solution or the clues could not be made. */
export function craftBoard(seed: string, spec: CraftSpec): Crafted | null {
  const rng = makeRng(`craft9|${seed}|${spec.difficulty}|${[...spec.kinds].sort().join(',')}`);
  const globals = GLOBAL_KINDS.filter((k) => spec.kinds.includes(k)).map((k) => ({ kind: k }) as Clue);
  const sol = fillSolution(9, 3, 3, globals, rng);
  if (!sol) return null;
  const clues = [...globals, ...layout(sol, spec.kinds, rng)];
  const drawnKinds = new Set(clues.map((c) => c.kind));
  if (spec.kinds.some((k) => !drawnKinds.has(k))) return null;
  const shape = { size: 9 as const, boxW: 3, boxH: 3, clues };
  const m = buildModel(shape);
  const tech = TECH[spec.difficulty];
  const [lo, hi] = spec.seconds;
  const mid = (lo + hi) / 2;

  // Removal order: clue cells first, then whichever cell sits in the fullest box, row and column.
  const onClue = new Uint8Array(N);
  for (const c of clues) for (const x of clueCells(c)) onClue[x] = 1;
  const pending = new Set<number>();
  for (let c = 0; c < N; c++) pending.add(c);
  const inBox = new Array(n).fill(9), inRow = new Array(n).fill(9), inCol = new Array(n).fill(9);
  const first = shuffle(rng, [...pending].filter((c) => onClue[c]));
  const nextCell = (): number => {
    if (first.length) return first.shift()!;
    let best = -1, bestScore = -Infinity;
    for (const c of pending) {
      const s = 3 * inBox[boxOf(c)] + inRow[row(c)] + inCol[col(c)] + rng() * 2;
      if (s > bestScore) { bestScore = s; best = c; }
    }
    return best;
  };

  const givens = sol.slice();
  let count = N;
  let reached = spec.difficulty === 1;
  const best: { cut: { givens: number[]; seconds: number; miss: number } | null } = { cut: null };
  const consider = (): boolean => {
    // Returns true when removing more can only make the board slower.
    if (spec.difficulty === 1 && count < 30) return true;
    if (spec.difficulty === 2 && count >= 30) return false;
    if (!reached) {
      reached = spec.difficulty <= 2 || !solves(m, givens, (tech - 1) as Tech, sol);
      if (!reached) return false;
    }
    const e = estimateEffort({ ...shape, givens }, { probeDepth: FAIR_DEPTH });
    const off = e.seconds < lo ? lo - e.seconds : e.seconds > hi ? e.seconds - hi : 0;
    // A rule that does no work weighs more than any miss on time.
    const needed = kindsNeeded(clues, givens, sol, tech);
    const clueSteps = Object.values(e.clueSteps).reduce((a, b) => a + b, 0);
    const short = spec.difficulty === 1 ? Math.max(0, GENTLE_CLUE_STEPS - clueSteps) : 0;
    const miss = off + (needed ? 0 : 3600) + short * 30 + Math.abs(e.seconds - mid) / 1000;
    if (!best.cut || miss < best.cut.miss) best.cut = { givens: givens.slice(), seconds: e.seconds, miss };
    return e.seconds > hi;
  };
  while (pending.size) {
    const c = nextCell();
    pending.delete(c);
    givens[c] = 0;
    if (!solves(m, givens, tech, sol)) {
      givens[c] = sol[c];
      continue;
    }
    count--;
    inBox[boxOf(c)]--;
    inRow[row(c)]--;
    inCol[col(c)]--;
    if (consider()) break;
  }
  const cut = best.cut;
  if (!cut) return null;
  // Below 1 the only miss is the distance from the middle of the band, which is not a miss.
  const g = gradeShape({ ...shape, givens: cut.givens });
  const wrongLevel = g.difficulty !== spec.difficulty;
  const miss = cut.miss < 1 && !wrongLevel ? 0 : cut.miss + (wrongLevel ? 1000 : 0);
  return { givens: cut.givens, solution: sol, clues, difficulty: g.difficulty, score: g.score, seconds: cut.seconds, miss };
}

/** The best of several candidate boards for a seed; stops at the first that meets every target. */
export function craftDaily(seed: string, spec: CraftSpec, tries = 16): Crafted {
  let best: Crafted | null = null;
  for (let k = 0; k < tries; k++) {
    const b = craftBoard(k ? `${seed}#${k}` : seed, spec);
    if (!b) continue;
    if (!best || b.miss < best.miss) best = b;
    if (b.miss === 0) break;
  }
  if (!best) throw new Error(`no board for ${seed}`);
  return best;
}
