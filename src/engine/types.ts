// Shared puzzle model. Contract file: changes must be additive (new optional
// fields or new union members), never renames or removals.

export type Size = 4 | 6 | 9;

/** 0 means empty, otherwise 1..size. */
export type Digit = number;

/** Row-major index: row * size + col. */
export type CellIndex = number;

export type ClueKind =
  | 'thermo'
  | 'arrow'
  | 'cage'
  | 'renban'
  | 'whisper'
  | 'kropki'
  | 'xv'
  | 'diagonal'
  | 'antiKnight';

export type Clue =
  /** cells[0] is the bulb; digits strictly increase along cells. */
  | { kind: 'thermo'; cells: CellIndex[] }
  /** Digits on path (excluding the circle) sum to the circle digit. Digits may repeat if no other rule forbids it. */
  | { kind: 'arrow'; circle: CellIndex; path: CellIndex[] }
  /** Digits never repeat inside a cage; sum null means the total is hidden. */
  | { kind: 'cage'; cells: CellIndex[]; sum: number | null }
  /** The digits form a set of consecutive numbers in any order, without repeats. */
  | { kind: 'renban'; cells: CellIndex[] }
  /** Neighbouring cells along the line differ by at least minDiff (5 on 9x9, 3 on 6x6, 2 on 4x4). */
  | { kind: 'whisper'; cells: CellIndex[]; minDiff: number }
  /** White: the two digits differ by 1. Black: one digit is double the other. a and b are orthogonal neighbours. */
  | { kind: 'kropki'; a: CellIndex; b: CellIndex; color: 'white' | 'black' }
  /** V: the two digits sum to 5. X: they sum to 10. a and b are orthogonal neighbours. */
  | { kind: 'xv'; a: CellIndex; b: CellIndex; sum: 5 | 10 }
  /** Both main diagonals hold each digit once. */
  | { kind: 'diagonal' }
  /** Equal digits are never a chess knight's move apart. */
  | { kind: 'antiKnight' };

/** 1 gentle, 2 easy, 3 medium, 4 hard, 5 fiendish. */
export type Difficulty = 1 | 2 | 3 | 4 | 5;

export interface Puzzle {
  id: string;
  seed: string;
  size: Size;
  /** Box width and height: 2x2 on 4x4, 3x2 (boxW 3, boxH 2) on 6x6, 3x3 on 9x9. */
  boxW: number;
  boxH: number;
  /** Optional irregular regions (cell -> region id). When present it replaces the boxes. */
  regions?: number[];
  /** Length size*size, 0 where nothing is given. */
  givens: Digit[];
  /** Length size*size. */
  solution: Digit[];
  clues: Clue[];
  /** When true every possible kropki dot is drawn, so a pair without a dot is neither consecutive nor double. */
  negativeKropki?: boolean;
  difficulty: Difficulty;
  /** Engine difficulty score, comparable within one size. */
  score: number;
  /** Display name, for example a constellation for dailies. */
  name?: string;
}

/** The fields the solver needs. */
export type PuzzleShape = Pick<Puzzle, 'size' | 'boxW' | 'boxH' | 'regions' | 'givens' | 'clues' | 'negativeKropki'>;

export interface GenerateOptions {
  size: Size;
  /** Same options and seed give the same puzzle on every device. */
  seed: string;
  /** Allowed clue kinds. The generator picks a mix from these. Empty means classic rules only. */
  rules: ClueKind[];
  difficulty: Difficulty;
  /** Distinct clue kinds to use, default 2 to 3 (clamped to rules.length). */
  minKinds?: number;
  maxKinds?: number;
  /** Also compute a FogSpec that keeps the puzzle solvable with only the visible information. */
  fog?: boolean;
  /** Hide every cage total. The puzzle must stay uniquely solvable. */
  hiddenCageTotals?: boolean;
}

export interface FogSpec {
  /** Cells visible at the start. */
  start: CellIndex[];
  /** A correct digit clears every cell within this Chebyshev distance. */
  radius: 1;
}

export interface GeneratedPuzzle extends Puzzle {
  fog?: FogSpec;
}

export type HintRule = ClueKind | 'row' | 'column' | 'box' | 'region' | 'cell';

export interface HintStep {
  /** 1 says where to look, 2 names the rule, 3 gives the move. */
  level: 1 | 2 | 3;
  /** Cells to highlight. */
  focus: CellIndex[];
  rule: HintRule;
  /** Plain English, no em dashes. */
  text: string;
  /** Present on level 3. */
  move?: { cell: CellIndex; digit: Digit };
  /** Optional note eliminations the step justifies. */
  eliminate?: { cell: CellIndex; digits: Digit[] }[];
}

export interface Conflict {
  cells: CellIndex[];
  rule: ClueKind | 'row' | 'column' | 'box' | 'region';
}
