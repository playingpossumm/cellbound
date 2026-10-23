// Search solver: bitmask candidates, propagation to a fixpoint (peers, hidden
// singles, one arc consistency pass per clue), then MRV backtracking.
import { buildModel, POP, support, type Model } from './model';
import type { Rng } from './rng';
import type { Digit, PuzzleShape } from './types';

/**
 * Propagates until nothing changes. start lists the cells that changed since
 * the last fixpoint, or null to look at everything. Returns false on a
 * contradiction. masks is updated in place.
 */
export function propagate(m: Model, masks: Int32Array | number[], start: number[] | null): boolean {
  const { N, peers, cellCons, cellHouses, houses, cons, all } = m;
  const inQ = new Uint8Array(N);
  const q: number[] = [];
  const conDirty = new Uint8Array(cons.length);
  const conList: number[] = [];
  const houseDirty = new Uint8Array(houses.length);
  const houseList: number[] = [];
  const push = (c: number) => {
    if (!inQ[c]) { inQ[c] = 1; q.push(c); }
  };
  if (start) for (const c of start) push(c);
  else for (let c = 0; c < N; c++) push(c);
  for (;;) {
    while (q.length) {
      const c = q.pop()!;
      inQ[c] = 0;
      const v = masks[c];
      if (v === 0) return false;
      if ((v & (v - 1)) === 0) {
        const pc = peers[c];
        for (let i = 0; i < pc.length; i++) {
          const p = pc[i];
          const pm = masks[p];
          if (pm & v) {
            const nm = pm & ~v;
            if (!nm) return false;
            masks[p] = nm;
            push(p);
          }
        }
      }
      const cc = cellCons[c];
      for (let i = 0; i < cc.length; i++) {
        const k = cc[i];
        if (!conDirty[k]) { conDirty[k] = 1; conList.push(k); }
      }
      const ch = cellHouses[c];
      for (let i = 0; i < ch.length; i++) {
        const h = ch[i];
        if (!houseDirty[h]) { houseDirty[h] = 1; houseList.push(h); }
      }
    }
    if (houseList.length) {
      const h = houseList.pop()!;
      houseDirty[h] = 0;
      const cells = houses[h];
      let once = 0, twice = 0;
      for (let i = 0; i < cells.length; i++) {
        const v = masks[cells[i]];
        twice |= once & v;
        once |= v;
      }
      if (once !== all) return false;
      const uniq = once & ~twice;
      if (uniq) {
        for (let i = 0; i < cells.length; i++) {
          const c = cells[i];
          const v = masks[c];
          const u = v & uniq;
          if (u && v !== u) {
            if (u & (u - 1)) return false;
            masks[c] = u;
            push(c);
          }
        }
      }
      continue;
    }
    if (conList.length) {
      const k = conList.pop()!;
      conDirty[k] = 0;
      const con = cons[k];
      const sup = support(con, masks);
      if (!sup) return false;
      for (let i = 0; i < sup.length; i++) {
        const c = con.cells[i];
        if (masks[c] !== sup[i]) { masks[c] = sup[i]; push(c); }
      }
      continue;
    }
    return true;
  }
}

/** Starting masks from a grid of digits (0 empty). Null when a digit is out of range. */
export function masksFrom(m: Model, values: ArrayLike<Digit>): Int32Array | null {
  const masks = new Int32Array(m.N);
  for (let i = 0; i < m.N; i++) {
    const d = values[i] | 0;
    if (d < 0 || d > m.n) return null;
    masks[i] = d ? 1 << d : m.all;
  }
  return masks;
}

interface SearchState {
  count: number;
  limit: number;
  first: Int32Array | null;
  nodes: number;
  budget: number;
  aborted: boolean;
}

function dfs(m: Model, masks: Int32Array, start: number[] | null, st: SearchState, rng?: Rng): void {
  if (++st.nodes > st.budget) { st.aborted = true; return; }
  if (!propagate(m, masks, start)) return;
  let best = -1, bc = 99;
  for (let c = 0; c < m.N; c++) {
    const v = masks[c];
    if (v & (v - 1)) {
      const pc = POP[v];
      if (pc < bc) { bc = pc; best = c; if (pc === 2) break; }
    }
  }
  if (best < 0) {
    st.count++;
    if (!st.first) st.first = masks.slice();
    return;
  }
  const digits: number[] = [];
  for (let d = 1; d <= m.n; d++) if (masks[best] & (1 << d)) digits.push(d);
  if (rng) {
    for (let i = digits.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = digits[i]; digits[i] = digits[j]; digits[j] = t;
    }
  }
  for (const d of digits) {
    const child = masks.slice();
    child[best] = 1 << d;
    dfs(m, child, [best], st, rng);
    if (st.count >= st.limit || st.aborted) return;
  }
}

export interface SearchResult {
  count: number;
  first: number[] | null;
  aborted: boolean;
}

/** Counts solutions of a model from a starting grid, up to limit. */
export function search(m: Model, values: ArrayLike<Digit>, limit: number, rng?: Rng, budget = 1e7): SearchResult {
  const masks = masksFrom(m, values);
  if (!masks) return { count: 0, first: null, aborted: false };
  const st: SearchState = { count: 0, limit, first: null, nodes: 0, budget, aborted: false };
  dfs(m, masks, null, st, rng);
  const first = st.first ? Array.from(st.first, (v) => 31 - Math.clz32(v)) : null;
  return { count: st.count, first, aborted: st.aborted };
}

export function countSolutionsShape(p: PuzzleShape, limit = 2): number {
  if (limit <= 0) return 0;
  return search(buildModel(p), p.givens, limit).count;
}

export function solveShape(p: PuzzleShape): Digit[] | null {
  const r = search(buildModel(p), p.givens, 2);
  return r.count === 1 ? r.first : null;
}

/**
 * Candidates for auto-notes: digits seen by placed peers are removed, then
 * every clue removes what it rules out on its own. Placements are not
 * chained, so notes never solve the grid by themselves.
 */
export function candidatesFor(p: PuzzleShape, values: ArrayLike<Digit>): number[] {
  const m = buildModel(p);
  const out: number[] = [];
  for (let i = 0; i < m.N; i++) {
    const d = values[i] | 0;
    out.push(d >= 1 && d <= m.n ? 1 << d : m.all);
  }
  for (let i = 0; i < m.N; i++) {
    if (!values[i]) continue;
    const b = 1 << values[i];
    for (const q of m.peers[i]) if (!values[q]) out[q] &= ~b;
  }
  for (let pass = 0; pass < 2; pass++) {
    for (const con of m.cons) {
      const sup = support(con, out);
      if (!sup) continue;
      con.cells.forEach((c, i) => {
        if (!values[c]) out[c] = sup[i];
      });
    }
  }
  return out;
}
