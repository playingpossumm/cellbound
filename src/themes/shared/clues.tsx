// One clue renderer for the themes that draw with CSS. It returns SVG children
// (the board wraps them in svg.cb-clues), emits the class vocabulary of the spec
// (section 5) and sets --u, the cell edge in board units, on its root group, so a
// theme.css can size anything as calc(var(--u) * fraction).
import { useId } from 'react';
import type { ReactNode } from 'react';
import type { Clue, ClueKind } from '../../engine/types';
import type { BoardGeometry, ClueLayerProps } from '../types';
import { anyVisible, cellsOutline, cssVars, polyline, r1, rotate, unit, wavePath } from './util';
import type { Pt } from './util';

export interface ClueOptions {
  /** Thermo lines get a gradient stroke from the bulb to the far end (prism). */
  thermoGradient?: boolean;
  /** Whisper lines are drawn wavy by default; 'line' keeps them straight. */
  whisper?: 'wave' | 'line';
  /** Arrow head: half-angle in degrees, length and tip overshoot as fractions of a cell. */
  head?: { angle: number; len: number; tip: number; shaftBack?: number; soft?: boolean };
}

/** Draw order, back to front. */
const RANK: Record<ClueKind, number> = {
  diagonal: 0,
  antiKnight: 1,
  cage: 2,
  renban: 3,
  whisper: 4,
  thermo: 5,
  arrow: 6,
  xv: 7,
  kropki: 8,
};

const KNIGHT: Pt[] = [
  [-2, -1],
  [-2, 1],
  [2, -1],
  [2, 1],
  [-1, -2],
  [1, -2],
  [-1, 2],
  [1, 2],
];

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

function mid(geo: BoardGeometry, a: number, b: number): Pt {
  const [x0, y0] = geo.center(a);
  const [x1, y1] = geo.center(b);
  return [(x0 + x1) / 2, (y0 + y1) / 2];
}

function Nodes({ geo, cells, diamond }: { geo: BoardGeometry; cells: number[]; diamond?: boolean }): ReactNode {
  return cells.map((i) => {
    const [x, y] = geo.center(i);
    if (diamond) {
      const s = geo.cell * 0.1;
      return (
        <rect
          key={i}
          className="cb-node"
          x={r1(x - s / 2)}
          y={r1(y - s / 2)}
          width={r1(s)}
          height={r1(s)}
          transform={`rotate(45 ${r1(x)} ${r1(y)})`}
        />
      );
    }
    return <circle key={i} className="cb-node" cx={r1(x)} cy={r1(y)} r={2.6} />;
  });
}

