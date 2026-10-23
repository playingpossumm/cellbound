// Puzzle generator. Steps: pick clue kinds, fill a random solution that obeys
// the global rules, lay clues that agree with it, then remove givens while
// the puzzle stays unique (and, for difficulty 1 to 3, solvable by logic).
import { CONSTELLATIONS } from './constellations';
import { fogRun, fogStartArea, gradeFog } from './fog';
import { buildModel, clueCells } from './model';
import { gentleFloor, gentleStart, gradeShape, logicSolves } from './logic';
import { hashString, makeRng, randInt, shuffle, type Rng } from './rng';
import { search } from './solver';
import type { Clue, ClueKind, Difficulty, FogSpec, GeneratedPuzzle, GenerateOptions, Size } from './types';

export const LOCAL_KINDS: ClueKind[] = ['thermo', 'arrow', 'cage', 'renban', 'whisper', 'kropki', 'xv'];
export const GLOBAL_KINDS: ClueKind[] = ['diagonal', 'antiKnight'];
export const ALL_KINDS: ClueKind[] = [...LOCAL_KINDS, ...GLOBAL_KINDS];

export function boxDims(size: Size): { boxW: number; boxH: number } {
  return size === 4 ? { boxW: 2, boxH: 2 } : size === 6 ? { boxW: 3, boxH: 2 } : { boxW: 3, boxH: 3 };
}

export function whisperDiff(size: number): number {
  return size === 9 ? 5 : size === 6 ? 3 : 2;
}

function chooseKinds(rng: Rng, opts: GenerateOptions): ClueKind[] {
  const pool = [...new Set(opts.rules)].filter((k) => ALL_KINDS.includes(k));
  if (!pool.length) return [];
  const lo = Math.max(1, Math.min(opts.minKinds ?? 2, pool.length));
  const hi = Math.max(lo, Math.min(opts.maxKinds ?? 3, pool.length));
  const want = randInt(rng, lo, hi);
  const out: ClueKind[] = [];
  for (const k of shuffle(rng, pool.slice())) {
    if (out.length >= want) break;
    // No 4x4 or 6x6 grid obeys both global rules at once.
    if (opts.size < 9 && GLOBAL_KINDS.includes(k) && out.some((x) => GLOBAL_KINDS.includes(x))) continue;
    out.push(k);
  }
  // Global rules draw nothing, so keep at least one drawn clue when the rules allow it.
  const local = pool.filter((k) => LOCAL_KINDS.includes(k));
  if (local.length && !out.some((k) => LOCAL_KINDS.includes(k))) out[out.length - 1] = local[Math.floor(rng() * local.length)];
  return out;
}

const COUNTS: Record<number, Record<string, [number, number]>> = {
  4: { thermo: [1, 2], arrow: [1, 1], cage: [2, 2], renban: [1, 1], whisper: [1, 2], kropki: [2, 3], xv: [2, 3] },
  6: { thermo: [2, 3], arrow: [2, 2], cage: [2, 3], renban: [2, 2], whisper: [2, 2], kropki: [3, 4], xv: [3, 4] },
  9: { thermo: [3, 4], arrow: [2, 3], cage: [4, 6], renban: [2, 3], whisper: [2, 3], kropki: [5, 7], xv: [4, 6] },
};

function around(n: number, c: number, diag: boolean): number[] {
  const r = Math.floor(c / n), col = c % n;
  const out: number[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      if (!diag && dr && dc) continue;
      const rr = r + dr, cc = col + dc;
      if (rr >= 0 && rr < n && cc >= 0 && cc < n) out.push(rr * n + cc);
    }
  }
  return out;
}

/** True when the segment a-b is diagonal and crosses an existing diagonal segment. */
function crosses(n: number, a: number, b: number, segs: Set<string>): boolean {
  const ra = Math.floor(a / n), ca = a % n, rb = Math.floor(b / n), cb = b % n;
  if (ra === rb || ca === cb) return false;
  const x = ra * n + cb, y = rb * n + ca;
  return segs.has(`${Math.min(x, y)}:${Math.max(x, y)}`);
}

interface Layout {
  n: number;
  sol: number[];
  used: Uint8Array;
  segs: Set<string>;
  rng: Rng;
}

