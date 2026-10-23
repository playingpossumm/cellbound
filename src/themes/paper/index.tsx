// Paper and ink: newsprint, graphite pencil, a blue pen.
import type { ReactNode } from 'react';
import type { BandProps, ClueLayerProps, ThemeDef } from '../types';
import { ClueSvg } from '../shared/clues';
import '../shared/common.css';
import './theme.css';

const SIZE_WORD: Record<number, string> = { 4: 'Four by four', 6: 'Six by six', 9: 'Nine by nine' };

function Backdrop(_props: { night: boolean }): ReactNode {
  return <div className="pp-grain" aria-hidden="true" />;
}

function ClueLayer(props: ClueLayerProps): ReactNode {
  return <ClueSvg {...props} options={{ head: { angle: 39, len: 0.213, tip: 0.067 } }} />;
}

function Band({ title, subtitle, puzzle }: BandProps): ReactNode {
  return (
    <div className="cb-band pp-mast">
      <div className="pp-r1" aria-hidden="true" />
      <h2 className="pp-title">{`The ${title} Puzzle`}</h2>
      <div className="pp-meta">
        <span>{subtitle}</span>
        <span className="pp-sep" aria-hidden="true" />
        <span>{SIZE_WORD[puzzle.size] ?? `${puzzle.size} by ${puzzle.size}`}</span>
        {puzzle.name ? (
          <>
            <span className="pp-sep" aria-hidden="true" />
            <span>{puzzle.name}</span>
          </>
        ) : null}
      </div>
      <div className="pp-r2" aria-hidden="true" />
    </div>
  );
}

export const paper: ThemeDef = {
  id: 'paper',
  name: 'Paper and ink',
  blurb: 'Newsprint, graphite pencil and a blue pen under a masthead.',
  defaultNight: false,
  loadFonts: () =>
    Promise.all([
      import('@fontsource-variable/newsreader/opsz.css'),
      import('@fontsource-variable/newsreader/opsz-italic.css'),
    ]),
  Band,
  Backdrop,
  ClueLayer,
};
