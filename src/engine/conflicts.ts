// Rule breaks among filled cells, for the Conflicts mistake setting.
import { boxIndex, isDouble, knightCells } from './model';
import type { CellIndex, Clue, Conflict, Digit, Puzzle } from './types';

function duplicates(cells: CellIndex[], values: Digit[], rule: Conflict['rule'], out: Conflict[]) {
  const seen = new Map<Digit, CellIndex[]>();
  for (const i of cells) {
    const d = values[i];
    if (!d) continue;
    const list = seen.get(d);
    if (list) list.push(i);
    else seen.set(d, [i]);
  }
  for (const list of seen.values()) if (list.length > 1) out.push({ cells: list, rule });
}

function clueConflicts(clue: Clue, values: Digit[], n: number, out: Conflict[]) {
  const v = (i: CellIndex) => values[i] | 0;
  switch (clue.kind) {
    case 'thermo': {
      const cs = clue.cells;
      for (let i = 0; i < cs.length; i++) {
        if (!v(cs[i])) continue;
        for (let j = i + 1; j < cs.length; j++) {
          if (v(cs[j]) && v(cs[j]) <= v(cs[i])) out.push({ cells: [cs[i], cs[j]], rule: 'thermo' });
        }
      }
      return;
    }
    case 'arrow': {
      const filled = clue.path.filter((c) => v(c));
      const s = filled.reduce((a, c) => a + v(c), 0);
      const circle = v(clue.circle);
      const full = filled.length === clue.path.length;
      if (circle) {
        if (s > circle || (full && s !== circle)) out.push({ cells: [clue.circle, ...filled], rule: 'arrow' });
      } else if (s > n) {
        out.push({ cells: filled, rule: 'arrow' });
      }
      return;
    }
    case 'cage': {
      duplicates(clue.cells, values, 'cage', out);
      if (clue.sum == null) return;
      const filled = clue.cells.filter((c) => v(c));
      const s = filled.reduce((a, c) => a + v(c), 0);
      if (s > clue.sum || (filled.length === clue.cells.length && s !== clue.sum)) {
        out.push({ cells: filled, rule: 'cage' });
      }
      return;
    }
    case 'renban': {
      duplicates(clue.cells, values, 'renban', out);
      const filled = clue.cells.filter((c) => v(c));
      if (filled.length < 2) return;
      const ds = filled.map(v);
      if (Math.max(...ds) - Math.min(...ds) > clue.cells.length - 1) out.push({ cells: filled, rule: 'renban' });
      return;
    }
    case 'whisper': {
      const cs = clue.cells;
      for (let i = 0; i + 1 < cs.length; i++) {
        const a = v(cs[i]), b = v(cs[i + 1]);
        if (a && b && Math.abs(a - b) < clue.minDiff) out.push({ cells: [cs[i], cs[i + 1]], rule: 'whisper' });
      }
      return;
    }
    case 'kropki': {
      const a = v(clue.a), b = v(clue.b);
      if (!a || !b) return;
      const ok = clue.color === 'white' ? Math.abs(a - b) === 1 : isDouble(a, b);
      if (!ok) out.push({ cells: [clue.a, clue.b], rule: 'kropki' });
      return;
    }
    case 'xv': {
      const a = v(clue.a), b = v(clue.b);
      if (a && b && a + b !== clue.sum) out.push({ cells: [clue.a, clue.b], rule: 'xv' });
      return;
    }
    default:
      return;
  }
}

/** Rule breaks among filled cells. values is the full grid (givens plus entries). */
export function findConflicts(p: Puzzle, values: Digit[]): Conflict[] {
  const out: Conflict[] = [];
  const n = p.size;
  const N = n * n;
  const rows: CellIndex[][] = Array.from({ length: n }, () => []);
  const cols: CellIndex[][] = Array.from({ length: n }, () => []);
  const boxes = new Map<number, CellIndex[]>();
  const useRegions = !!p.regions && p.regions.length === N;
  for (let i = 0; i < N; i++) {
    rows[Math.floor(i / n)].push(i);
    cols[i % n].push(i);
    const b = useRegions ? p.regions![i] : boxIndex(n, p.boxW, p.boxH, i);
    const list = boxes.get(b);
    if (list) list.push(i);
    else boxes.set(b, [i]);
  }
  for (const cells of rows) duplicates(cells, values, 'row', out);
  for (const cells of cols) duplicates(cells, values, 'column', out);
  for (const cells of boxes.values()) duplicates(cells, values, useRegions ? 'region' : 'box', out);
  for (const clue of p.clues) {
    if (clue.kind === 'diagonal') {
      duplicates(Array.from({ length: n }, (_, i) => i * n + i), values, 'diagonal', out);
      duplicates(Array.from({ length: n }, (_, i) => i * n + (n - 1 - i)), values, 'diagonal', out);
    } else if (clue.kind === 'antiKnight') {
      for (let a = 0; a < N; a++) {
        if (!values[a]) continue;
        for (const b of knightCells(n, a)) if (b > a && values[b] === values[a]) out.push({ cells: [a, b], rule: 'antiKnight' });
      }
    } else {
      clueConflicts(clue, values, n, out);
    }
  }
  if (p.negativeKropki) {
    const dotted = new Set<string>();
    for (const clue of p.clues) if (clue.kind === 'kropki') dotted.add(`${Math.min(clue.a, clue.b)}:${Math.max(clue.a, clue.b)}`);
    for (let a = 0; a < N; a++) {
      const r = Math.floor(a / n), c = a % n;
      for (const b of [c + 1 < n ? a + 1 : -1, r + 1 < n ? a + n : -1]) {
        if (b < 0 || dotted.has(`${a}:${b}`)) continue;
        const x = values[a], y = values[b];
        if (x && y && (Math.abs(x - y) === 1 || isDouble(x, y))) out.push({ cells: [a, b], rule: 'kropki' });
      }
    }
  }
  return out;
}

/** True when a clue holds for a complete grid. */
export function clueHolds(clue: Clue, grid: Digit[], n: number): boolean {
  const out: Conflict[] = [];
  if (clue.kind === 'diagonal') {
    for (const cells of [Array.from({ length: n }, (_, i) => i * n + i), Array.from({ length: n }, (_, i) => i * n + (n - 1 - i))]) {
      if (new Set(cells.map((c) => grid[c])).size !== n) return false;
    }
    return true;
  }
  if (clue.kind === 'antiKnight') {
    for (let a = 0; a < n * n; a++) for (const b of knightCells(n, a)) if (grid[a] === grid[b]) return false;
    return true;
  }
  clueConflicts(clue, grid, n, out);
  return out.length === 0;
}