/** Random walk of length len over free cells where accept(path, next) holds. */
function walk(L: Layout, len: number, diag: boolean, accept: (path: number[], next: number) => boolean, tries = 120): number[] | null {
  const { n, used, rng } = L;
  const free: number[] = [];
  for (let c = 0; c < n * n; c++) if (!used[c]) free.push(c);
  if (free.length < len) return null;
  for (let t = 0; t < tries; t++) {
    const path = [free[Math.floor(rng() * free.length)]];
    if (!accept([], path[0])) continue;
    while (path.length < len) {
      const last = path[path.length - 1];
      const opts = around(n, last, diag).filter((c) => !used[c] && !path.includes(c) && !crosses(n, last, c, L.segs) && accept(path, c));
      if (!opts.length) break;
      path.push(opts[Math.floor(rng() * opts.length)]);
    }
    if (path.length === len) return path;
  }
  return null;
}

function claim(L: Layout, cells: number[], line: boolean) {
  for (const c of cells) L.used[c] = 1;
  if (line) {
    for (let i = 0; i + 1 < cells.length; i++) {
      const a = cells[i], b = cells[i + 1];
      L.segs.add(`${Math.min(a, b)}:${Math.max(a, b)}`);
    }
  }
}

function placeOne(L: Layout, kind: ClueKind, hiddenTotals: boolean): Clue | null {
  const { n, sol, rng } = L;
  const s = (c: number) => sol[c];
  switch (kind) {
    case 'thermo': {
      const len = randInt(rng, 3, Math.min(5, n));
      const path = walk(L, len, true, (p, c) => {
        if (!p.length) return s(c) <= n - len + 1;
        const k = p.length;
        return s(c) > s(p[k - 1]) && s(c) <= n - (len - 1 - k);
      });
      if (!path) return null;
      claim(L, path, true);
      return { kind: 'thermo', cells: path };
    }
    case 'arrow': {
      // Paths of 2 or 3 cells beyond the circle; fall back to 2 when 3 will not fit.
      const first = n === 4 ? 2 : randInt(rng, 2, 3);
      for (const len of first === 3 ? [3, 2] : [2]) {
        for (let t = 0; t < 30; t++) {
          const path = walk(L, len + 1, true, (p, c) => {
            if (!p.length) return s(c) >= len;
            const sum = p.slice(1).reduce((a, x) => a + s(x), 0) + s(c);
            const left = len - p.length;
            return sum + left <= s(p[0]) && (left > 0 || sum === s(p[0]));
          }, 40);
          if (!path) continue;
          claim(L, path, true);
          return { kind: 'arrow', circle: path[0], path: path.slice(1) };
        }
      }
      return null;
    }
    case 'cage': {
      const size = randInt(rng, 2, n === 4 ? 3 : 4);
      const cells = walk(L, size, false, (p, c) => !p.some((x) => s(x) === s(c)));
      if (!cells) return null;
      claim(L, cells, false);
      const sum = cells.reduce((a, c) => a + s(c), 0);
      return { kind: 'cage', cells, sum: hiddenTotals ? null : sum };
    }
    case 'renban': {
      const len = n === 4 ? 3 : randInt(rng, 3, 4);
      const path = walk(L, len, true, (p, c) => {
        if (p.some((x) => s(x) === s(c))) return false;
        const ds = [...p.map(s), s(c)];
        return Math.max(...ds) - Math.min(...ds) <= len - 1;
      });
      if (!path) return null;
      claim(L, path, true);
      return { kind: 'renban', cells: path };
    }
    case 'whisper': {
      const md = whisperDiff(n);
      const len = n === 4 ? 3 : randInt(rng, 3, 5);
      const path = walk(L, len, true, (p, c) => !p.length || Math.abs(s(c) - s(p[p.length - 1])) >= md);
      if (!path) return null;
      claim(L, path, true);
      return { kind: 'whisper', cells: path, minDiff: md };
    }
    case 'kropki': {
      const pair = walk(L, 2, false, (p, c) => !p.length || Math.abs(s(c) - s(p[0])) === 1 || s(c) === 2 * s(p[0]) || s(p[0]) === 2 * s(c));
      if (!pair) return null;
      const [a, b] = pair[0] < pair[1] ? pair : [pair[1], pair[0]];
      const white = Math.abs(s(a) - s(b)) === 1;
      const black = s(a) === 2 * s(b) || s(b) === 2 * s(a);
      const color = white && black ? (rng() < 0.5 ? 'white' : 'black') : white ? 'white' : 'black';
      claim(L, [a, b], false);
      return { kind: 'kropki', a, b, color };
    }
    case 'xv': {
      const pair = walk(L, 2, false, (p, c) => !p.length || s(c) + s(p[0]) === 5 || s(c) + s(p[0]) === 10);
      if (!pair) return null;
      const [a, b] = pair[0] < pair[1] ? pair : [pair[1], pair[0]];
      claim(L, [a, b], false);
      return { kind: 'xv', a, b, sum: s(a) + s(b) === 5 ? 5 : 10 };
    }
    default:
      return null;
  }
}

