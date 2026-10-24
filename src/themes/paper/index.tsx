// Paper and ink: newsprint, graphite pencil, a blue pen.
import type { ReactNode } from 'react';
import type { BandProps, ClueLayerProps, ThemeDef } from '../types';
import { ClueSvg } from '../shared/clues';
import { cssVars } from '../shared/util';
import '../shared/common.css';
import './theme.css';

/** A masthead for each mode, in the voice of a newspaper. */
const MASTHEADS: Record<string, string> = {
  Daily: 'The Daily Puzzle',
  Run: 'The Run Gazette',
  Learn: 'The Learning Column',
  Fog: 'The Fog Report',
  'Free play': 'The Free Play Edition',
};

export function mastheadFor(title: string): string {
  return MASTHEADS[title] ?? `The ${title.replace(/\b[a-z]/g, (c) => c.toUpperCase())} Puzzle`;
}

function Backdrop(_props: { night: boolean }): ReactNode {
  return <div className="pp-grain" aria-hidden="true" />;
}

function ClueLayer(props: ClueLayerProps): ReactNode {
  return <ClueSvg {...props} options={{ head: { angle: 39, len: 0.213, tip: 0.067 } }} />;
}

function Band({ title, subtitle }: BandProps): ReactNode {
  const head = mastheadFor(title);
  return (
    <div className="cb-band pp-mast">
      <div className="pp-r1" aria-hidden="true" />
      <h2 className="pp-title" style={cssVars({ '--pp-len': Math.max(16, head.length) })}>
        {head}
      </h2>
      {subtitle && <p className="pp-meta">{subtitle}</p>}
      <div className="pp-r2" aria-hidden="true" />
    </div>
  );
}

export const paper: ThemeDef = {
  id: 'paper',
  name: 'Paper and ink',
  blurb: 'Newsprint, graphite pencil and a blue pen under a masthead.',
  defaultNight: false,
  bandShowsTitle: true,
  loadFonts: () =>
    Promise.all([
      import('@fontsource-variable/newsreader/opsz.css'),
      import('@fontsource-variable/newsreader/opsz-italic.css'),
    ]),
  Band,
  Backdrop,
  ClueLayer,
};
