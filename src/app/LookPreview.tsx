// A small live board in one look, for the theme picker. It is the real Board with the look's
// own components, drawn inside a shadow root: the page's stylesheets are copied in once, and
// inside the shadow only the previewed look's rules can match (they key on data-theme, which
// the shadow's wrapper carries), so the look on the page never leaks into another look's preview.
import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Board } from '../board/Board';
import type { Puzzle } from '../engine/types';
import type { ThemeDef } from '../themes/types';

/**
 * A 4x4 board with a given, a player digit, notes, a selected cell and three clues, so every
 * look shows its digits, lines and marks. The solution is a real one; the clues agree with it.
 */
const SOLUTION = [1, 2, 3, 4, 3, 4, 1, 2, 2, 1, 4, 3, 4, 3, 2, 1];
const PREVIEW: Puzzle = {
  id: 'look-preview',
  seed: 'look-preview',
  size: 4,
  boxW: 2,
  boxH: 2,
  givens: SOLUTION.map((d, i) => ([0, 3, 10, 13].includes(i) ? d : 0)),
  solution: SOLUTION,
  clues: [
    { kind: 'thermo', cells: [0, 1, 2] },
    { kind: 'cage', cells: [7, 11], sum: 5 },
    { kind: 'kropki', a: 14, b: 15, color: 'white' },
  ],
  difficulty: 1,
  score: 0,
};
const VALUES = SOLUTION.map((d, i) => ([1, 9, 14].includes(i) ? d : 0));
const NOTES = SOLUTION.map((_, i) => (i === 12 ? (1 << 2) | (1 << 4) : 0));
const NONE = SOLUTION.map(() => false);
const noop = () => undefined;

let shared: CSSStyleSheet | null | undefined;

/** Every rule of the page's stylesheets, as one sheet the previews share. Fonts stay on the page. */
function pageSheet(): CSSStyleSheet | null {
  if (shared !== undefined) return shared;
  try {
    const text: string[] = [];
    for (const s of Array.from(document.styleSheets)) {
      try {
        for (const r of Array.from(s.cssRules)) if (!(r instanceof CSSFontFaceRule)) text.push(r.cssText);
      } catch {
        // A stylesheet from another origin cannot be read; the app has none.
      }
    }
    shared = new CSSStyleSheet();
    shared.replaceSync(text.join('\n'));
  } catch {
    shared = null;
  }
  return shared;
}

export function LookPreview({ theme, night }: { theme: ThemeDef; night: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const [mount, setMount] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const el = host.current;
    if (!el || typeof el.attachShadow !== 'function') return;
    const shadow = el.shadowRoot ?? el.attachShadow({ mode: 'open' });
    const sheet = pageSheet();
    if (sheet) shadow.adoptedStyleSheets = [sheet];
    let box = shadow.querySelector<HTMLElement>('.cb-look-root');
    if (!box) {
      box = document.createElement('div');
      box.className = 'cb-look-root';
      shadow.appendChild(box);
    }
    setMount(box);
  }, []);
  return (
    // Decoration only: the radio it sits in carries the look's name and description.
    <div className="cb-look" ref={host} aria-hidden="true" inert>
      {mount &&
        createPortal(
          <div className="cb-look-in" data-theme={theme.id} data-night={String(night)} data-reduced-motion="true">
            <div className="cb-look-board">
              <Board
                puzzle={PREVIEW}
                values={VALUES}
                notes={NOTES}
                selected={5}
                highlights
                wrong={NONE}
                conflict={NONE}
                focus={[]}
                lit={null}
                doneBoxes={[]}
                flash={{}}
                flashCount={0}
                placedCell={null}
                placeCount={0}
                placedAt={{}}
                theme={theme}
                onSelect={noop}
              />
            </div>
          </div>,
          mount,
        )}
    </div>
  );
}
