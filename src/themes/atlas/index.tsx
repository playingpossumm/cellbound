// Star atlas: ink-blue chart paper, gold hairlines, a slow star field.
import { useMemo } from 'react';
import type { ReactNode } from 'react';
import type { BandProps, ClueLayerProps, ThemeDef } from '../types';
import { ClueSvg } from '../shared/clues';
import { cssVars, rng } from '../shared/util';
import '../shared/common.css';
import './theme.css';

interface Star {
  k: number;
  x: number;
  y: number;
  s: number;
  o: number;
  d: number;
  tw: boolean;
}

function makeStars(): Star[] {
  const rnd = rng(11);
  const out: Star[] = [];
  for (let k = 0; k < 110; k++) {
    const big = rnd() < 0.14;
    const s = big ? 2 + rnd() * 1.4 : 0.8 + rnd() * 1.2;
    out.push({
      k,
      x: rnd() * 100,
      y: rnd() * 100,
      s,
      o: 0.25 + rnd() * 0.6,
      d: rnd() * 6,
      tw: rnd() < 0.35,
    });
  }
  return out;
}

function Backdrop(_props: { night: boolean }): ReactNode {
  const stars = useMemo(makeStars, []);
  return (
    <div className="at-sky" aria-hidden="true">
      {stars.map((s) => (
        <span
          key={s.k}
          className={s.tw ? 'at-star tw' : 'at-star'}
          style={{
            left: `${s.x.toFixed(2)}%`,
            top: `${s.y.toFixed(2)}%`,
            width: s.s,
            height: s.s,
            opacity: s.o,
            animationDelay: `${s.d.toFixed(2)}s`,
          }}
        />
      ))}
    </div>
  );
}

function ClueLayer(props: ClueLayerProps): ReactNode {
  return <ClueSvg {...props} options={{ head: { angle: 39, len: 0.237, tip: 0.067 } }} />;
}

/** "Friday 23 October": a date, which keeps the study's old-style figures. */
const DATE = /^[A-Z][a-z]+day \d{1,2} [A-Z][a-z]+$/;

function Band({ title, subtitle, time, puzzle }: BandProps): ReactNode {
  const name = puzzle.name ?? title;
  return (
    <div className={subtitle ? 'cb-band at-band has-sub' : 'cb-band at-band'}>
      <svg className="at-grat" viewBox="0 0 360 120" preserveAspectRatio="none" aria-hidden="true">
        <path d="M-30 104 Q180 44 390 104" />
        <path d="M-30 124 Q180 70 390 124" />
        <path className="dash" d="M206 -14 Q252 56 228 134" />
        <path d="M296 -14 Q330 56 314 134" />
      </svg>
      <h2 className="at-name" style={cssVars({ '--at-len': Math.max(6, name.length) })}>
        {name}
      </h2>
      {subtitle && <span className={DATE.test(subtitle) ? 'at-sub is-date' : 'at-sub'}>{subtitle}</span>}
      {time ? (
        <span className="at-time" aria-hidden="true">
          {time}
        </span>
      ) : null}
    </div>
  );
}

export const atlas: ThemeDef = {
  id: 'atlas',
  name: 'Star atlas',
  blurb: 'Ink-blue chart paper, gold hairlines and a slow star field.',
  defaultNight: true,
  bandShowsTime: true,
  loadFonts: () =>
    Promise.all([
      import('@fontsource/cormorant-garamond/latin-500.css'),
      import('@fontsource/cormorant-garamond/latin-600.css'),
      import('@fontsource/cormorant-garamond/latin-700.css'),
      import('@fontsource/cormorant-garamond/latin-500-italic.css'),
      import('@fontsource/cormorant-garamond/latin-700-italic.css'),
    ]),
  Band,
  Backdrop,
  ClueLayer,
};
