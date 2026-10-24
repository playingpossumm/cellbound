// Logical solver that never guesses. It applies the cheapest deduction first:
// singles, then one clue at a time, then pairs and pointing, then (level 4
// only) a one-step contradiction test. Used for grading, hints and fog.
import { buildModel, POP, single, digitOf, support, type Model } from './model';
import { propagate } from './solver';
import type { Difficulty, PuzzleShape } from './types';

export type StepKind = 'naked' | 'hidden' | 'clue' | 'locked' | 'nakedPair' | 'hiddenPair' | 'probe';
export type Tech = 1 | 2 | 3 | 4;

export interface Step {
  kind: StepKind;
  level: Tech;
  place?: { cell: number; digit: number };
  elim: { cell: number; mask: number }[];
  /** Model house index for hidden singles, pointing and pairs. */
  house?: number;
  /** Second house for pointing: the house that loses candidates. */
  house2?: number;
  /** Model constraint index for clue steps. */
  con?: number;
  /** Digits involved (pairs, pointing, a short contradiction test). */
  digits?: number[];
  cells: number[];
  /** Short contradiction tests: how many other cells were forced before the contradiction. */
  depth?: number;
}

/** Chain length, in forced cells, that a short contradiction test tries before longer ones. */
const SHORT_FIRST = 2;

const COST: Record<StepKind, number> = {
  naked: 1, hidden: 1.5, clue: 3, locked: 6, nakedPair: 8, hiddenPair: 9, probe: 25,
};

export class Logic {
  readonly m: Model;
  masks: number[];
  values: number[];
  steps: Step[] = [];
  score = 0;
  maxUsed = 0;
  broken = false;
  /** Fog: cells the solver may write into. */
  canPlace: (c: number) => boolean = () => true;
  /** Called after each placement (fog uses it to reveal cells). */
  onPlace: ((c: number, d: number) => void) | null = null;
  private pairs: [number, number, number[]][] | null = null;

  constructor(m: Model, values: ArrayLike<number>) {
    this.m = m;
    this.masks = new Array(m.N).fill(m.all);
    this.values = new Array(m.N).fill(0);
    for (let c = 0; c < m.N; c++) if (values[c]) this.placeRaw(c, values[c]);
  }

  placeRaw(c: number, d: number): void {
    const { m } = this;
    this.values[c] = d;
    this.masks[c] = 1 << d;
    const b = 1 << d;
    for (const p of m.peers[c]) {
      if (this.masks[p] & b) {
        this.masks[p] &= ~b;
        if (!this.masks[p]) this.broken = true;
      }
    }
  }

  solved(): boolean {
    return !this.broken && this.values.every((v) => v > 0);
  }

  private record(s: Step): Step {
    this.steps.push(s);
    this.score += COST[s.kind];
    if (s.level > this.maxUsed) this.maxUsed = s.level;
    if (s.place) {
      this.placeRaw(s.place.cell, s.place.digit);
      this.onPlace?.(s.place.cell, s.place.digit);
    }
    for (const e of s.elim) {
      this.masks[e.cell] &= ~e.mask;
      if (!this.masks[e.cell]) this.broken = true;
    }
    return s;
  }

