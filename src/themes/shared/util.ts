// Small helpers shared by the theme components.
import type { CSSProperties } from 'react';

export type Pt = [number, number];

/** Round to one decimal, enough for SVG paths. */
export const r1 = (n: number): number => Math.round(n * 10) / 10;

export function polyline(points: Pt[], close = false): string {
  if (points.length === 0) return '';
  return (
    'M' + points.map(([x, y]) => `${r1(x)} ${r1(y)}`).join('L') + (close ? 'Z' : '')
  );
}

/** Park-Miller generator, same family the studies used, so layouts are stable. */
export function rng(seed: number): () => number {
  let s = Math.floor(seed) % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** CSS custom properties in a style object. */
export function cssVars(vars: Record<string, string | number>): CSSProperties {
  return vars as unknown as CSSProperties;
}

export function unit(dx: number, dy: number): Pt {
  const l = Math.hypot(dx, dy) || 1;
  return [dx / l, dy / l];
}

export function rotate([x, y]: Pt, deg: number): Pt {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [x * c - y * s, x * s + y * c];
}

/** A clue is drawn unless every one of its cells is hidden by fog. */
export function anyVisible(cells: number[], hidden?: boolean[]): boolean {
  if (!hidden) return true;
  return cells.some((c) => !hidden[c]);
}

/** Wavy line along a polyline: alternating quadratic arcs of the given wavelength. */
export function wavePath(points: Pt[], amp: number, wavelength: number): string {
  if (points.length < 2) return '';
  let d = `M${r1(points[0][0])} ${r1(points[0][1])}`;
  let side = 1;
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    const len = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(2, Math.round(len / (wavelength / 2)));
    const [ux, uy] = unit(x1 - x0, y1 - y0);
    const nx = -uy;
    const ny = ux;
    for (let k = 0; k < n; k++) {
      const t0 = k / n;
      const t1 = (k + 1) / n;
      const tm = (t0 + t1) / 2;
      const cx = x0 + (x1 - x0) * tm + nx * amp * 2 * side;
      const cy = y0 + (y1 - y0) * tm + ny * amp * 2 * side;
      d += `Q${r1(cx)} ${r1(cy)} ${r1(x0 + (x1 - x0) * t1)} ${r1(y0 + (y1 - y0) * t1)}`;
      side = -side;
    }
  }
  return d;
}

/**
 * Inset outline of a set of cells (a cage), as closed loops of corner points.
 * Boundary edges are traced with the inside on the right, then every corner moves
 * inward by `inset`. Cells are addressed by row-major index on an n by n board;
 * u is the cell edge.
 */
export function cellsLoops(cells: number[], n: number, u: number, inset: number): Pt[][] {
  const set = new Set(cells);
  const has = (r: number, c: number): boolean => r >= 0 && c >= 0 && r < n && c < n && set.has(r * n + c);
  type Edge = { from: Pt; to: Pt; used: boolean };
  const edges = new Map<string, Edge[]>();
  const key = (p: Pt): string => `${p[0]},${p[1]}`;
  const add = (from: Pt, to: Pt): void => {
    const k = key(from);
    const list = edges.get(k);
    const e = { from, to, used: false };
    if (list) list.push(e);
    else edges.set(k, [e]);
  };
  for (const i of cells) {
    const r = Math.floor(i / n);
    const c = i % n;
    if (!has(r - 1, c)) add([c, r], [c + 1, r]);
    if (!has(r, c + 1)) add([c + 1, r], [c + 1, r + 1]);
    if (!has(r + 1, c)) add([c + 1, r + 1], [c, r + 1]);
    if (!has(r, c - 1)) add([c, r + 1], [c, r]);
  }
  const loops: Pt[][] = [];
  for (const list of edges.values()) {
    for (const first of list) {
      if (first.used) continue;
      const loop: Pt[] = [];
      let cur: Edge | undefined = first;
      let guard = 0;
      while (cur && !cur.used && guard++ < 4000) {
        cur.used = true;
        loop.push(cur.from);
        const next: Edge[] | undefined = edges.get(key(cur.to));
        cur = next?.find((e) => !e.used);
      }
      // Drop collinear vertices.
      const m = loop.length;
      const keep: Pt[] = [];
      for (let k = 0; k < m; k++) {
        const a = loop[(k + m - 1) % m];
        const b = loop[k];
        const c = loop[(k + 1) % m];
        const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
        if (cross !== 0) keep.push(b);
      }
      const pts: Pt[] = keep.map((v, k) => {
        const a = keep[(k + keep.length - 1) % keep.length];
        const c = keep[(k + 1) % keep.length];
        const [ix, iy] = unit(v[0] - a[0], v[1] - a[1]);
        const [ox, oy] = unit(c[0] - v[0], c[1] - v[1]);
        // Right-hand normal of a direction (dx, dy) in screen space is (-dy, dx).
        const nx = -iy + -oy;
        const ny = ix + ox;
        return [v[0] * u + nx * inset, v[1] * u + ny * inset] as Pt;
      });
      if (pts.length > 2) loops.push(pts);
    }
  }
  return loops;
}

/** The same outline as an SVG path. */
export function cellsOutline(cells: number[], n: number, u: number, inset: number): string {
  return cellsLoops(cells, n, u, inset)
    .map((l) => polyline(l, true))
    .join('');
}

/** Drop points that sit on a straight run, so a chain of letters is spaced as one line. */
export function simplify(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < pts.length; i++) {
    if (i > 0 && i < pts.length - 1) {
      const [ax, ay] = unit(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      const [bx, by] = unit(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
      if (Math.abs(ax - bx) < 1e-6 && Math.abs(ay - by) < 1e-6) continue;
    }
    out.push(pts[i]);
  }
  return out;
}
