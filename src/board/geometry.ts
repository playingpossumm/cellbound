// Board geometry in board pixels. Every layer draws in a 0..px square; the
// SVG viewBox scales it to the rendered size.
import type { CellIndex, Puzzle } from '../engine/types';
import type { BoardGeometry } from '../themes/types';
import { regionOf } from '../game/logic';

/** Cell edge in board pixels, the same for every size so clue proportions stay put. */
export const CELL_PX = 60;

export function makeGeometry(p: Pick<Puzzle, 'size' | 'boxW' | 'boxH' | 'regions'>): BoardGeometry {
  const size = p.size;
  const cell = CELL_PX;
  return {
    size,
    boxW: p.boxW,
    boxH: p.boxH,
    cell,
    px: size * cell,
    center(i: CellIndex): [number, number] {
      return [(i % size) * cell + cell / 2, Math.floor(i / size) * cell + cell / 2];
    },
    regionOf(i: CellIndex): number {
      return regionOf(p, i);
    },
  };
}

/** Grid lines as path data: thin lines inside regions, thick lines between them. */
export function gridPaths(geo: BoardGeometry): { thin: string; thick: string } {
  const { size: n, cell } = geo;
  let thin = '';
  let thick = '';
  // Vertical lines between column c-1 and c, merged into runs of the same weight.
  for (let c = 1; c < n; c++) {
    let start = 0;
    let kind = geo.regionOf(c - 1) !== geo.regionOf(c);
    for (let r = 1; r <= n; r++) {
      const k = r < n ? geo.regionOf(r * n + c - 1) !== geo.regionOf(r * n + c) : !kind;
      if (r === n || k !== kind) {
        const seg = `M${c * cell} ${start * cell}V${r * cell}`;
        if (kind) thick += seg;
        else thin += seg;
        start = r;
        kind = k;
      }
    }
  }
  for (let r = 1; r < n; r++) {
    let start = 0;
    let kind = geo.regionOf((r - 1) * n) !== geo.regionOf(r * n);
    for (let c = 1; c <= n; c++) {
      const k = c < n ? geo.regionOf((r - 1) * n + c) !== geo.regionOf(r * n + c) : !kind;
      if (c === n || k !== kind) {
        const seg = `M${start * cell} ${r * cell}H${c * cell}`;
        if (kind) thick += seg;
        else thin += seg;
        start = c;
        kind = k;
      }
    }
  }
  return { thin, thick };
}

/** Inset outline of a set of cells (a cage). Collinear pieces are merged so dashes run on. */
export function cagePath(cells: CellIndex[], n: number, cell: number, d: number): string {
  const set = new Set(cells);
  const has = (r: number, c: number) => r >= 0 && c >= 0 && r < n && c < n && set.has(r * n + c);
  // Horizontal pieces as [y, xa, xb]; vertical pieces as [x, ya, yb].
  const hs: [number, number, number][] = [];
  const vs: [number, number, number][] = [];
  for (const i of cells) {
    const r = Math.floor(i / n);
    const c = i % n;
    const x0 = c * cell;
    const y0 = r * cell;
    const x1 = x0 + cell;
    const y1 = y0 + cell;
    if (!has(r - 1, c)) {
      const xa = !has(r, c - 1) ? x0 + d : has(r - 1, c - 1) ? x0 - d : x0;
      const xb = !has(r, c + 1) ? x1 - d : has(r - 1, c + 1) ? x1 + d : x1;
      hs.push([y0 + d, xa, xb]);
    }
    if (!has(r + 1, c)) {
      const xa = !has(r, c - 1) ? x0 + d : has(r + 1, c - 1) ? x0 - d : x0;
      const xb = !has(r, c + 1) ? x1 - d : has(r + 1, c + 1) ? x1 + d : x1;
      hs.push([y1 - d, xa, xb]);
    }
    if (!has(r, c - 1)) {
      const ya = !has(r - 1, c) ? y0 + d : has(r - 1, c - 1) ? y0 - d : y0;
      const yb = !has(r + 1, c) ? y1 - d : has(r + 1, c - 1) ? y1 + d : y1;
      vs.push([x0 + d, ya, yb]);
    }
    if (!has(r, c + 1)) {
      const ya = !has(r - 1, c) ? y0 + d : has(r - 1, c + 1) ? y0 - d : y0;
      const yb = !has(r + 1, c) ? y1 - d : has(r + 1, c + 1) ? y1 + d : y1;
      vs.push([x1 - d, ya, yb]);
    }
  }
  const merge = (list: [number, number, number][]) => {
    list.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const out: [number, number, number][] = [];
    for (const seg of list) {
      const last = out[out.length - 1];
      if (last && last[0] === seg[0] && last[2] === seg[1]) last[2] = seg[2];
      else out.push([...seg]);
    }
    return out;
  };
  const r = (v: number) => Math.round(v * 100) / 100;
  let path = '';
  for (const [y, xa, xb] of merge(hs)) path += `M${r(xa)} ${r(y)}H${r(xb)}`;
  for (const [x, ya, yb] of merge(vs)) path += `M${r(x)} ${r(ya)}V${r(yb)}`;
  return path;
}

/** Polyline through cell centres. */
export function linePath(geo: BoardGeometry, cells: CellIndex[]): string {
  return cells.map((i, k) => `${k ? 'L' : 'M'}${geo.center(i)[0]} ${geo.center(i)[1]}`).join('');
}

/** Arrow shaft from the circle edge through the path, and its head. */
export function arrowPaths(geo: BoardGeometry, circle: CellIndex, path: CellIndex[], ringR: number): { shaft: string; head: string } {
  const pts = [circle, ...path].map((i) => geo.center(i));
  if (pts.length < 2) return { shaft: '', head: '' };
  const [cx, cy] = pts[0];
  const [nx, ny] = pts[1];
  const len0 = Math.hypot(nx - cx, ny - cy) || 1;
  const sx = cx + ((nx - cx) / len0) * ringR;
  const sy = cy + ((ny - cy) / len0) * ringR;
  const [lx, ly] = pts[pts.length - 1];
  const [px, py] = pts[pts.length - 2];
  const len = Math.hypot(lx - px, ly - py) || 1;
  const ux = (lx - px) / len;
  const uy = (ly - py) / len;
  const ex = lx + ux * 4;
  const ey = ly + uy * 4;
  const back = 11;
  const wide = 9;
  const r = (v: number) => Math.round(v * 10) / 10;
  let shaft = `M${r(sx)} ${r(sy)}`;
  for (let k = 1; k < pts.length - 1; k++) shaft += `L${pts[k][0]} ${pts[k][1]}`;
  shaft += `L${r(ex)} ${r(ey)}`;
  const head = `M${r(ex - ux * back - uy * wide)} ${r(ey - uy * back + ux * wide)}L${r(ex)} ${r(ey)}L${r(ex - ux * back + uy * wide)} ${r(ey - uy * back - ux * wide)}`;
  return { shaft, head };
}

/** Midpoint of the edge between two orthogonal neighbours. */
export function edgeMid(geo: BoardGeometry, a: CellIndex, b: CellIndex): [number, number] {
  const [ax, ay] = geo.center(a);
  const [bx, by] = geo.center(b);
  return [(ax + bx) / 2, (ay + by) / 2];
}