  /** Finds and applies one deduction at or below maxTech. */
  next(maxTech: Tech): Step | null {
    if (this.broken) return null;
    const { m, masks, values } = this;
    const { N, houses } = m;
    for (let c = 0; c < N; c++) {
      if (values[c]) continue;
      const v = masks[c];
      if (!v) { this.broken = true; return null; }
      if (single(v) && this.canPlace(c)) {
        return this.record({ kind: 'naked', level: 1, place: { cell: c, digit: digitOf(v) }, elim: [], cells: [c] });
      }
    }
    for (let h = 0; h < houses.length; h++) {
      const cells = houses[h];
      let once = 0, twice = 0, placed = 0;
      for (const c of cells) {
        const v = masks[c];
        if (values[c]) { placed |= v; continue; }
        twice |= once & v;
        once |= v;
      }
      if ((once | placed) !== m.all) { this.broken = true; return null; }
      let uniq = once & ~twice & ~placed;
      while (uniq) {
        const b = uniq & -uniq;
        uniq ^= b;
        for (const c of cells) {
          if (!values[c] && masks[c] & b && this.canPlace(c)) {
            return this.record({ kind: 'hidden', level: 1, place: { cell: c, digit: digitOf(b) }, elim: [], house: h, cells: [c] });
          }
        }
      }
    }
    if (maxTech < 2) return null;
    for (let k = 0; k < m.cons.length; k++) {
      const con = m.cons[k];
      let open = false;
      for (const c of con.cells) if (!values[c]) { open = true; break; }
      if (!open) continue;
      const sup = support(con, masks);
      if (!sup) { this.broken = true; return null; }
      const elim: { cell: number; mask: number }[] = [];
      con.cells.forEach((c, i) => {
        const gone = masks[c] & ~sup[i];
        if (gone && !values[c]) elim.push({ cell: c, mask: gone });
      });
      if (elim.length) return this.record({ kind: 'clue', level: 2, elim, con: k, cells: con.cells.slice() });
    }
    if (maxTech < 3) return null;
    const s3 = this.pointing() ?? this.nakedPair() ?? this.hiddenPair();
    if (s3) return this.record(s3);
    if (maxTech < 4) return null;
    const s4 = this.probe();
    if (s4) return this.record(s4);
    return null;
  }

  private housePairs(): [number, number, number[]][] {
    if (this.pairs) return this.pairs;
    const { houses, N } = this.m;
    const out: [number, number, number[]][] = [];
    const inH = houses.map((h) => {
      const s = new Uint8Array(N);
      for (const c of h) s[c] = 1;
      return s;
    });
    for (let a = 0; a < houses.length; a++) {
      for (let b = 0; b < houses.length; b++) {
        if (a === b) continue;
        const inter = houses[a].filter((c) => inH[b][c]);
        if (inter.length >= 2 && inter.length < houses[a].length) out.push([a, b, inter]);
      }
    }
    this.pairs = out;
    return out;
  }

  private pointing(): Step | null {
    const { m, masks, values } = this;
    for (const [a, b, inter] of this.housePairs()) {
      for (let d = 1; d <= m.n; d++) {
        const bit = 1 << d;
        let placed = false, outside = false, inside: number[] = [];
        for (const c of m.houses[a]) {
          if (values[c] === d) { placed = true; break; }
          if (values[c] || !(masks[c] & bit)) continue;
          if (inter.includes(c)) inside.push(c);
          else { outside = true; break; }
        }
        if (placed || outside || inside.length < 2) continue;
        const elim: { cell: number; mask: number }[] = [];
        for (const c of m.houses[b]) {
          if (!values[c] && masks[c] & bit && !inter.includes(c)) elim.push({ cell: c, mask: bit });
        }
        if (elim.length) return { kind: 'locked', level: 3, elim, house: a, house2: b, digits: [d], cells: inside };
        inside = [];
      }
    }
    return null;
  }

  private nakedPair(): Step | null {
    const { m, masks, values } = this;
    for (let h = 0; h < m.houses.length; h++) {
      const open = m.houses[h].filter((c) => !values[c]);
      for (let i = 0; i < open.length; i++) {
        const v = masks[open[i]];
        if (POP[v] !== 2) continue;
        for (let j = i + 1; j < open.length; j++) {
          if (masks[open[j]] !== v) continue;
          const elim: { cell: number; mask: number }[] = [];
          for (const c of open) {
            if (c !== open[i] && c !== open[j] && masks[c] & v) elim.push({ cell: c, mask: masks[c] & v });
          }
          if (elim.length) {
            return { kind: 'nakedPair', level: 3, elim, house: h, digits: bitsList(v), cells: [open[i], open[j]] };
          }
        }
      }
    }
    return null;
  }

