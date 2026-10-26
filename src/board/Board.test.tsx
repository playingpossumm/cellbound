// @vitest-environment jsdom
// The board: fog hides givens and clues, finished boxes are marked, and a look can draw its own clues.
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { LYRA } from '../engine/fixtures';
import type { Puzzle } from '../engine/types';
import type { ThemeDef } from '../themes/types';
import { Board, type BoardProps } from './Board';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const plain = { id: 'prism', name: 'Plain', blurb: '', defaultNight: false, loadFonts: async () => undefined, Band: () => null } as unknown as ThemeDef;

function props(puzzle: Puzzle, fogCleared?: boolean[], theme: ThemeDef = plain): BoardProps {
  const n = puzzle.size * puzzle.size;
  return {
    puzzle,
    values: new Array(n).fill(0),
    notes: new Array(n).fill(0),
    selected: null,
    fogCleared,
    highlights: true,
    wrong: new Array(n).fill(false),
    conflict: new Array(n).fill(false),
    focus: [],
    lit: null,
    doneBoxes: [],
    flash: {},
    flashCount: 0,
    placedCell: null,
    placeCount: 0,
    placedAt: {},
    theme,
    onSelect: () => undefined,
  };
}

let host: HTMLDivElement | null = null;
afterEach(() => {
  host?.remove();
  host = null;
});

async function render(p: BoardProps) {
  host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(<Board {...p} />));
  return host;
}

describe('board under fog', () => {
  it('draws every clue and no mask without fog', async () => {
    const el = await render(props(LYRA));
    expect(el.querySelectorAll('.cb-clue')).toHaveLength(LYRA.clues.length);
    expect(el.querySelector('.cb-clues mask')).toBeNull();
  });

  it('hides givens and edge marks under fog and masks the clue layer to clear cells', async () => {
    // Clear the left half of the board (columns 1 to 3).
    const cleared = LYRA.givens.map((_, i) => i % 6 < 3);
    const el = await render(props(LYRA, cleared));
    // Givens at 5, 17 and 33 sit in the right half, under fog: no digit drawn there.
    const slots = el.querySelectorAll('.cb-slot');
    for (const i of [5, 17, 33]) expect(slots[i].textContent).toBe('');
    expect(slots[13].textContent).toBe(String(LYRA.solution[13]));
    // The dots join 34-35 and 27-28: 34 and 35 are both fogged, 27 is clear but 28 is not.
    expect(el.querySelectorAll('.cb-clue[data-kind="kropki"]')).toHaveLength(0);
    // The arrow (circle 1, path 8 and 9) has clear cells, so it is drawn under the mask.
    expect(el.querySelector('.cb-clue[data-kind="arrow"]')).not.toBeNull();
    const mask = el.querySelector('.cb-clues mask');
    expect(mask).not.toBeNull();
    expect(mask!.querySelectorAll('rect')).toHaveLength(18);
    expect(el.querySelector('.cb-clues g[mask]')).not.toBeNull();
    // Fog cells follow the cleared map.
    expect(el.querySelectorAll('.cb-fog.is-on')).toHaveLength(18);
  });

  it('shows an edge mark once both of its cells are clear', async () => {
    const cleared = LYRA.givens.map((_, i) => i === 34 || i === 35);
    const el = await render(props(LYRA, cleared));
    expect(el.querySelectorAll('.cb-clue[data-kind="kropki"]')).toHaveLength(1);
  });
});

describe('grid, finished boxes and clue layers', () => {
  it('draws the box lines and the frame', async () => {
    const el = await render(props(LYRA));
    expect(el.querySelector('.cb-grid .cb-thick')).not.toBeNull();
    expect(el.querySelector('.cb-grid .cb-frame')).not.toBeNull();
  });

  it("draws a look's own clue layer in place of the default one", async () => {
    const own = { ...plain, ClueLayer: () => <g className="t-clues" /> } as ThemeDef;
    const el = await render(props(LYRA, undefined, own));
    expect(el.querySelector('.cb-clues .t-clues')).not.toBeNull();
    expect(el.querySelectorAll('.cb-clue')).toHaveLength(0);
  });

  it('marks the cells of finished boxes', async () => {
    const el = await render({ ...props(LYRA), doneBoxes: [0, 5] });
    // Box 0 of a 6x6 is the top left three by two; cell 0 is in it, cell 3 is not.
    const cells = el.querySelectorAll('.cb-cell');
    expect(cells[0].classList.contains('box-done')).toBe(true);
    expect(cells[3].classList.contains('box-done')).toBe(false);
    expect(el.querySelectorAll('.cb-slot.box-done')).toHaveLength(12);
  });
});
