// A small board for the lessons. It follows the app's board vocabulary (thin and thick grid
// lines, frame, clue groups, digits) and takes every colour from the --cb-* variables.
import type { ReactNode } from 'react';
import type { Clue } from '../../engine/types';
import type { Illustration } from './lessons';

const CELL = 48;

type Pt = [number, number];

const center = (n: number, i: number): Pt => [(i % n) * CELL + CELL / 2, Math.floor(i / n) * CELL + CELL / 2];
const pts = (p: Pt[]) => p.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

/** Dashed outline drawn just inside a cage, with its total in the top left corner. */
function Cage({ cells, sum, n }: { cells: number[]; sum: number | null; n: number }) {
  const inset = 4;
  const inCage = (r: number, c: number) => r >= 0 && c >= 0 && r < n && c < n && cells.includes(r * n + c);
  const segs: string[] = [];
  const sides = [
    { dr: -1, dc: 0, tr: 0, tc: 1 }, // top edge, runs left to right
    { dr: 0, dc: 1, tr: 1, tc: 0 }, // right edge, runs top to bottom
    { dr: 1, dc: 0, tr: 0, tc: -1 }, // bottom edge, runs right to left
    { dr: 0, dc: -1, tr: -1, tc: 0 }, // left edge, runs bottom to top
  ];
  for (const i of cells) {
    const r = Math.floor(i / n);
    const c = i % n;
    for (const s of sides) {
      if (inCage(r + s.dr, c + s.dc)) continue; // not a boundary edge
      // Corner points of the cell along this side, in cell units: the edge runs from "a" to "b".
      const corner = (end: 0 | 1): Pt => {
        // Cell corner: start of the edge is the corner reached by stepping back along -t from the middle, rotated to the outward side.
        const mx = c + 0.5 + s.dc * 0.5;
        const my = r + 0.5 + s.dr * 0.5;
        const k = end === 0 ? -0.5 : 0.5;
        return [mx + s.tc * k, my + s.tr * k];
      };
      const end = (e: 0 | 1): Pt => {
        const [cx, cy] = corner(e);
        const dir = e === 0 ? -1 : 1;
        // Neighbour beside this cell along the edge, and the one diagonally outward from it.
        const br = r + s.tr * dir;
        const bc = c + s.tc * dir;
        const beside = inCage(br, bc);
        const diagonal = inCage(br + s.dr, bc + s.dc);
        // Convex corner pulls the end in by the inset, a straight run keeps it, a reflex corner pushes it out.
        const along = !beside ? -inset : diagonal ? inset : 0;
        // Move inward (against the outward normal) and along the edge by `along`.
        return [cx * CELL - s.dc * inset + s.tc * dir * along, cy * CELL - s.dr * inset + s.tr * dir * along];
      };
      const a = end(0);
      const b = end(1);
      segs.push(`M${a[0].toFixed(1)} ${a[1].toFixed(1)}L${b[0].toFixed(1)} ${b[1].toFixed(1)}`);
    }
  }
  const first = Math.min(...cells);
  const [fx, fy] = [(first % n) * CELL, Math.floor(first / n) * CELL];
  return (
    <g className="cb-learn-clue" data-kind="cage">
      <path className="cb-learn-cage-line" d={segs.join('')} />
      {sum !== null && (
        <>
          <rect className="cb-learn-cage-pat" x={fx + inset - 1} y={fy + inset - 1} width={String(sum).length * 8 + 8} height={15} />
          <text className="cb-learn-cage-sum" x={fx + inset + 2} y={fy + inset + 11}>
            {sum}
          </text>
        </>
      )}
    </g>
  );
}

