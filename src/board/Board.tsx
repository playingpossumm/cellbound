// The board: cells, grid, clues, digits and fog, in the class vocabulary of
// the spec (section 5). Themes style these classes and may replace the clue layer.
import { memo, useEffect, useId, useMemo, useRef, type CSSProperties } from 'react';
import type { CellIndex, ClueKind, Digit, Puzzle } from '../engine/types';
import type { ThemeDef } from '../themes/types';
import { makeGeometry } from './geometry';
import { clueCells, DefaultClueLayer, GridLayer } from './layers';

export interface BoardProps {
  puzzle: Puzzle;
  values: Digit[];
  notes: number[];
  selected: CellIndex | null;
  hinted?: boolean[];
  /** cleared[i] false means cell i is under fog. Omit for boards without fog. */
  fogCleared?: boolean[];
  highlights: boolean;
  /** Digits to mark as wrong. */
  wrong: boolean[];
  /** Cells taking part in a rule break. */
  conflict: boolean[];
  /** Hint focus cells. */
  focus: CellIndex[];
  lit: ClueKind | null;
  doneBoxes: number[];
  /** Cell to stagger index for the unit that just finished. */
  flash: Record<number, number>;
  flashCount: number;
  placedCell: CellIndex | null;
  placeCount: number;
  placedAt: Record<number, number>;
  theme: ThemeDef;
  solved?: boolean;
  onSelect(i: CellIndex): void;
}

type VarStyle = CSSProperties & Record<`--${string}`, string | number>;

function cellLabel(r: number, c: number, d: Digit, given: boolean, notes: number[], hiddenCell: boolean, wrong: boolean): string {
  const at = `Row ${r + 1}, column ${c + 1}`;
  if (hiddenCell) return `${at}, under fog`;
  if (d) return `${at}, ${d}${given ? ', given' : ''}${wrong ? ', does not fit' : ''}`;
  return notes.length ? `${at}, empty, notes ${notes.join(' ')}` : `${at}, empty`;
}

/**
 * The clues a fog board draws. A dot or an X/V sits on the edge between two cells, so it
 * appears once both are clear (as the engine's fog solver sees it); a line appears as soon
 * as one of its cells is clear, and the mask in the clue layer hides the rest under fog.
 */
function shownClues(puzzle: Puzzle, hidden: boolean[] | undefined): Puzzle {
  if (!hidden) return puzzle;
  const clues = puzzle.clues.filter((c) => {
    const cells = clueCells(c);
    if (!cells.length) return true;
    if (c.kind === 'kropki' || c.kind === 'xv') return cells.every((i) => !hidden[i]);
    return cells.some((i) => !hidden[i]);
  });
  return clues.length === puzzle.clues.length ? puzzle : { ...puzzle, clues };
}

/**
 * For every cell, the sides that face another box (or region): ' edge-l', ' edge-r', ' edge-t'
 * and ' edge-b'. The board's outer edges do not count. A theme can use them to set boxes apart.
 */
function boxEdges(n: number, regionOf: (i: number) => number): string[] {
  return Array.from({ length: n * n }, (_, i) => {
    const r = Math.floor(i / n);
    const c = i % n;
    const b = regionOf(i);
    let out = '';
    if (c > 0 && regionOf(i - 1) !== b) out += ' edge-l';
    if (c < n - 1 && regionOf(i + 1) !== b) out += ' edge-r';
    if (r > 0 && regionOf(i - n) !== b) out += ' edge-t';
    if (r < n - 1 && regionOf(i + n) !== b) out += ' edge-b';
    return out;
  });
}

