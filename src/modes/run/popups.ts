// Where a placement's popup goes on the board. Popups that fire close together used to land on the
// cell above their own, so two in neighbouring cells printed over each other and every one hid the
// digits under it. Each popup now takes the free place nearest its cell that covers the least:
// not another popup, not the digit just placed, and as few of the digits already on the board as
// the board allows. Pure, in pixels of the board, so the component only measures.
import type { Popup } from './live';

/** A rectangle on the board, in pixels from its top left corner. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** What the board looks like to a popup: its size and how much each cell would lose if it were covered. */
export interface Ground {
  /** Cells to a side. */
  n: number;
  /** The board's width and height in pixels. */
  side: number;
  /** Per cell: 0 for an empty one, up to 1 for a digit that must stay readable. */
  weight: readonly number[];
}

/** A cell with a digit in it counts in full, one with only notes in it a little less. */
export const WEIGHT = { digit: 1, notes: 0.4, empty: 0 } as const;

/** Pixels one letter of a popup's name takes (11 px capitals with their spacing), and its padding. */
const NAME_PX = 8.4;
const POINTS_PX = 9.5;
const NOTE_PX = 7.2;
const PAD_X = 18;
const GAP = 3;

/** The size of a popup from its words: a name line, a points line and, after a clean unit, a third. */
export function popupSize(p: Pick<Popup, 'name' | 'points' | 'clean' | 'note'>): { w: number; h: number } {
  const points = p.note ?? `+${p.points.toLocaleString('en-US')}`;
  const clean = p.clean > 1 ? `Clean x${Math.round(p.clean * 100) / 100}`.length * 6.6 : 0;
  const w = Math.ceil(Math.max(p.name.length * NAME_PX, points.length * (p.note ? NOTE_PX : POINTS_PX), clean) + PAD_X);
  return { w, h: p.clean > 1 ? 54 : 41 };
}

const overlap = (a: Box, b: Box) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

/** What covering `box` would cost, in cells of digit hidden. */
function cellsHidden(g: Ground, box: Box): number {
  const s = g.side / g.n;
  const c0 = Math.max(0, Math.floor(box.x / s));
  const c1 = Math.min(g.n - 1, Math.floor((box.x + box.w - 0.01) / s));
  const r0 = Math.max(0, Math.floor(box.y / s));
  const r1 = Math.min(g.n - 1, Math.floor((box.y + box.h - 0.01) / s));
  let cost = 0;
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const w = g.weight[r * g.n + c] ?? 0;
      if (w) cost += (w * overlap(box, { x: c * s, y: r * s, w: s, h: s })) / (s * s);
    }
  }
  return cost;
}

/**
 * The box for a popup of `size` beside `cell`. The places tried first are the ones around it:
 * above, below, to either side and one row further, each slid along; then, so that a crowd of
 * popups always finds room, every position on a grid of half a cell. Boxes in `taken` are other
 * popups still showing, and never being on one outweighs everything else. Of the rest the cheapest
 * wins: the fewest digits covered, then the nearest to the cell, and the first place on a tie,
 * which is the one directly above, as before.
 */
export function placePopup(g: Ground, cell: number, size: { w: number; h: number }, taken: readonly Box[]): Box {
  const s = g.side / g.n;
  const cx = ((cell % g.n) + 0.5) * s;
  const cy = (Math.floor(cell / g.n) + 0.5) * s;
  const own: Box = { x: cx - s / 2, y: cy - s / 2, w: s, h: s };
  const { w, h } = size;
  const clamp = (b: Box): Box => ({ ...b, x: Math.max(0, Math.min(g.side - w, b.x)), y: Math.max(0, Math.min(g.side - h, b.y)) });
  const slide = [0, -0.55, 0.55, -1.1, 1.1];
  const candidates: Box[] = [];
  const add = (x: number, y: number) => candidates.push(clamp({ x, y, w, h }));
  for (const rows of [0, 1]) {
    for (const k of slide) add(cx - w / 2 + k * s, own.y - GAP - h - rows * s);
    for (const k of slide) add(cx - w / 2 + k * s, own.y + s + GAP + rows * s);
  }
  for (const k of [0, -0.5, 0.5]) {
    add(own.x - GAP - w, cy - h / 2 + k * s);
    add(own.x + s + GAP, cy - h / 2 + k * s);
  }
  for (let y = 0; y <= g.side - h + 0.01; y += s / 2) for (let x = 0; x <= g.side - w + 0.01; x += s / 2) add(x, y);
  let best = candidates[0];
  let bestCost = Infinity;
  candidates.forEach((b, i) => {
    const onTop = taken.reduce((sum, t) => sum + overlap(b, t) / (w * h), 0);
    const onOwn = overlap(b, own) / (s * s);
    // A popup that wanders from its cell stops belonging to it: each cell of distance costs a bit.
    const away = Math.hypot(b.x + w / 2 - cx, b.y + h / 2 - cy) / s;
    const cost = cellsHidden(g, b) + onTop * 1000 + onOwn * 6 + away * 0.15 + i * 0.0001;
    if (cost < bestCost) {
      best = b;
      bestCost = cost;
    }
  });
  return best;
}