function ClueShape({ clue, n }: { clue: Clue; n: number }): ReactNode {
  switch (clue.kind) {
    case 'thermo': {
      const p = clue.cells.map((i) => center(n, i));
      return (
        <g className="cb-learn-clue" data-kind="thermo">
          <polyline className="cb-learn-thermo-line" points={pts(p)} />
          <circle className="cb-learn-thermo-bulb" cx={p[0][0]} cy={p[0][1]} r={CELL * 0.31} />
        </g>
      );
    }
    case 'arrow': {
      const [cx, cy] = center(n, clue.circle);
      const path = clue.path.map((i) => center(n, i));
      const r = CELL * 0.4;
      const [fx, fy] = path[0];
      const len = Math.hypot(fx - cx, fy - cy) || 1;
      const start: Pt = [cx + ((fx - cx) / len) * r, cy + ((fy - cy) / len) * r];
      const [lx, ly] = path[path.length - 1];
      const [px, py] = path.length > 1 ? path[path.length - 2] : [cx, cy];
      const ang = Math.atan2(ly - py, lx - px);
      const h = CELL * 0.2;
      const head: Pt[] = [
        [lx - h * Math.cos(ang - 0.6), ly - h * Math.sin(ang - 0.6)],
        [lx, ly],
        [lx - h * Math.cos(ang + 0.6), ly - h * Math.sin(ang + 0.6)],
      ];
      return (
        <g className="cb-learn-clue" data-kind="arrow">
          <circle className="cb-learn-ring" cx={cx} cy={cy} r={r} />
          <polyline className="cb-learn-shaft" points={pts([start, ...path])} />
          <polyline className="cb-learn-head" points={pts(head)} />
        </g>
      );
    }
    case 'cage':
      return <Cage cells={clue.cells} sum={clue.sum} n={n} />;
    case 'renban': {
      const p = pts(clue.cells.map((i) => center(n, i)));
      return (
        <g className="cb-learn-clue" data-kind="renban">
          <polyline className="cb-learn-renban-wide" points={p} />
          <polyline className="cb-learn-renban-line" points={p} />
        </g>
      );
    }
    case 'whisper':
      return (
        <g className="cb-learn-clue" data-kind="whisper">
          <polyline className="cb-learn-whisper-line" points={pts(clue.cells.map((i) => center(n, i)))} />
        </g>
      );
    case 'kropki': {
      const [ax, ay] = center(n, clue.a);
      const [bx, by] = center(n, clue.b);
      return (
        <g className="cb-learn-clue" data-kind="kropki">
          <circle className={`cb-learn-dot is-${clue.color}`} cx={(ax + bx) / 2} cy={(ay + by) / 2} r={CELL * 0.14} />
        </g>
      );
    }
    case 'xv': {
      const [ax, ay] = center(n, clue.a);
      const [bx, by] = center(n, clue.b);
      const mx = (ax + bx) / 2;
      const my = (ay + by) / 2;
      return (
        <g className="cb-learn-clue" data-kind="xv">
          <rect className="cb-learn-xv-pat" x={mx - 12} y={my - 12} width={24} height={24} rx={2} />
          <text className="cb-learn-xv" x={mx} y={my + 7}>
            {clue.sum === 10 ? 'X' : 'V'}
          </text>
        </g>
      );
    }
    case 'diagonal': {
      const px = n * CELL;
      return (
        <g className="cb-learn-clue" data-kind="diagonal">
          <path className="cb-learn-diag" d={`M0 0L${px} ${px}M${px} 0L0 ${px}`} />
        </g>
      );
    }
    default:
      return null;
  }
}

/** Cells where a thin line runs through the digit, so the digit gets a halo that breaks the line. */
function lineCells(clues: Clue[]): Set<number> {
  const out = new Set<number>();
  for (const c of clues) {
    if (c.kind === 'renban' || c.kind === 'whisper') c.cells.forEach((i) => out.add(i));
    if (c.kind === 'arrow') c.path.forEach((i) => out.add(i));
  }
  return out;
}

/** A knight's move drawn as an L: along the long side first, then the short one. */
function knightPath(n: number, from: number, to: number): string {
  const [ax, ay] = center(n, from);
  const [bx, by] = center(n, to);
  const longVertical = Math.abs(by - ay) > Math.abs(bx - ax);
  const [kx, ky] = longVertical ? [ax, by] : [bx, ay];
  return `M${ax} ${ay}L${kx} ${ky}L${bx} ${by}`;
}