function layClues(n: number, sol: number[], kinds: ClueKind[], rng: Rng, hiddenTotals: boolean): Clue[] {
  const L: Layout = { n, sol, used: new Uint8Array(n * n), segs: new Set(), rng };
  const local = LOCAL_KINDS.filter((k) => kinds.includes(k));
  const clues: Clue[] = [];
  for (const kind of local) {
    const [lo, hi] = COUNTS[n][kind];
    // Fewer kinds on the board means more of each, so the grid never looks empty.
    const want = local.length >= 3 ? lo : local.length === 2 ? randInt(rng, lo, hi) : hi;
    for (let i = 0; i < want; i++) {
      const c = placeOne(L, kind, hiddenTotals);
      if (c) clues.push(c);
    }
  }
  return clues;
}

function fillSolution(n: Size, boxW: number, boxH: number, globals: Clue[], rng: Rng): number[] | null {
  const m = buildModel({ size: n, boxW, boxH, clues: globals });
  for (let t = 0; t < 4; t++) {
    const r = search(m, new Array(n * n).fill(0), 1, rng, globals.length > 1 ? 60000 : 4000);
    if (r.first) return r.first;
  }
  return null;
}

/** Unique within a node budget; running out of budget counts as not unique. */
function uniqueWithin(m: ReturnType<typeof buildModel>, givens: number[], size: number): boolean {
  const r = search(m, givens, 2, undefined, size === 9 ? 6000 : 20000);
  return r.count === 1 && !r.aborted;
}

/** Removes givens in random order while the puzzle stays unique and fits the target. */
function reduce(shape: { size: Size; boxW: number; boxH: number; clues: Clue[] }, sol: number[], target: Difficulty, rng: Rng): number[] {
  const m = buildModel(shape);
  const givens = sol.slice();
  // Clue cells lose their givens first, so the clues do the work there.
  const onClue = new Uint8Array(sol.length);
  for (const c of shape.clues) for (const x of clueCells(c)) onClue[x] = 1;
  const all = shuffle(rng, Array.from({ length: sol.length }, (_, i) => i));
  const order = [...all.filter((c) => onClue[c]), ...all.filter((c) => !onClue[c])];
  const floor = target === 1 ? gentleStart(shape.size) : 0;
  let count = sol.length;
  const tech = target <= 2 ? 2 : 3;
  for (const c of order) {
    if (count <= floor) break;
    givens[c] = 0;
    const ok = target <= 3 ? logicSolves(m, givens, tech, sol) : uniqueWithin(m, givens, shape.size);
    if (ok) count--;
    else givens[c] = sol[c];
  }
  if (target === 1 && m.cons.length && logicSolves(m, givens, 1, sol)) {
    // Gentle, but the clues should still matter: look for a given whose
    // removal makes singles alone fall short while the clues still finish
    // the grid. Otherwise drop one plain given and look again.
    const lowest = gentleFloor(shape.size);
    search: while (count > lowest) {
      let plain = -1;
      for (const c of order) {
        if (!givens[c]) continue;
        givens[c] = 0;
        if (logicSolves(m, givens, 2, sol)) {
          if (!logicSolves(m, givens, 1, sol)) { count--; break search; }
          if (plain < 0) plain = c;
        }
        givens[c] = sol[c];
      }
      if (plain < 0) break;
      givens[plain] = 0;
      count--;
    }
  }
  return givens;
}

function nameFor(seed: string): string {
  return CONSTELLATIONS[hashString(seed) % CONSTELLATIONS.length];
}

/**
 * Fog boards keep a start area of about a third of the board. Where the fog
 * solver (held to the target's techniques) gets stuck, a cleared empty cell
 * becomes a given; when nothing cleared is left to fill, one more cell next
 * to the cleared region starts visible.
 */
