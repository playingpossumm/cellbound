// Swiss poster: flat colour, heavy type, a red disc and a thick rule.
import type { ReactNode } from 'react';
import type { BandProps, ClueLayerProps, ThemeDef } from '../types';
import { ClueSvg } from '../shared/clues';
import { cssVars } from '../shared/util';
import '../shared/common.css';
import './theme.css';

function Band({ title, subtitle, time }: BandProps): ReactNode {
  const word = title.toUpperCase();
  // Roughly the width of the heavy face per character, so long titles shrink to fit.
  const len = Math.max(3.4, word.length * 0.66);
  return (
    <div className="cb-band sw-band">
      <h2 className="sw-big" style={cssVars({ '--sw-len': len })}>
        {word}
      </h2>
      <span className="sw-disc" aria-hidden="true" />
      {subtitle && <span className="sw-meta">{subtitle}</span>}
      {time ? (
        <span className="sw-time" aria-hidden="true">
          {time}
        </span>
      ) : null}
      <span className="sw-bar" aria-hidden="true" />
    </div>
  );
}

function ClueLayer(props: ClueLayerProps): ReactNode {
  return <ClueSvg {...props} options={{ whisper: 'line', head: { angle: 31, len: 0.292, tip: 0.117, shaftBack: 0.217 } }} />;
}

export const swiss: ThemeDef = {
  id: 'swiss',
  name: 'Swiss poster',
  blurb: 'Flat red, blue and yellow, heavy type and a thick rule.',
  defaultNight: false,
  bandShowsTime: true,
  bandShowsTitle: true,
  loadFonts: () => Promise.all([import('@fontsource-variable/archivo/wdth.css')]),
  Band,
  ClueLayer,
};
