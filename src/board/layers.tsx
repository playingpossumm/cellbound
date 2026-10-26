// The grid layer and the default clue layer. They render SVG children; the Board
// wraps them in svg.cb-grid and svg.cb-clues with viewBox 0 0 px px. Themes style
// the grid with CSS, and may replace the clue layer with their own component,
// drawn inside the same wrapper.
import type { ReactNode } from 'react';
import type { Clue } from '../engine/types';
import type { BoardGeometry, ClueLayerProps } from '../themes/types';
import { arrowPaths, cagePath, edgeMid, gridPaths, linePath } from './geometry';

export function GridLayer({ geo }: { geo: BoardGeometry }) {
  const { thin, thick } = gridPaths(geo);
  return (
    <>
      <path className="cb-thin" d={thin} />
      <path className="cb-thick" d={thick} />
      <rect className="cb-frame" x={0} y={0} width={geo.px} height={geo.px} />
    </>
  );
}

/** Cells a clue covers, used to skip clues hidden by fog. */
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

function drawClue(clue: Clue, geo: BoardGeometry): ReactNode {
  const { cell, size: n } = geo;
  // Small labels grow a little on 9x9, where cells are drawn smaller.
  const small = n >= 9 ? 15 : 13;
  switch (clue.kind) {
    case 'thermo': {
      const [bx, by] = geo.center(clue.cells[0]);
      return (
        <>
          <path className="cb-line" d={linePath(geo, clue.cells)} />
          <circle className="cb-bulb" cx={bx} cy={by} r={cell * 0.3} />
          {clue.cells.map((i, k) => {
            const [x, y] = geo.center(i);
            return <circle key={i} className="cb-node" cx={x} cy={y} r={k === 0 ? 3.6 : 2.6} />;
          })}
        </>
      );
    }
    case 'arrow': {
      const ringR = cell * 0.4;
      const [cx, cy] = geo.center(clue.circle);
      const { shaft, head } = arrowPaths(geo, clue.circle, clue.path, ringR);
      return (
        <>
          <circle className="cb-ring" cx={cx} cy={cy} r={ringR} />
          <path className="cb-shaft" d={shaft} />
          <path className="cb-head" d={head} />
        </>
      );
    }
    case 'cage': {
      const d = cell / 15;
      const first = Math.min(...clue.cells);
      const x0 = (first % n) * cell + d;
      const y0 = Math.floor(first / n) * cell + d;
      const label = clue.sum === null ? '' : String(clue.sum);
      return (
        <>
          <path className="cb-cage-line" d={cagePath(clue.cells, n, cell, d)} />
          {label && (
            <>
              <rect className="cb-cage-pat" x={x0 - 1} y={y0 - 1} width={7 + label.length * small * 0.58} height={small + 4} />
              <text className="cb-cage-sum" x={x0 + 3} y={y0 + small - 1} fontSize={small}>
                {label}
              </text>
            </>
          )}
        </>
      );
    }
    case 'renban':
    case 'whisper':
      return <path className="cb-line" d={linePath(geo, clue.cells)} />;
    case 'kropki': {
      const [x, y] = edgeMid(geo, clue.a, clue.b);
      return <circle className={`cb-dot ${clue.color}`} cx={x} cy={y} r={cell * 0.092} />;
    }
    case 'xv': {
      const [x, y] = edgeMid(geo, clue.a, clue.b);
      return (
        <>
          <rect className="cb-xv-pat" x={x - (small + 3) / 2} y={y - (small + 5) / 2} width={small + 3} height={small + 5} rx={2} />
          <text className="cb-xv" x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize={small + 2}>
            {clue.sum === 10 ? 'X' : 'V'}
          </text>
        </>
      );
    }
    case 'diagonal':
      return <path className="cb-diag" d={`M0 0L${geo.px} ${geo.px}M${geo.px} 0L0 ${geo.px}`} />;
    default:
      return null;
  }
}

export function DefaultClueLayer({ puzzle, geo, lit, hidden }: ClueLayerProps) {
  return (
    <>
      {puzzle.clues.map((clue, k) => {
        if (clue.kind === 'antiKnight') return null;
        const cells = clueCells(clue);
        if (hidden && cells.length && cells.every((i) => hidden[i])) return null;
        const body = drawClue(clue, geo);
        if (!body) return null;
        return (
          <g key={k} className={`cb-clue${lit === clue.kind ? ' is-lit' : ''}`} data-kind={clue.kind}>
            {body}
          </g>
        );
      })}
    </>
  );
}