function drawClue(c: Clue, geo: BoardGeometry, puzzleSize: number, gradId: string | null, options?: ClueOptions): ReactNode {
  const u = geo.cell;
  switch (c.kind) {
    case 'thermo': {
      const p = c.cells.map((i) => geo.center(i));
      const [bx, by] = p[0];
      return (
        <>
          <path className="cb-line" d={polyline(p)} style={gradId ? { stroke: `url(#${gradId})` } : undefined} />
          <circle className="cb-bulb" cx={r1(bx)} cy={r1(by)} r={u * 0.2} />
          <Nodes geo={geo} cells={c.cells} />
        </>
      );
    }
    case 'arrow': {
      const [cx, cy] = geo.center(c.circle);
      const centres = c.path.map((i) => geo.center(i));
      const first = centres[0] ?? [cx + u, cy];
      const [dx, dy] = unit(first[0] - cx, first[1] - cy);
      const R = u * 0.4;
      const start: Pt = [cx + dx * R, cy + dy * R];
      const pts: Pt[] = [start, ...centres];
      const last = pts[pts.length - 1];
      const prev = pts[pts.length - 2] ?? start;
      const dir = unit(last[0] - prev[0], last[1] - prev[1]);
      const H = options?.head ?? { angle: 32, len: 0.22, tip: 0.1 };
      const tip: Pt = [last[0] + dir[0] * u * H.tip, last[1] + dir[1] * u * H.tip];
      const back: Pt = [-dir[0], -dir[1]];
      const w1 = rotate(back, H.angle);
      const w2 = rotate(back, -H.angle);
      const L = u * H.len;
      const a: Pt = [tip[0] + w1[0] * L, tip[1] + w1[1] * L];
      const b: Pt = [tip[0] + w2[0] * L, tip[1] + w2[1] * L];
      // The shaft runs on to the tip, or stops inside a solid head.
      const end: Pt = [tip[0] - dir[0] * u * (H.shaftBack ?? 0), tip[1] - dir[1] * u * (H.shaftBack ?? 0)];
      const shaft: Pt[] = [...pts.slice(0, -1), end];
      // A soft head bows its two strokes a little toward the shaft, like a brush.
      const bow = (p: Pt): Pt => {
        const mx = (p[0] + tip[0]) / 2;
        const my = (p[1] + tip[1]) / 2;
        const along = (mx - tip[0]) * dir[0] + (my - tip[1]) * dir[1];
        const ax = tip[0] + dir[0] * along;
        const ay = tip[1] + dir[1] * along;
        return [mx + (ax - mx) * 0.2, my + (ay - my) * 0.2];
      };
      const head = H.soft
        ? `M${r1(a[0])} ${r1(a[1])}Q${r1(bow(a)[0])} ${r1(bow(a)[1])} ${r1(tip[0])} ${r1(tip[1])}Q${r1(bow(b)[0])} ${r1(bow(b)[1])} ${r1(b[0])} ${r1(b[1])}`
        : polyline([a, tip, b]);
      return (
        <>
          <circle className="cb-ring" cx={r1(cx)} cy={r1(cy)} r={R} />
          <path className="cb-shaft" d={polyline(shaft)} />
          <path className="cb-head" d={head} />
        </>
      );
    }
    case 'cage': {
      const n = puzzleSize;
      const first = Math.min(...c.cells);
      const fr = Math.floor(first / n);
      const fc = first % n;
      const inset = u * 0.07;
      const x0 = fc * u + inset;
      const y0 = fr * u + inset;
      const label = c.sum === null ? '?' : String(c.sum);
      // Small labels grow a little on 9x9, where cells are drawn smaller.
      const k = puzzleSize >= 9 ? 1.2 : 1;
      const w = u * (0.1 + 0.13 * label.length) * k;
      return (
        <>
          <path className="cb-cage-line" d={cellsOutline(c.cells, n, u, inset)} />
          <rect className="cb-cage-pat" x={r1(x0 - u * 0.02)} y={r1(y0 - u * 0.03)} width={r1(w)} height={r1(u * 0.28 * k)} />
          <text className="cb-cage-sum" x={r1(x0 + u * 0.03)} y={r1(y0 + u * 0.19 * k)}>
            {label}
          </text>
        </>
      );
    }
    case 'renban': {
      const p = c.cells.map((i) => geo.center(i));
      return (
        <>
          <path className="cb-line" d={polyline(p)} />
          <path className="cb-core" d={polyline(p)} />
          <Nodes geo={geo} cells={c.cells} diamond />
        </>
      );
    }
    case 'whisper': {
      const p = c.cells.map((i) => geo.center(i));
      return <path className="cb-line" d={options?.whisper === 'line' ? polyline(p) : wavePath(p, u * 0.028, u * 0.4)} />;
    }
    case 'kropki': {
      const [x, y] = mid(geo, c.a, c.b);
      return <circle className={`cb-dot ${c.color}`} cx={r1(x)} cy={r1(y)} r={u * 0.1} />;
    }
    case 'xv': {
      const [x, y] = mid(geo, c.a, c.b);
      const s = u * 0.34 * (geo.size >= 9 ? 1.2 : 1);
      return (
        <>
          <rect className="cb-xv-pat" x={r1(x - s / 2)} y={r1(y - s / 2)} width={r1(s)} height={r1(s)} />
          <text className="cb-xv" x={r1(x)} y={r1(y)} textAnchor="middle" dominantBaseline="central">
            {c.sum === 10 ? 'X' : 'V'}
          </text>
        </>
      );
    }
    case 'diagonal': {
      const px = geo.px;
      return <path className="cb-diag" d={`M0 0L${px} ${px}M${px} 0L0 ${px}`} />;
    }
    case 'antiKnight': {
      const n = geo.size;
      const mr = Math.floor((n - 1) / 2);
      const mc = Math.floor((n - 1) / 2);
      const [cx, cy] = geo.center(mr * n + mc);
      let d = '';
      const ends: Pt[] = [];
      for (const [dr, dc] of KNIGHT) {
        const r = mr + dr;
        const cc = mc + dc;
        if (r < 0 || cc < 0 || r >= n || cc >= n) continue;
        const long = Math.abs(dr) === 2;
        const corner: Pt = long ? [cx, cy + dr * u] : [cx + dc * u, cy];
        const end: Pt = [cx + dc * u, cy + dr * u];
        d += polyline([[cx, cy], corner, end]);
        ends.push(end);
      }
      return (
        <>
          <path className="cb-knight" d={d} />
          {ends.map(([x, y], k) => (
            <circle key={k} className="cb-knight-end" cx={r1(x)} cy={r1(y)} r={u * 0.07} />
          ))}
        </>
      );
    }
  }
}

/** Gradient for a thermo, running from its bulb to its far end. */
function ThermoGradient({ id, geo, cells }: { id: string; geo: BoardGeometry; cells: number[] }): ReactNode {
  const [x1, y1] = geo.center(cells[0]);
  let [x2, y2] = geo.center(cells[cells.length - 1]);
  if (x1 === x2 && y1 === y2) x2 += 0.01;
  return (
    <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={x1} y1={y1} x2={x2} y2={y2}>
      <stop className="cb-s1" offset="0" />
      <stop className="cb-s2" offset="0.34" />
      <stop className="cb-s3" offset="0.67" />
      <stop className="cb-s4" offset="1" />
    </linearGradient>
  );
}

export function ClueSvg(props: ClueLayerProps & { options?: ClueOptions }): ReactNode {
  const { puzzle, geo, lit, hidden, options } = props;
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const items = puzzle.clues
    .map((c, k) => ({ c, k }))
    .filter(({ c }) => c.kind === 'diagonal' || c.kind === 'antiKnight' || anyVisible(cellsOf(c), hidden))
    .sort((a, b) => RANK[a.c.kind] - RANK[b.c.kind] || a.k - b.k);
  const grads = options?.thermoGradient
    ? items.filter(({ c }) => c.kind === 'thermo')
    : [];
  return (
    <g className="cb-clue-root" style={cssVars({ '--u': `${geo.cell}px`, '--k': geo.size >= 9 ? 1.2 : 1 })}>
      {grads.length > 0 && (
        <defs>
          {grads.map(({ c, k }) =>
            c.kind === 'thermo' ? <ThermoGradient key={k} id={`cbg${uid}${k}`} geo={geo} cells={c.cells} /> : null,
          )}
        </defs>
      )}
      {items.map(({ c, k }) => (
        <g
          key={k}
          className={'cb-clue' + (lit === c.kind ? ' is-lit' : '')}
          data-kind={c.kind}
        >
          {drawClue(c, geo, puzzle.size, options?.thermoGradient && c.kind === 'thermo' ? `cbg${uid}${k}` : null, options)}
        </g>
      ))}
    </g>
  );
}
