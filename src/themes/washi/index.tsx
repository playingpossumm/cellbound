// Washi and sumi: rice paper, ink and a vermilion seal.
import type { ReactNode } from 'react';
import type { BandProps, BoardGeometry, ClueLayerProps, ThemeDef } from '../types';
import { ClueSvg } from '../shared/clues';
import { r1, rng } from '../shared/util';
import '../shared/common.css';
import './theme.css';

function ClueLayer(props: ClueLayerProps): ReactNode {
  return <ClueSvg {...props} options={{ head: { angle: 36, len: 0.29, tip: 0.083, shaftBack: 0.05, soft: true } }} />;
}

function Backdrop(_props: { night: boolean }): ReactNode {
  return <div className="wa-fibre" aria-hidden="true" />;
}

/** The season's seal for each month, January first. */
const SEASONS = ['冬', '冬', '春', '春', '春', '夏', '夏', '夏', '秋', '秋', '秋', '冬'];

function Band({ title, subtitle }: BandProps): ReactNode {
  const season = SEASONS[new Date().getMonth()];
  return (
    <div className="cb-band wa-band">
      <svg className="wa-enso" viewBox="0 0 360 122" preserveAspectRatio="xMaxYMid meet" aria-hidden="true">
        <path className="wa-e1" d="M251.9 38 A44 44 0 1 1 246.7 67.6" />
        <path className="wa-e2" d="M256 33 A47 47 0 1 1 243.5 64" />
        <g className="wa-hanko" transform="translate(316 92) rotate(-4)">
          <rect className="wa-hanko-box" x="-16" y="-16" width="32" height="32" rx="3" />
          <text className="wa-hanko-glyph" x="0" y="0" textAnchor="middle" dominantBaseline="central">
            {season}
          </text>
        </g>
      </svg>
      <h2 className="wa-title">{title}</h2>
      {subtitle && <span className="wa-date">{subtitle}</span>}
    </div>
  );
}

/** A brush stroke along one line: a thin polygon whose edges wander a little. */
function brush(
  rnd: () => number,
  horizontal: boolean,
  fixed: number,
  from: number,
  to: number,
  width: number,
  step: number,
): string {
  const len = to - from;
  const n = Math.max(1, Math.round(len / step));
  const top: [number, number][] = [];
  const bottom: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const along = from + (len * i) / n;
    const a = fixed - width / 2 + (rnd() - 0.5) * width * 0.42;
    const b = fixed + width / 2 + (rnd() - 0.5) * width * 0.42;
    top.push(horizontal ? [along, a] : [a, along]);
    bottom.push(horizontal ? [along, b] : [b, along]);
  }
  return [...top, ...bottom.reverse()].map(([x, y]) => `${r1(x)},${r1(y)}`).join(' ');
}

function GridLayer({ geo }: { geo: BoardGeometry }): ReactNode {
  const { size: n, cell: u, px } = geo;
  const rnd = rng(7 + n * 13);
  const w = u * 0.047;
  const fw = u * 0.065;
  const step = u * 1.5;
  let thin = '';
  for (let k = 1; k < n; k++) thin += `M${k * u} 0V${px}M0 ${k * u}H${px}`;
  const shapes: string[] = [];
  // Box lines: wherever the region changes between two neighbouring cells.
  for (let k = 1; k < n; k++) {
    let start = -1;
    for (let r = 0; r <= n; r++) {
      const edge = r < n && geo.regionOf(r * n + k - 1) !== geo.regionOf(r * n + k);
      if (edge && start < 0) start = r;
      if (!edge && start >= 0) {
        shapes.push(brush(rnd, false, k * u, start * u, r * u, w, step));
        start = -1;
      }
    }
    start = -1;
    for (let c = 0; c <= n; c++) {
      const edge = c < n && geo.regionOf((k - 1) * n + c) !== geo.regionOf(k * n + c);
      if (edge && start < 0) start = c;
      if (!edge && start >= 0) {
        shapes.push(brush(rnd, true, k * u, start * u, c * u, w, step));
        start = -1;
      }
    }
  }
  // Frame: four strokes that overshoot the corners.
  const o = fw * 0.8;
  shapes.push(brush(rnd, true, 0, -o, px + o, fw, step * 2));
  shapes.push(brush(rnd, true, px, -o, px + o, fw, step * 2));
  shapes.push(brush(rnd, false, 0, -o, px + o, fw, step * 2));
  shapes.push(brush(rnd, false, px, -o, px + o, fw, step * 2));
  return (
    <>
      <path className="cb-thin" d={thin} />
      {shapes.map((pts, i) => (
        <polygon key={i} className="cb-brush" points={pts} />
      ))}
    </>
  );
}

function BoxDoneLayer({ geo, done }: { geo: BoardGeometry; done: number[] }): ReactNode {
  const n = geo.size;
  return (
    <div className="wa-seals" aria-hidden="true">
      {done.map((b) => {
        // Bottom right corner of the box: its last row, then its last column in that row.
        let best = -1;
        for (let i = 0; i < n * n; i++) {
          if (geo.regionOf(i) === b) best = i;
        }
        if (best < 0) return null;
        const x = ((best % n) + 1) / n;
        const y = (Math.floor(best / n) + 1) / n;
        return (
          <span
            key={b}
            className="wa-seal"
            style={{ left: `${(x * 100).toFixed(3)}%`, top: `${(y * 100).toFixed(3)}%` }}
          >
            <span>{'完'}</span>
          </span>
        );
      })}
    </div>
  );
}

export const washi: ThemeDef = {
  id: 'washi',
  name: 'Washi and sumi',
  blurb: 'Rice paper, brushed box lines and a vermilion seal for every finished box.',
  defaultNight: false,
  bandShowsTitle: true,
  loadFonts: () =>
    Promise.all([
      import('@fontsource/shippori-mincho/latin-500.css'),
      import('@fontsource/shippori-mincho/latin-600.css'),
      import('@fontsource/shippori-mincho/latin-700.css'),
    ]),
  Band,
  Backdrop,
  GridLayer,
  ClueLayer,
  BoxDoneLayer,
};
