// Compiled form of a puzzle shape: houses, peers and one local constraint per
// clue. Both solvers (search and logic) work on this model with candidate
// bitmasks, where bit d set means digit d is still possible.
import type { Clue, PuzzleShape } from './types';

export type HouseKind = 'row' | 'column' | 'box' | 'region' | 'diagonal';

export interface Con {
  /** Index into shape.clues, or -1 for an implied negative kropki pair. */
  clue: number;
  kind: Clue['kind'] | 'negKropki';
  /** Cells in enumeration order (thermo and lines in line order, arrow circle first). */
  cells: number[];
  /** diff[i] lists earlier positions that must hold a different digit from position i. */
  diff: number[][];
  /** Checks position i against positions 0..i-1. */
  partial: (v: number[], i: number) => boolean;
  /** Checks a complete assignment. */
  final: (v: number[]) => boolean;
}

export interface Model {
  n: number;
  N: number;
  all: number;
  boxW: number;
  boxH: number;
  houses: number[][];
  houseKind: HouseKind[];
  /** Index of the house within its kind, for text: row 0, column 3, box 2. */
  houseNum: number[];
  cellHouses: number[][];
  peers: number[][];
  /** peerOf[a * N + b] is 1 when a and b must differ. */
  peerOf: Uint8Array;
  boxOf: number[];
  cons: Con[];
  cellCons: number[][];
  hasDiagonal: boolean;
  hasAntiKnight: boolean;
}

export const POP = new Uint8Array(1 << 11);
for (let i = 1; i < POP.length; i++) POP[i] = POP[i >> 1] + (i & 1);

export function bitsOf(mask: number): number[] {
  const out: number[] = [];
  for (let d = 1; d <= 10; d++) if (mask & (1 << d)) out.push(d);
  return out;
}

export function single(mask: number): boolean {
  return mask !== 0 && (mask & (mask - 1)) === 0;
}

export function digitOf(mask: number): number {
  return 31 - Math.clz32(mask);
}

export function boxIndex(n: number, boxW: number, boxH: number, cell: number): number {
  const r = Math.floor(cell / n), c = cell % n;
  return Math.floor(r / boxH) * (n / boxW) + Math.floor(c / boxW);
}

export const KNIGHT: [number, number][] = [
  [1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1],
];

export function knightCells(n: number, cell: number): number[] {
  const r = Math.floor(cell / n), c = cell % n;
  const out: number[] = [];
  for (const [dr, dc] of KNIGHT) {
    const rr = r + dr, cc = c + dc;
    if (rr >= 0 && rr < n && cc >= 0 && cc < n) out.push(rr * n + cc);
  }
  return out;
}

/** Cells of a clue, in drawing order. Empty for global rules. */
export function clueCells(clue: Clue): number[] {
  switch (clue.kind) {
    case 'thermo':
    case 'cage':
    case 'renban':
    case 'whisper':
      return clue.cells;
    case 'arrow':
      return [clue.circle, ...clue.path];
    case 'kropki':
    case 'xv':
      return [clue.a, clue.b];
    default:
      return [];
  }
}

function sumRange(v: number[], from: number, to: number): number {
  let s = 0;
  for (let i = from; i <= to; i++) s += v[i];
  return s;
}

export function isDouble(a: number, b: number): boolean {
  return a === 2 * b || b === 2 * a;
}

