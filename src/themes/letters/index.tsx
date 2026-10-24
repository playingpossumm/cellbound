// Letters in space: a monospaced look where the grid is a figure made of letters.
import { useLayoutEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { BandProps, DigitProps, ThemeDef } from '../types';
import { useReducedMotion } from '../shared/motion';
import { Cube } from './cube';
import { LettersClueLayer } from './chains';
import '../shared/common.css';
import './theme.css';

const CH = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789#%+=<>';
const randomGlyph = (): string => CH.charAt(Math.floor(Math.random() * CH.length));

function Band({ subtitle, puzzle, values }: BandProps): ReactNode {
  return (
    <div className="cb-band lt-band" data-size={puzzle.size}>
      <Cube values={values} size={puzzle.size} />
      {subtitle && <span className="lt-corner lt-tl">{subtitle.toUpperCase()}</span>}
    </div>
  );
}

/** A new digit first decodes through random letters, then lands with a small pop. */
function Digit({ digit, kind, placedAt }: DigitProps): ReactNode {
  const still = useReducedMotion();
  const decodes = !still && kind !== 'given' && placedAt > 0;
  const [glyph, setGlyph] = useState<string | null>(() => (decodes ? randomGlyph() : null));
  useLayoutEffect(() => {
    if (!decodes) {
      setGlyph(null);
      return;
    }
    let left = 7;
    setGlyph(randomGlyph());
    const id = window.setInterval(() => {
      left -= 1;
      if (left <= 0) {
        window.clearInterval(id);
        setGlyph(null);
      } else {
        setGlyph(randomGlyph());
      }
    }, 45);
    return () => window.clearInterval(id);
  }, [placedAt, decodes]);
  if (glyph !== null) {
    return <span className="cb-digit is-dec">{glyph}</span>;
  }
  const pop = decodes ? (placedAt % 2 ? ' place-a' : ' place-b') : '';
  return <span className={`cb-digit is-${kind} h${digit}${pop}`}>{digit}</span>;
}

export const letters: ThemeDef = {
  id: 'letters',
  name: 'Letters in space',
  blurb: 'A monospaced grid with a turning cube of letters and rules spelled along the lines.',
  defaultNight: false,
  loadFonts: () =>
    Promise.all([
      import('@fontsource/ibm-plex-mono/latin-400.css'),
      import('@fontsource/ibm-plex-mono/latin-500.css'),
      import('@fontsource/ibm-plex-mono/latin-600.css'),
    ]),
  Band,
  ClueLayer: LettersClueLayer,
  Digit,
};