export function MiniBoard({ art, className }: { art: Illustration; className?: string }) {
  const n = art.size;
  const halo = lineCells(art.clues ?? []);
  const px = n * CELL;
  const boxW = n === 4 ? 2 : 3;
  const boxH = 2;
  const digits: Array<{ i: number; d: number; tone: 'given' | 'mine' }> = [];
  (art.rows ?? []).forEach((r, y) =>
    [...r].forEach((ch, x) => {
      if (ch !== '.') digits.push({ i: y * n + x, d: Number(ch), tone: 'given' });
    }),
  );
  for (const [i, d] of Object.entries(art.mine ?? {})) {
    const k = digits.findIndex((x) => x.i === Number(i));
    if (k >= 0) digits.splice(k, 1);
    digits.push({ i: Number(i), d, tone: 'mine' });
  }
  const cellRect = (i: number, cls: string) => (
    <rect key={`${cls}${i}`} className={cls} x={(i % n) * CELL} y={Math.floor(i / n) * CELL} width={CELL} height={CELL} />
  );
  const vertical: number[] = [];
  const horizontal: number[] = [];
  for (let k = 1; k < n; k++) vertical.push(k);
  for (let k = 1; k < n; k++) horizontal.push(k);
  return (
    <svg
      className={'cb-learn-board' + (className ? ' ' + className : '')}
      data-size={n}
      viewBox={`0 0 ${px} ${px}`}
      role="img"
      aria-label={art.label}
    >
      <rect className="cb-learn-bg" x={0} y={0} width={px} height={px} />
      <rect className="cb-learn-bg-board" x={0} y={0} width={px} height={px} />
      {Array.from({ length: n * n }, (_, i) => cellRect(i, 'cb-learn-tile'))}
      {(art.tint ?? []).map((i) => cellRect(i, 'cb-learn-tint'))}
      {(art.focus ?? []).map((i) => cellRect(i, 'cb-learn-focus'))}
      <g className="cb-learn-clues">
        {(art.clues ?? []).map((c, k) => (
          <ClueShape key={k} clue={c} n={n} />
        ))}
      </g>
      <g className="cb-learn-grid">
        {vertical.map((k) => (
          <line key={`v${k}`} className={k % boxW === 0 ? 'cb-learn-thick' : 'cb-learn-thin'} x1={k * CELL} y1={0} x2={k * CELL} y2={px} />
        ))}
        {horizontal.map((k) => (
          <line key={`h${k}`} className={k % boxH === 0 ? 'cb-learn-thick' : 'cb-learn-thin'} x1={0} y1={k * CELL} x2={px} y2={k * CELL} />
        ))}
        <rect className="cb-learn-frame" x={0} y={0} width={px} height={px} />
      </g>
      {(art.focus ?? []).map((i) => (
        <rect key={`ring${i}`} className="cb-learn-ring-cell" x={(i % n) * CELL + 3} y={Math.floor(i / n) * CELL + 3} width={CELL - 6} height={CELL - 6} />
      ))}
      <g className="cb-learn-digits">
        {digits.map(({ i, d, tone }) => (
          <text key={i} className={`cb-learn-digit is-${tone}` + (halo.has(i) ? ' has-halo' : '')} x={(i % n) * CELL + CELL / 2} y={Math.floor(i / n) * CELL + CELL / 2 + CELL * 0.2}>
            {d}
          </text>
        ))}
      </g>
      <g className="cb-learn-links">
        {(art.links ?? []).map(([a, b]) => (
          <path key={`${a}-${b}`} className="cb-learn-link" d={knightPath(n, a, b)} />
        ))}
      </g>
      <g className="cb-learn-crosses">
        {(art.cross ?? []).map((i) => {
          const x = (i % n) * CELL;
          const y = Math.floor(i / n) * CELL;
          const a = 15;
          return <path key={i} className="cb-learn-cross" d={`M${x + a} ${y + a}L${x + CELL - a} ${y + CELL - a}M${x + CELL - a} ${y + a}L${x + a} ${y + CELL - a}`} />;
        })}
      </g>
    </svg>
  );
}