function BoardImpl(props: BoardProps) {
  const {
    puzzle, values, notes, selected, hinted, fogCleared, highlights, wrong, conflict, focus, lit,
    doneBoxes, flash, flashCount, placedCell, placeCount, placedAt, theme, solved, onSelect,
  } = props;
  const n = puzzle.size;
  const geo = useMemo(() => makeGeometry(puzzle), [puzzle]);
  const edges = useMemo(() => boxEdges(n, geo.regionOf), [n, geo]);
  const cellsRef = useRef<HTMLDivElement>(null);
  const maskId = `cb-fogmask-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const full = useMemo(() => puzzle.givens.map((d, i) => d || values[i] || 0), [puzzle, values]);
  const hidden = useMemo(() => (fogCleared ? fogCleared.map((c) => !c) : undefined), [fogCleared]);
  const cluePuzzle = useMemo(() => shownClues(puzzle, hidden), [puzzle, hidden]);
  const done = useMemo(() => new Set(doneBoxes), [doneBoxes]);
  const focusSet = useMemo(() => new Set(focus), [focus]);
  const flashCls = flashCount % 2 ? 'flash-a' : 'flash-b';
  const placeCls = placeCount % 2 ? 'place-a' : 'place-b';
  const selR = selected === null ? -1 : Math.floor(selected / n);
  const selC = selected === null ? -1 : selected % n;
  const selB = selected === null ? -1 : geo.regionOf(selected);
  const selD = selected === null || hidden?.[selected] ? 0 : full[selected];
  // The digit the selection holds: every cell and pencil mark with it lights up, the selected cell too.
  const sameD = highlights ? selD : 0;

  // Keep keyboard focus on the selected cell when it moves.
  useEffect(() => {
    const root = cellsRef.current;
    if (!root || selected === null) return;
    const active = document.activeElement;
    if (active && root.contains(active) && active.getAttribute('data-cell') !== String(selected)) {
      (root.querySelector(`[data-cell="${selected}"]`) as HTMLButtonElement | null)?.focus();
    }
  }, [selected]);

  const Clues = theme.ClueLayer ?? DefaultClueLayer;
  const tabCell = selected ?? 0;
  const noteCols = n === 4 ? 2 : 3;

  const cells = [];
  const slots = [];
  const fogs = [];
  for (let i = 0; i < n * n; i++) {
    const r = Math.floor(i / n);
    const c = i % n;
    const b = geo.regionOf(i);
    const given = !!puzzle.givens[i];
    const isHidden = !!hidden?.[i];
    const d = isHidden && given ? 0 : full[i];
    const inFlash = flash[i] !== undefined;
    const style: VarStyle | undefined = inFlash ? { '--d': flash[i] } : undefined;
    const noteList: number[] = [];
    if (!d && !isHidden) for (let k = 1; k <= n; k++) if (notes[i] & (1 << k)) noteList.push(k);
    // A wrong digit keeps its own mark rather than lighting up with the right ones.
    const same = !!sameD && d === sameD && !(wrong[i] && !given);

    let cls = 'cb-cell' + edges[i];
    if (i === selected) cls += ' is-sel';
    else if (highlights && selected !== null && (r === selR || c === selC || b === selB)) cls += ' is-peer';
    if (same) cls += ' is-same';
    if (conflict[i] && !isHidden) cls += ' is-conflict';
    if (given) cls += ' is-given';
    if (focusSet.has(i)) cls += ' is-focus';
    if (done.has(b)) cls += ' box-done';
    if (inFlash) cls += ` ${flashCls}`;
    cells.push(
      <button
        key={i}
        type="button"
        className={cls}
        data-cell={i}
        tabIndex={i === tabCell ? 0 : -1}
        style={style}
        aria-label={cellLabel(r, c, d, given, noteList, isHidden, wrong[i] && !given)}
        aria-current={i === selected ? 'true' : undefined}
        onPointerDown={(e) => {
          if (e.button === 0) onSelect(i);
        }}
        onClick={() => onSelect(i)}
        onFocus={() => onSelect(i)}
      />,
    );

    let slotCls = 'cb-slot' + edges[i];
    if (inFlash) slotCls += ` ${flashCls}`;
    if (done.has(b)) slotCls += ' box-done';
    if (i === selected) slotCls += ' is-sel';
    if (same) slotCls += ' is-same';
    let inner = null;
    if (d) {
      const kind = given ? 'given' : wrong[i] ? 'wrong' : hinted?.[i] ? 'hint' : 'mine';
      let dc = `cb-digit is-${kind} h${d}`;
      if (i === placedCell && !given) dc += ` ${placeCls}`;
      inner = (
        <span key={placedAt[i] ?? 0} className={dc} aria-hidden="true">
          {d}
        </span>
      );
    } else if (noteList.length) {
      inner = (
        <span className="cb-notes" aria-hidden="true">
          {Array.from({ length: n }, (_, k) => (
            <span key={k} className={notes[i] & (1 << (k + 1)) ? (k + 1 === sameD ? 'cb-note on is-same' : 'cb-note on') : 'cb-note'}>
              {k + 1}
            </span>
          ))}
        </span>
      );
    }
    slots.push(
      <div key={i} className={slotCls} style={style}>
        {inner}
      </div>,
    );

    if (fogCleared) {
      const fs: VarStyle = { '--d': (r + c) % 3 };
      fogs.push(<div key={i} className={(isHidden ? 'cb-fog is-on' : 'cb-fog') + edges[i]} style={fs} />);
    }
  }

  const boardStyle: VarStyle = { '--cb-n': n, '--cb-note-cols': noteCols };
  return (
    <div className={`cb-board${solved ? ' is-solved' : ''}`} data-size={n} data-same={sameD || undefined} style={boardStyle}>
      <div className="cb-cells" ref={cellsRef} role="group" aria-label="Board">
        {cells}
      </div>
      <svg className="cb-grid" viewBox={`0 0 ${geo.px} ${geo.px}`} aria-hidden="true" focusable="false">
        <GridLayer geo={geo} />
      </svg>
      <svg className="cb-clues" viewBox={`0 0 ${geo.px} ${geo.px}`} aria-hidden="true" focusable="false">
        {hidden ? (
          <>
            {/* Clues show only over cleared cells, whatever a theme's fog lets through. */}
            <defs>
              <mask id={maskId} maskUnits="userSpaceOnUse" x={-geo.cell} y={-geo.cell} width={geo.px + 2 * geo.cell} height={geo.px + 2 * geo.cell}>
                {hidden.map((h, i) =>
                  h ? null : (
                    // A half-unit overlap, so no seam shows where two cleared cells meet.
                    <rect key={i} x={(i % n) * geo.cell - 0.5} y={Math.floor(i / n) * geo.cell - 0.5} width={geo.cell + 1} height={geo.cell + 1} fill="#fff" />
                  ),
                )}
              </mask>
            </defs>
            <g mask={`url(#${maskId})`}>
              <Clues puzzle={cluePuzzle} geo={geo} lit={lit} hidden={hidden} />
            </g>
          </>
        ) : (
          <Clues puzzle={puzzle} geo={geo} lit={lit} hidden={hidden} />
        )}
      </svg>
      <div className="cb-digits" aria-hidden="true">
        {slots}
      </div>
      {fogCleared && (
        <div className="cb-fogs" aria-hidden="true">
          {fogs}
        </div>
      )}
    </div>
  );
}

export const Board = memo(BoardImpl);
