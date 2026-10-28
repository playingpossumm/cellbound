// Shared game model. Contract file: additive changes only.
import type { CellIndex, Digit, FogSpec, Puzzle } from '../engine/types';

export type ModeId = 'daily' | 'run' | 'free' | 'learn';

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
  /** Hint ladders the board allows: each new deduction asked for uses one. Unlimited when absent. */
  hints?: number;
  /** The first this many hint ladders go straight to the move and place its digit. */
  quickHints?: number;
  /** Candidate notes are filled in these cells when the board starts. */
  notesIn?: CellIndex[];
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
  /** Run boards only: noted[i] turns true once cell i has held a note on this board. */
  noted?: boolean[];
  /** Run boards only: missed[i] turns true once a wrong digit went into cell i. */
  missed?: boolean[];
  /** Run boards only: helped[i] turns true once a hint led to cell i or a card revealed it. */
  helped?: boolean[];
}
