// Prism: glass cells and a band where white light splits into the digit colours.
import type { ReactNode } from 'react';
import type { BandProps, ClueLayerProps, ThemeDef } from '../types';
import { ClueSvg } from '../shared/clues';
import { cssVars } from '../shared/util';
import '../shared/common.css';
import './theme.css';

function Band({ title, subtitle, puzzle }: BandProps): ReactNode {
  const n = puzzle.size;
  // One ray per digit, fanned over a span that grows with the board size.
  const span = Math.min(92, Math.max(70, (n - 1) * 11.5));
  const step = span / (n - 1);
  const y0 = 73 - span / 2;
  const fs = Math.max(9.5, Math.min(13, step * 0.9));
  const rays = Array.from({ length: n }, (_, i) => ({ i, y: y0 + i * step }));
  const pulses = [0, Math.floor((n - 1) / 2), n - 1];
  return (
    <div className="cb-band pr-band" data-size={n}>
      <svg className="pr-spec" viewBox="0 0 360 124" preserveAspectRatio="xMaxYMid meet" aria-hidden="true">
        <path className="pr-beam" d="M0 106 L131 66" />
        <path className="pr-inner" d="M131 66 L169 66" />
        <polygon className="pr-glass" points="150,24 110,102 190,102" />
        {rays.map(({ i, y }) => (
          <path key={i} className={`pr-ray pr-r${i + 1}`} d={`M169 66 L338 ${y.toFixed(1)}`} />
        ))}
        {pulses.map((p, k) => (
          <path
            key={k}
            className="pr-pulse"
            d={`M169 66 L338 ${rays[p].y.toFixed(1)}`}
            style={{ animationDelay: `${k * 1.5}s` }}
          />
        ))}
        {rays.map(({ i, y }) => (
          <text key={i} className={`pr-lab pr-r${i + 1}`} x={346} y={(y + fs * 0.32).toFixed(1)} fontSize={fs}>
            {i + 1}
          </text>
        ))}
      </svg>
      <h2 className="pr-title" style={cssVars({ '--pr-len': Math.max(5, title.length) })}>
        {title}
      </h2>
      {subtitle && <span className="pr-sub">{subtitle}</span>}
    </div>
  );
}

function ClueLayer(props: ClueLayerProps): ReactNode {
  return <ClueSvg {...props} options={{ thermoGradient: true, head: { angle: 42, len: 0.224, tip: 0.05 } }} />;
}

export const prism: ThemeDef = {
  id: 'prism',
  name: 'Prism',
  blurb: 'Dark glass cells and one spectrum colour for every digit.',
  defaultNight: true,
  bandShowsTitle: true,
  loadFonts: () => Promise.all([import('@fontsource-variable/sora/index.css')]),
  Band,
  ClueLayer,
};