  private hiddenPair(): Step | null {
    const { m, masks, values } = this;
    for (let h = 0; h < m.houses.length; h++) {
      const open = m.houses[h].filter((c) => !values[c]);
      const where: number[][] = [];
      for (let d = 1; d <= m.n; d++) where[d] = open.filter((c) => masks[c] & (1 << d));
      for (let d1 = 1; d1 <= m.n; d1++) {
        if (where[d1].length !== 2) continue;
        for (let d2 = d1 + 1; d2 <= m.n; d2++) {
          const w = where[d2];
          if (w.length !== 2 || w[0] !== where[d1][0] || w[1] !== where[d1][1]) continue;
          const keep = (1 << d1) | (1 << d2);
          const elim: { cell: number; mask: number }[] = [];
          for (const c of w) if (masks[c] & ~keep) elim.push({ cell: c, mask: masks[c] & ~keep });
          if (elim.length) return { kind: 'hiddenPair', level: 3, elim, house: h, digits: [d1, d2], cells: w.slice() };
        }
      }
    }
    return null;
  }

  /** Maximum number of contradiction tests in one run; keeps grading fast. */
  probeBudget = Infinity;
  /** Largest candidate count a contradiction test looks at. */
  probeWidth = 3;
  /**
   * When finite, a contradiction test rules out one digit with a short chain:
   * first one that forces at most SHORT_FIRST other cells, then up to this
   * many. The default keeps the grader's original test. The 9x9 Dailies are
   * made with this test, so a change to it changes them (see craft.ts).
   */
  probeDepth = Infinity;

  private probe(): Step | null {
    if (this.probeBudget <= 0) return null;
    this.probeBudget--;
    if (this.probeDepth !== Infinity) return this.shortProbe();
    const { m, masks, values } = this;
    for (let want = 2; want <= this.probeWidth; want++) {
      for (let c = 0; c < m.N; c++) {
        if (values[c] || POP[masks[c]] !== want) continue;
        let bad = 0;
        for (let d = 1; d <= m.n; d++) {
          if (!(masks[c] & (1 << d))) continue;
          const copy = Int32Array.from(masks);
          copy[c] = 1 << d;
          if (!propagate(m, copy, [c])) bad |= 1 << d;
        }
        if (bad && bad !== masks[c]) return { kind: 'probe', level: 4, elim: [{ cell: c, mask: bad }], cells: [c] };
      }
    }
    return null;
  }

  /** Looks for a chain of at most two forced cells first, then up to probeDepth, taking the first contradiction found. */
  private shortProbe(): Step | null {
    const { m, masks, values } = this;
    const limits = this.probeDepth > SHORT_FIRST ? [SHORT_FIRST, this.probeDepth] : [this.probeDepth];
    for (const limit of limits) {
      for (let want = 2; want <= this.probeWidth; want++) {
        for (let c = 0; c < m.N; c++) {
          if (values[c] || POP[masks[c]] !== want) continue;
          for (let d = 1; d <= m.n; d++) {
            if (!(masks[c] & (1 << d))) continue;
            const depth = contradictionDepth(m, masks, c, d, limit);
            if (depth >= 0) return { kind: 'probe', level: 4, elim: [{ cell: c, mask: 1 << d }], cells: [c], digits: [d], depth };
          }
        }
      }
    }
    return null;
  }

  /** Runs until solved or stuck. Returns true when solved. */
  run(maxTech: Tech, maxSteps = 5000): boolean {
    for (let i = 0; i < maxSteps; i++) {
      if (this.solved()) return true;
      if (!this.next(maxTech)) break;
    }
    return this.solved();
  }
}

/**
 * Puts digit in cell and propagates (singles, hidden singles and one clue at
 * a time, as the search solver does) until something breaks. Returns how many
 * other cells were forced before the contradiction showed, or -1 when there
 * is none, or none within limit forced cells.
 */