function makeCon(clueIdx: number, clue: Clue | { kind: 'negKropki'; a: number; b: number }, n: number): Omit<Con, 'diff'> | null {
  switch (clue.kind) {
    case 'thermo':
      return {
        clue: clueIdx, kind: 'thermo', cells: clue.cells.slice(),
        partial: (v, i) => i === 0 || v[i] > v[i - 1],
        final: () => true,
      };
    case 'whisper': {
      const md = clue.minDiff;
      return {
        clue: clueIdx, kind: 'whisper', cells: clue.cells.slice(),
        partial: (v, i) => i === 0 || Math.abs(v[i] - v[i - 1]) >= md,
        final: () => true,
      };
    }
    case 'renban': {
      const k = clue.cells.length;
      const span = (v: number[], i: number) => {
        let lo = 99, hi = -1;
        for (let j = 0; j <= i; j++) { if (v[j] < lo) lo = v[j]; if (v[j] > hi) hi = v[j]; }
        return hi - lo;
      };
      return {
        clue: clueIdx, kind: 'renban', cells: clue.cells.slice(),
        partial: (v, i) => span(v, i) <= k - 1,
        final: (v) => span(v, k - 1) === k - 1,
      };
    }
    case 'cage': {
      const k = clue.cells.length;
      const total = clue.sum;
      return {
        clue: clueIdx, kind: 'cage', cells: clue.cells.slice(),
        partial: total == null ? () => true : (v, i) => {
          const s = sumRange(v, 0, i);
          const rest = k - 1 - i;
          return s + rest <= total && s + rest * n >= total;
        },
        final: total == null ? () => true : (v) => sumRange(v, 0, k - 1) === total,
      };
    }
    case 'arrow': {
      const k = clue.path.length + 1;
      return {
        clue: clueIdx, kind: 'arrow', cells: [clue.circle, ...clue.path],
        partial: (v, i) => i === 0 || sumRange(v, 1, i) + (k - 1 - i) <= v[0],
        final: (v) => sumRange(v, 1, k - 1) === v[0],
      };
    }
    case 'kropki': {
      const white = clue.color === 'white';
      return {
        clue: clueIdx, kind: 'kropki', cells: [clue.a, clue.b],
        partial: () => true,
        final: white ? (v) => Math.abs(v[0] - v[1]) === 1 : (v) => isDouble(v[0], v[1]),
      };
    }
    case 'negKropki':
      return {
        clue: -1, kind: 'negKropki', cells: [clue.a, clue.b],
        partial: () => true,
        final: (v) => Math.abs(v[0] - v[1]) !== 1 && !isDouble(v[0], v[1]),
      };
    case 'xv': {
      const s = clue.sum;
      return {
        clue: clueIdx, kind: 'xv', cells: [clue.a, clue.b],
        partial: () => true,
        final: (v) => v[0] + v[1] === s,
      };
    }
    default:
      return null;
  }
}

const cache = new WeakMap<object, { sig: string; model: Model }>();

/** Builds the model for a shape, cached per clues array and checked against its contents. Givens are not part of the model. */
export function buildModel(shape: Pick<PuzzleShape, 'size' | 'boxW' | 'boxH' | 'regions' | 'clues' | 'negativeKropki'>): Model {
  const sig = `${shape.size}|${shape.boxW}|${shape.boxH}|${shape.negativeKropki ? 1 : 0}|${shape.regions ? shape.regions.join(',') : ''}|${JSON.stringify(shape.clues)}`;
  const hit = cache.get(shape.clues);
  if (hit && hit.sig === sig) return hit.model;
  const model = compile(shape);
  cache.set(shape.clues, { sig, model });
  return model;
}

