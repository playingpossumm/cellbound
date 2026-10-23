// Paper and ink: newsprint, graphite pencil, a blue pen.
import type { ReactNode } from 'react';
import type { BandProps, ClueLayerProps, ThemeDef } from '../types';
import { ClueSvg } from '../shared/clues';
import { MetaLine } from '../shared/MetaLine';
import { cssVars } from '../shared/util';
import '../shared/common.css';
import './theme.css';

const SIZE_WORD: Record<number, string> = { 4: 'Four by four', 6: 'Six by six', 9: 'Nine by nine' };

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

function Band({ title, subtitle, puzzle }: BandProps): ReactNode {
  const head = mastheadFor(title);
  // Fog and Free play already name the size in the subtitle.
  const sized = subtitle.includes(`${puzzle.size} by ${puzzle.size}`);
  const items = [subtitle];
  if (!sized) items.push(SIZE_WORD[puzzle.size] ?? `${puzzle.size} by ${puzzle.size}`);
  if (puzzle.name) items.push(puzzle.name);
  return (
    <div className="cb-band pp-mast">
      <div className="pp-r1" aria-hidden="true" />
      <h2 className="pp-title" style={cssVars({ '--pp-len': Math.max(16, head.length) })}>
        {head}
      </h2>
      <MetaLine className="pp-meta" sepClass="pp-sep" items={items} />
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
