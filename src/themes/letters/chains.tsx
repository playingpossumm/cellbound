// Clues as chains of letters that spell the rule along each line: RISING up a
// thermo, SUM around an arrow circle and ADD along its shaft, RUN along a renban,
// APART along a whisper, dots around a cage with its total, and so on.
import { useMemo, type ReactNode } from 'react';
import type { Clue } from '../../engine/types';
import type { BoardGeometry, ClueLayerProps } from '../types';
import { anyVisible, cellsLoops, cssVars, r1, simplify, unit } from '../shared/util';
import type { Pt } from '../shared/util';

interface Glyph {
  ch: string;
  x: number;
  y: number;
  rot: number;
  cls?: 'big' | 'lab';
  anchor?: 'start';
}

/** Letters along a polyline, one every `step`, the word repeating. Returns how many it placed. */
function walk(line: Pt[], word: string, step: number, out: Glyph[]): number {
  const pts = simplify(line);
  let k = 0;
  for (let a = 0; a < pts.length - 1; a++) {
    const [x0, y0] = pts[a];
    const [x1, y1] = pts[a + 1];
    const len = Math.hypot(x1 - x0, y1 - y0);
    const ang = (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI;
    const n = Math.max(1, Math.round(len / step));
    for (let j = 0; j < n; j++) {
      const f = j / n;
      out.push({ ch: word.charAt(k % word.length), x: x0 + (x1 - x0) * f, y: y0 + (y1 - y0) * f, rot: ang });
      k++;
    }
  }
  return k;
}

/** Letters around a circle, upright toward the outside. */
function ring(cx: number, cy: number, r: number, word: string, n: number, out: Glyph[]): void {
  for (let j = 0; j < n; j++) {
    const a = -Math.PI / 2 + (j * 2 * Math.PI) / n;
    out.push({
      ch: word.charAt(j % word.length),
      x: cx + r * Math.cos(a),
      y: cy + r * Math.sin(a),
      rot: (a * 180) / Math.PI + 90,
    });
  }
}

const KNIGHT: Pt[] = [
  [-2, -1], [-2, 1], [2, -1], [2, 1], [-1, -2], [1, -2], [-1, 2], [1, 2],
];

interface Chain {
  glyphs: Glyph[];
  /** Plain circles that stand in for the dot glyphs. */
  dots?: { x: number; y: number; black: boolean }[];
}

function chainFor(c: Clue, geo: BoardGeometry): Chain {
  const u = geo.cell;
  const step = u / 6;
  const out: Glyph[] = [];
  switch (c.kind) {
    case 'thermo': {
      const p = c.cells.map((i) => geo.center(i));
      const [bx, by] = p[0];
      const [dx, dy] = unit(p[1][0] - bx, p[1][1] - by);
      ring(bx, by, u * 0.25, 'THERMO·', Math.round((2 * Math.PI * u * 0.25) / (step * 0.68)), out);
      walk([[bx + dx * u * 0.29, by + dy * u * 0.29], ...p.slice(1)], 'RISING·', step, out);
      return { glyphs: out };
    }
    case 'arrow': {
      const [cx, cy] = geo.center(c.circle);
      const centres = c.path.map((i) => geo.center(i));
      const first = centres[0];
      const [dx, dy] = unit(first[0] - cx, first[1] - cy);
      ring(cx, cy, u * 0.367, 'SUM·', Math.round((2 * Math.PI * u * 0.367) / (step * 0.86)), out);
      const pts: Pt[] = [[cx + dx * u * 0.4, cy + dy * u * 0.4], ...centres];
      const last = pts[pts.length - 1];
      const prev = pts[pts.length - 2];
      const [ex, ey] = unit(last[0] - prev[0], last[1] - prev[1]);
      pts[pts.length - 1] = [last[0] - ex * u * 0.067, last[1] - ey * u * 0.067];
      walk(pts, 'ADD·', step, out);
      out.push({
        ch: '>',
        x: last[0] + ex * u * 0.033,
        y: last[1] + ey * u * 0.033,
        rot: (Math.atan2(ey, ex) * 180) / Math.PI,
        cls: 'big',
      });
      return { glyphs: out };
    }
    case 'cage': {
      const n = geo.size;
      const inset = u * 0.083;
      for (const loop of cellsLoops(c.cells, n, u, inset)) walk([...loop, loop[0]], '·', u * 0.117, out);
      const first = Math.min(...c.cells);
      out.push({
        ch: `Σ${c.sum === null ? '?' : c.sum}`,
        x: (first % n) * u + u * 0.2,
        y: Math.floor(first / n) * u + u * 0.27,
        rot: 0,
        cls: 'lab',
        anchor: 'start',
      });
      return { glyphs: out };
    }
    case 'renban': {
      const p = c.cells.map((i) => geo.center(i));
      const placed = walk(p, 'RUN·', step, out);
      const last = p[p.length - 1];
      const prev = p[p.length - 2] ?? last;
      // The last cell carries the next letter of the word, so the chain never reads RUNN.
      out.push({ ch: 'RUN·'.charAt(placed % 4), x: last[0], y: last[1], rot: (Math.atan2(last[1] - prev[1], last[0] - prev[0]) * 180) / Math.PI });
      return { glyphs: out };
    }
    case 'whisper': {
      const p = c.cells.map((i) => geo.center(i));
      walk(p, 'APART·', step, out);
      const [x, y] = p[0];
      out.push({ ch: `≥${c.minDiff}`, x: x - u * 0.32, y: y - u * 0.33, rot: 0, cls: 'lab', anchor: 'start' });
      return { glyphs: out };
    }
    case 'kropki': {
      const [ax, ay] = geo.center(c.a);
      const [bx, by] = geo.center(c.b);
      return { glyphs: [], dots: [{ x: (ax + bx) / 2, y: (ay + by) / 2, black: c.color === 'black' }] };
    }
    case 'xv': {
      const [ax, ay] = geo.center(c.a);
      const [bx, by] = geo.center(c.b);
      out.push({ ch: c.sum === 10 ? 'X' : 'V', x: (ax + bx) / 2, y: (ay + by) / 2, rot: 0, cls: 'big' });
      return { glyphs: out };
    }
    case 'diagonal': {
      const px = geo.px;
      walk([[0, 0], [px, px]], 'DIAGONAL·', step, out);
      walk([[px, 0], [0, px]], 'DIAGONAL·', step, out);
      return { glyphs: out };
    }
    case 'antiKnight': {
      const n = geo.size;
      const m = Math.floor((n - 1) / 2);
      const [cx, cy] = geo.center(m * n + m);
      for (const [dr, dc] of KNIGHT) {
        const r = m + dr;
        const cc = m + dc;
        if (r < 0 || cc < 0 || r >= n || cc >= n) continue;
        const long = Math.abs(dr) === 2;
        const corner: Pt = long ? [cx, cy + dr * u] : [cx + dc * u, cy];
        const end: Pt = [cx + dc * u, cy + dr * u];
        walk([[cx, cy], corner, end], 'KNIGHT·', step, out);
        out.push({ ch: 'N', x: end[0], y: end[1], rot: 0, cls: 'big' });
      }
      return { glyphs: out };
    }
  }
}

function cellsOf(c: Clue): number[] {
  switch (c.kind) {
    case 'thermo':
    case 'cage':
    case 'renban':
    case 'whisper':
      return c.cells;
    case 'arrow':
      return [c.circle, ...c.path];
    case 'kropki':
    case 'xv':
      return [c.a, c.b];
    default:
      return [];
  }
}

/**
 * True when a letter sits on the middle of a cell that holds a digit. Those letters recede, so a
 * full 9x9 reads as digits first and the spelled rules stay legible between them. Totals and
 * labels sit in a cell's corner and never recede.
 */
function underDigit(g: Glyph, geo: BoardGeometry, values: number[] | undefined): boolean {
  if (!values || g.cls === 'lab') return false;
  const u = geo.cell;
  const c = Math.min(geo.size - 1, Math.max(0, Math.floor(g.x / u)));
  const r = Math.min(geo.size - 1, Math.max(0, Math.floor(g.y / u)));
  if (!values[r * geo.size + c]) return false;
  return Math.abs(g.x - (c + 0.5) * u) < u * 0.3 && Math.abs(g.y - (r + 0.5) * u) < u * 0.34;
}

export function LettersClueLayer({ puzzle, geo, lit, hidden, values }: ClueLayerProps): ReactNode {
  // The chains depend only on the clues and the board; which letters recede changes with the digits.
  const chains = useMemo(() => puzzle.clues.map((c) => chainFor(c, geo)), [puzzle, geo]);
  return (
    <g className="cb-clue-root" style={cssVars({ '--u': `${geo.cell}px` })}>
      {puzzle.clues.map((c, k) => {
        if (c.kind === 'antiKnight' && lit !== 'antiKnight') return null;
        if (c.kind !== 'diagonal' && c.kind !== 'antiKnight' && !anyVisible(cellsOf(c), hidden)) return null;
        const { glyphs, dots } = chains[k];
        return (
          <g key={k} className={'cb-clue' + (lit === c.kind ? ' is-lit' : '')} data-kind={c.kind}>
            {glyphs.map((g, i) => (
              <text
                key={i}
                className={'lt-cg' + (g.cls ? ` lt-${g.cls}` : '') + (underDigit(g, geo, values) ? ' lt-under' : '')}
                transform={`translate(${r1(g.x)} ${r1(g.y)}) rotate(${Math.round(g.rot)})`}
                textAnchor={g.anchor ?? 'middle'}
                dominantBaseline="central"
              >
                {g.ch}
              </text>
            ))}
            {dots?.map((d, i) => (
              <circle key={i} className={`lt-dot${d.black ? ' black' : ' white'}`} cx={r1(d.x)} cy={r1(d.y)} r={geo.cell * 0.055} />
            ))}
          </g>
        );
      })}
    </g>
  );
}
