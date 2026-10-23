// Shared game model. Contract file: additive changes only.
import type { CellIndex, Digit, FogSpec, Puzzle } from '../engine/types';

export type ModeId = 'daily' | 'run' | 'fog' | 'free' | 'learn';

export interface Move {
  cell: CellIndex;
  prevValue: Digit;
  prevNotes: number;
  value: Digit;
  notes: number;
  kind: 'value' | 'note' | 'erase' | 'hint';
  /** Moves made by one action share a group id, so undo and redo treat them as one step. */
  group?: number;
}

/** Modifiers a Run card can put on one board. */
export interface GameMods {
  /** Mistakes cost hearts; at 0 the board fails. */
  hearts?: number;
  /** Absorbs this many mistakes before hearts are lost. */
  shield?: number;
  noNotes?: boolean;
  noHighlights?: boolean;
  /** Board fails when active time passes this. */
  timeLimitMs?: number;
  /** Fill all candidate notes at the start. */
  autoNotes?: boolean;
  /** Cells revealed (as hints) when the board starts. */
  reveal?: number;
}

export interface GameState {
  /** Save key, for example 'daily:2026-10-23' or 'run:2026-10-23:3'. */
  key: string;
  mode: ModeId;
  puzzle: Puzzle;
  /** Present for fog boards. cleared[i] is true once cell i is visible. */
  fog?: FogSpec & { cleared: boolean[] };
  /** Player entries only; givens stay in puzzle.givens. */
  values: Digit[];
  /** Bitmask per cell; bit d set means note d. */
  notes: number[];
  selected: CellIndex | null;
  notesMode: boolean;
  undo: Move[];
  redo: Move[];
  /** Wrong digits entered, checked against the solution. */
  mistakes: number;
  hintsUsed: number;
  /** Accumulated active time. */
  elapsedMs: number;
  status: 'playing' | 'paused' | 'solved' | 'failed';
  /** Boxes (or regions) completed correctly, in completion order. */
  doneBoxes: number[];
  mods?: GameMods;
  /** hinted[i] is true when the digit in cell i was placed by a hint or a reveal. */
  hinted?: boolean[];
  /** Local date (YYYY-MM-DD) the game was started on. */
  startedOn?: string;
}