function fogFit(shape: { size: Size; boxW: number; boxH: number; clues: Clue[] }, sol: number[], givens: number[], target: Difficulty, seed: string, rng: Rng): { givens: number[]; fog: FogSpec } {
  const n = shape.size;
  const N = n * n;
  const tech = target <= 2 ? 2 : target === 3 ? 3 : 4;
  const start = fogStartArea({ ...shape, givens, solution: sol }, seed);
  const inStart = new Uint8Array(N);
  for (const c of start) inStart[c] = 1;
  let g = givens.slice();
  for (let guard = 0; guard < 2 * N; guard++) {
    const run = fogRun({ ...shape, givens: g, solution: sol }, start, tech);
    if (run.solved) break;
    const open: number[] = [];
    for (let c = 0; c < N; c++) if (run.cleared[c] && !run.values[c]) open.push(c);
    if (open.length) {
      const c = open[Math.floor(rng() * open.length)];
      g = g.slice();
      g[c] = sol[c];
      continue;
    }
    const edge: number[] = [];
    for (let c = 0; c < N; c++) {
      if (run.cleared[c] || inStart[c]) continue;
      const r = Math.floor(c / n), col = c % n;
      let touches = false;
      for (let dr = -1; dr <= 1 && !touches; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const rr = r + dr, cc = col + dc;
          if (rr >= 0 && rr < n && cc >= 0 && cc < n && run.cleared[rr * n + cc]) { touches = true; break; }
        }
      }
      if (touches) edge.push(c);
    }
    if (!edge.length) break;
    const c = edge[Math.floor(rng() * edge.length)];
    inStart[c] = 1;
    start.push(c);
  }
  return { givens: g, fog: { start: start.sort((a, b) => a - b), radius: 1 } };
}

/** Generates a puzzle, with a fog layout when opts.fog is set. */
export function generatePuzzle(opts: GenerateOptions): GeneratedPuzzle {
  const size = opts.size;
  const { boxW, boxH } = boxDims(size);
  const target = opts.difficulty;
  const rng = makeRng(`gen|${size}|${opts.seed}|${[...opts.rules].sort().join(',')}|${target}|${opts.minKinds ?? ''}|${opts.maxKinds ?? ''}|${opts.hiddenCageTotals ? 1 : 0}`);
  let kinds = chooseKinds(rng, opts);
  const attempts = opts.fog ? (size === 9 ? 3 : 8) : size === 9 ? 4 : target === 5 ? 18 : 10;
  let best: GeneratedPuzzle | null = null;
  let bestGap = 99;
  for (let a = 0; a < attempts && bestGap > 0; a++) {
    // Half way through, try a different mix of kinds from the same rules.
    if (a === Math.floor(attempts / 2)) kinds = chooseKinds(rng, opts);
    let globals: Clue[] = GLOBAL_KINDS.filter((k) => kinds.includes(k)).map((k) => ({ kind: k }) as Clue);
    let sol = fillSolution(size, boxW, boxH, globals, rng);
    while (!sol && globals.length) {
      // Drop a global rule that could not be filled at this size.
      const drop = globals[globals.length - 1].kind;
      globals = globals.slice(0, -1);
      kinds = kinds.filter((k) => k !== drop);
      sol = fillSolution(size, boxW, boxH, globals, rng);
    }
    if (!sol) continue;
    const clues = [...globals, ...layClues(size, sol, kinds, rng, !!opts.hiddenCageTotals)];
    const shape = { size, boxW, boxH, clues };
    let givens = reduce(shape, sol, target, rng);
    let g = gradeShape({ ...shape, givens });
    if (target === 4 && g.difficulty === 5) {
      // Too hard: hand back givens until probing logic can finish it.
      const empty = shuffle(rng, givens.map((d, i) => (d ? -1 : i)).filter((i) => i >= 0));
      for (const c of empty) {
        givens = givens.slice();
        givens[c] = sol[c];
        g = gradeShape({ ...shape, givens });
        if (g.difficulty <= 4) break;
      }
    }
    let fog: FogSpec | undefined;
    if (opts.fog) {
      const fit = fogFit(shape, sol, givens, target, `${opts.seed}|${a}`, rng);
      givens = fit.givens;
      fog = fit.fog;
      // Fog boards are graded as they play, under the fog.
      g = gradeFog({ ...shape, givens, solution: sol }, fog.start);
    }
    // The fog solver always finishes a fog board, so fog boards top out at 4.
    const gap = Math.abs(g.difficulty - (opts.fog ? Math.min(target, 4) : target));
    if (gap < bestGap) {
      bestGap = gap;
      // The id comes from the content, so different puzzles never share one.
      const content = `${size}|${givens.join('')}|${JSON.stringify(clues)}|${fog ? fog.start.join(',') : ''}`;
      best = {
        id: `g${size}-${hashString(content).toString(36)}${hashString(`${content}#`).toString(36)}`,
        seed: opts.seed,
        size,
        boxW,
        boxH,
        givens,
        solution: sol,
        clues,
        difficulty: g.difficulty,
        score: g.score,
        name: nameFor(opts.seed),
        ...(fog ? { fog } : {}),
      };
    }
  }
  if (!best) throw new Error('generation failed');
  return best;
}