function compile(shape: Pick<PuzzleShape, 'size' | 'boxW' | 'boxH' | 'regions' | 'clues' | 'negativeKropki'>): Model {
  const n = shape.size;
  const N = n * n;
  const all = ((1 << (n + 1)) - 1) & ~1;
  const houses: number[][] = [];
  const houseKind: HouseKind[] = [];
  const houseNum: number[] = [];
  for (let r = 0; r < n; r++) {
    houses.push(Array.from({ length: n }, (_, c) => r * n + c));
    houseKind.push('row');
    houseNum.push(r);
  }
  for (let c = 0; c < n; c++) {
    houses.push(Array.from({ length: n }, (_, r) => r * n + c));
    houseKind.push('column');
    houseNum.push(c);
  }
  const boxOf: number[] = [];
  if (shape.regions && shape.regions.length === N) {
    const ids = [...new Set(shape.regions)].sort((a, b) => a - b);
    ids.forEach((id, k) => {
      const cells: number[] = [];
      for (let i = 0; i < N; i++) if (shape.regions![i] === id) { cells.push(i); boxOf[i] = k; }
      houses.push(cells);
      houseKind.push('region');
      houseNum.push(k);
    });
  } else {
    for (let b = 0; b < n; b++) { houses.push([]); houseKind.push('box'); houseNum.push(b); }
    for (let i = 0; i < N; i++) {
      const b = boxIndex(n, shape.boxW, shape.boxH, i);
      boxOf[i] = b;
      houses[2 * n + b].push(i);
    }
  }
  const hasDiagonal = shape.clues.some((c) => c.kind === 'diagonal');
  const hasAntiKnight = shape.clues.some((c) => c.kind === 'antiKnight');
  if (hasDiagonal) {
    houses.push(Array.from({ length: n }, (_, i) => i * n + i));
    houseKind.push('diagonal');
    houseNum.push(0);
    houses.push(Array.from({ length: n }, (_, i) => i * n + (n - 1 - i)));
    houseKind.push('diagonal');
    houseNum.push(1);
  }
  const cellHouses: number[][] = Array.from({ length: N }, () => []);
  houses.forEach((h, k) => h.forEach((c) => cellHouses[c].push(k)));

  const peerOf = new Uint8Array(N * N);
  const link = (a: number, b: number) => {
    if (a === b) return;
    peerOf[a * N + b] = 1;
    peerOf[b * N + a] = 1;
  };
  for (const h of houses) for (const a of h) for (const b of h) link(a, b);
  if (hasAntiKnight) for (let a = 0; a < N; a++) for (const b of knightCells(n, a)) link(a, b);
  for (const clue of shape.clues) {
    if (clue.kind === 'cage' || clue.kind === 'renban' || clue.kind === 'thermo') {
      for (const a of clue.cells) for (const b of clue.cells) link(a, b);
    }
  }
  const peers: number[][] = Array.from({ length: N }, () => []);
  for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) if (peerOf[a * N + b]) peers[a].push(b);

  const raw: Omit<Con, 'diff'>[] = [];
  shape.clues.forEach((clue, k) => {
    const con = makeCon(k, clue, n);
    if (con) raw.push(con);
  });
  if (shape.negativeKropki) {
    const dotted = new Set<string>();
    for (const clue of shape.clues) {
      if (clue.kind === 'kropki') dotted.add(`${Math.min(clue.a, clue.b)}:${Math.max(clue.a, clue.b)}`);
    }
    for (let a = 0; a < N; a++) {
      const r = Math.floor(a / n), c = a % n;
      const nb: number[] = [];
      if (c + 1 < n) nb.push(a + 1);
      if (r + 1 < n) nb.push(a + n);
      for (const b of nb) {
        if (dotted.has(`${a}:${b}`)) continue;
        raw.push(makeCon(-1, { kind: 'negKropki', a, b }, n)!);
      }
    }
  }
  const cons: Con[] = raw.map((c) => ({
    ...c,
    diff: c.cells.map((cell, i) => {
      const out: number[] = [];
      for (let j = 0; j < i; j++) if (peerOf[cell * N + c.cells[j]] || cell === c.cells[j]) out.push(j);
      return out;
    }),
  }));
  const cellCons: number[][] = Array.from({ length: N }, () => []);
  cons.forEach((c, k) => {
    for (const cell of new Set(c.cells)) cellCons[cell].push(k);
  });
  return {
    n, N, all, boxW: shape.boxW, boxH: shape.boxH, houses, houseKind, houseNum, cellHouses,
    peers, peerOf, boxOf, cons, cellCons, hasDiagonal, hasAntiKnight,
  };
}

/**
 * Generalised arc consistency for one constraint: the digits each cell can
 * still take in some assignment that satisfies the clue. Null when no
 * assignment exists.
 */
export function support(con: Con, masks: ArrayLike<number>): number[] | null {
  const cells = con.cells;
  const k = cells.length;
  const doms = new Array<number>(k);
  for (let i = 0; i < k; i++) doms[i] = masks[cells[i]];
  const sup = new Array<number>(k).fill(0);
  const vals = new Array<number>(k).fill(0);
  const { diff, partial, final } = con;
  let done = false;
  const rec = (i: number): void => {
    if (i === k) {
      if (!final(vals)) return;
      let full = true;
      for (let j = 0; j < k; j++) {
        sup[j] |= 1 << vals[j];
        if (sup[j] !== doms[j]) full = false;
      }
      if (full) done = true;
      return;
    }
    let m = doms[i];
    const dj = diff[i];
    while (m) {
      const b = m & -m;
      m ^= b;
      const v = 31 - Math.clz32(b);
      vals[i] = v;
      let ok = true;
      for (let t = 0; t < dj.length; t++) if (vals[dj[t]] === v) { ok = false; break; }
      if (!ok || !partial(vals, i)) continue;
      rec(i + 1);
      if (done) return;
    }
  };
  rec(0);
  for (let j = 0; j < k; j++) if (sup[j] === 0) return null;
  return sup;
}
