// A small brute-force checker for the handcrafted practice puzzles. It follows the clue
// semantics written in the engine's types, and it is used by tests, not by the app.
import type { Clue, Digit, PuzzleShape } from '../../engine/types';

const KNIGHT = [
  [1, 2],
  [2, 1],
  [-1, 2],
  [-2, 1],
  [1, -2],
  [2, -1],
  [-1, -2],
  [-2, -1],
];

function unitsOf(p: PuzzleShape): number[][] {
  const n = p.size;
  const units: number[][] = [];
  for (let k = 0; k < n; k++) {
    units.push(Array.from({ length: n }, (_, c) => k * n + c));
    units.push(Array.from({ length: n }, (_, r) => r * n + k));
  }
  const perRow = n / p.boxW;
  const boxes: number[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i < n * n; i++) {
    const r = Math.floor(i / n);
    const c = i % n;
    boxes[Math.floor(r / p.boxH) * perRow + Math.floor(c / p.boxW)].push(i);
  }
  return [...units, ...boxes];
}

function noRepeat(cells: number[], g: Digit[]): boolean {
  const seen = new Set<number>();
  for (const i of cells) {
    if (!g[i]) continue;
    if (seen.has(g[i])) return false;
    seen.add(g[i]);
  }
  return true;
}

function clueOk(p: PuzzleShape, c: Clue, g: Digit[]): boolean {
  const n = p.size;
  switch (c.kind) {
    case 'thermo':
      for (let k = 1; k < c.cells.length; k++) {
        const a = g[c.cells[k - 1]];
        const b = g[c.cells[k]];
        if (a && b && a >= b) return false;
      }
      return true;
    case 'arrow': {
      const path = c.path.map((i) => g[i]);
      const filled = path.filter(Boolean);
      const sum = filled.reduce((s, d) => s + d, 0);
      const open = path.length - filled.length;
      const circle = g[c.circle];
      if (circle) {
        if (open === 0) return sum === circle;
        return sum + open <= circle;
      }
      return open > 0 || sum <= n;
    }
    case 'cage': {
      if (!noRepeat(c.cells, g)) return false;
      if (c.sum === null) return true;
      const vals = c.cells.map((i) => g[i]);
      const sum = vals.reduce((s, d) => s + d, 0);
      const open = vals.filter((d) => !d).length;
      return open === 0 ? sum === c.sum : sum + open <= c.sum;
    }
    case 'renban': {
      if (!noRepeat(c.cells, g)) return false;
      const vals = c.cells.map((i) => g[i]).filter(Boolean);
      if (!vals.length) return true;
      return Math.max(...vals) - Math.min(...vals) <= c.cells.length - 1;
    }
    case 'whisper':
      for (let k = 1; k < c.cells.length; k++) {
        const a = g[c.cells[k - 1]];
        const b = g[c.cells[k]];
        if (a && b && Math.abs(a - b) < c.minDiff) return false;
      }
      return true;
    case 'kropki': {
      const a = g[c.a];
      const b = g[c.b];
      if (!a || !b) return true;
      return c.color === 'white' ? Math.abs(a - b) === 1 : a === 2 * b || b === 2 * a;
    }
    case 'xv': {
      const a = g[c.a];
      const b = g[c.b];
      return !a || !b || a + b === c.sum;
    }
    case 'diagonal': {
      const d1 = Array.from({ length: n }, (_, k) => k * n + k);
      const d2 = Array.from({ length: n }, (_, k) => k * n + (n - 1 - k));
      return noRepeat(d1, g) && noRepeat(d2, g);
    }
    case 'antiKnight':
      for (let i = 0; i < n * n; i++) {
        if (!g[i]) continue;
        const r = Math.floor(i / n);
        const col = i % n;
        for (const [dr, dc] of KNIGHT) {
          const rr = r + dr;
          const cc = col + dc;
          if (rr < 0 || cc < 0 || rr >= n || cc >= n) continue;
          if (g[rr * n + cc] === g[i]) return false;
        }
      }
      return true;
  }
}

/** True when no rule is broken among the filled cells (empty cells are ignored). */
export function consistent(p: PuzzleShape, g: Digit[]): boolean {
  return unitsOf(p).every((u) => noRepeat(u, g)) && p.clues.every((c) => clueOk(p, c, g));
}

/** Counts solutions up to `limit`. */
export function countSolutions(p: PuzzleShape, limit = 2): number {
  const g = p.givens.slice();
  if (!consistent(p, g)) return 0;
  let found = 0;
  const empties = g.map((d, i) => (d ? -1 : i)).filter((i) => i >= 0);
  const go = (k: number): void => {
    if (found >= limit) return;
    if (k === empties.length) {
      found++;
      return;
    }
    const i = empties[k];
    for (let d = 1; d <= p.size; d++) {
      g[i] = d;
      if (consistent(p, g)) go(k + 1);
      if (found >= limit) break;
    }
    g[i] = 0;
  };
  go(0);
  return found;
}

/** The first solution found, or null. */
export function firstSolution(p: PuzzleShape): Digit[] | null {
  const g = p.givens.slice();
  if (!consistent(p, g)) return null;
  const empties = g.map((d, i) => (d ? -1 : i)).filter((i) => i >= 0);
  const go = (k: number): boolean => {
    if (k === empties.length) return true;
    const i = empties[k];
    for (let d = 1; d <= p.size; d++) {
      g[i] = d;
      if (consistent(p, g) && go(k + 1)) return true;
    }
    g[i] = 0;
    return false;
  };
  return go(0) ? g : null;
}