export function contradictionDepth(m: Model, masks: ArrayLike<number>, cell: number, digit: number, limit: number): number {
  const { N, peers, cellCons, cellHouses, houses, cons, all } = m;
  const mk = Int32Array.from(masks);
  mk[cell] = 1 << digit;
  const fixed = new Uint8Array(N);
  for (let c = 0; c < N; c++) if (single(mk[c])) fixed[c] = 1;
  let forced = 0;
  const inQ = new Uint8Array(N);
  const q: number[] = [cell];
  inQ[cell] = 1;
  const conDirty = new Uint8Array(cons.length);
  const conList: number[] = [];
  const houseDirty = new Uint8Array(houses.length);
  const houseList: number[] = [];
  // Queues a changed cell; false once more cells were forced than the limit allows.
  const changed = (c: number): boolean => {
    if (!fixed[c] && single(mk[c])) {
      fixed[c] = 1;
      if (++forced > limit) return false;
    }
    if (!inQ[c]) { inQ[c] = 1; q.push(c); }
    return true;
  };
  for (;;) {
    while (q.length) {
      const c = q.pop()!;
      inQ[c] = 0;
      const v = mk[c];
      if (v === 0) return forced;
      if (single(v)) {
        for (const p of peers[c]) {
          if (mk[p] & v) {
            const nm = mk[p] & ~v;
            if (!nm) return forced;
            mk[p] = nm;
            if (!changed(p)) return -1;
          }
        }
      }
      for (const k of cellCons[c]) if (!conDirty[k]) { conDirty[k] = 1; conList.push(k); }
      for (const h of cellHouses[c]) if (!houseDirty[h]) { houseDirty[h] = 1; houseList.push(h); }
    }
    if (houseList.length) {
      const h = houseList.pop()!;
      houseDirty[h] = 0;
      let once = 0, twice = 0;
      for (const c of houses[h]) { const v = mk[c]; twice |= once & v; once |= v; }
      if (once !== all) return forced;
      const uniq = once & ~twice;
      if (uniq) {
        for (const c of houses[h]) {
          const v = mk[c], u = v & uniq;
          if (u && v !== u) {
            if (u & (u - 1)) return forced;
            mk[c] = u;
            if (!changed(c)) return -1;
          }
        }
      }
      continue;
    }
    if (conList.length) {
      const k = conList.pop()!;
      conDirty[k] = 0;
      const con = cons[k];
      const sup = support(con, mk);
      if (!sup) return forced;
      for (let i = 0; i < sup.length; i++) {
        const c = con.cells[i];
        if (mk[c] !== sup[i]) {
          mk[c] = sup[i];
          if (!changed(c)) return -1;
        }
      }
      continue;
    }
    return -1;
  }
}

function bitsList(mask: number): number[] {
  const out: number[] = [];
  for (let d = 1; d <= 10; d++) if (mask & (1 << d)) out.push(d);
  return out;
}

/** Givens at or above this count, with no pair logic needed, make a gentle puzzle (difficulty 1). */
export function gentleFloor(size: number): number {
  return size === 4 ? 6 : size === 6 ? 11 : 30;
}

/** Where the generator stops removing givens for a gentle puzzle when the clues already matter. */
export function gentleStart(size: number): number {
  return size === 4 ? 7 : size === 6 ? 15 : 34;
}

export interface Grade {
  difficulty: Difficulty;
  score: number;
  solved: boolean;
  maxUsed: number;
}

/** Grades a puzzle by the hardest technique the logical solver needs. */
export function gradeShape(p: PuzzleShape): Grade {
  const m = buildModel(p);
  const L = new Logic(m, p.givens);
  const givens = p.givens.filter((d) => d > 0).length;
  if (L.run(3)) {
    const difficulty: Difficulty = L.maxUsed >= 3 ? 3 : givens >= gentleFloor(p.size) ? 1 : 2;
    return { difficulty, score: Math.round(L.score), solved: true, maxUsed: L.maxUsed };
  }
  L.probeBudget = p.size === 9 ? 12 : 40;
  const ok = L.run(4);
  return { difficulty: ok ? 4 : 5, score: Math.round(L.score + (ok ? 0 : 200)), solved: ok, maxUsed: ok ? 4 : 5 };
}

/** True when the logical solver finishes the puzzle with techniques up to maxTech. */
export function logicSolves(m: Model, givens: ArrayLike<number>, maxTech: Tech, solution?: ArrayLike<number>): boolean {
  const L = new Logic(m, givens);
  if (!L.run(maxTech)) return false;
  if (solution) for (let i = 0; i < m.N; i++) if (L.values[i] !== solution[i]) return false;
  return true;
}
