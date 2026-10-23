// Lesson content: a title, the rule line, two to four short steps with a small board each,
// and a practice puzzle. Copy is plain English: short sentences, no em dashes.
import type { Clue, ClueKind, Puzzle } from '../../engine/types';
import { RULE_NAMES, RULE_TEXTS } from '../names';
import { PRACTICE } from './practice';

export type LessonId = ClueKind | 'basics';

/** A small board drawn in the visual vocabulary of the app. */
export interface Illustration {
  size: 4 | 6;
  /** Digits as one string per row, a dot for an empty cell. */
  rows?: string[];
  /** Digits in the player's colour, by cell index. */
  mine?: Record<number, number>;
  clues?: Clue[];
  /** Strong highlight: tint and ring. */
  focus?: number[];
  /** Soft highlight, for a row, column or box. */
  tint?: number[];
  /** Cells ruled out, drawn with a cross. */
  cross?: number[];
  /** Knight's move paths, drawn as dashed L shapes from one cell to another. */
  links?: Array<[number, number]>;
  /** Spoken description for screen readers. */
  label: string;
}

export interface Step {
  text: string;
  art: Illustration;
}

export interface Lesson {
  id: LessonId;
  title: string;
  /** The one-line rule, worded as in the rule chips. */
  rule: string;
  steps: Step[];
}

const row = (n: number, r: number) => Array.from({ length: n }, (_, c) => r * n + c);
const col = (n: number, c: number) => Array.from({ length: n }, (_, r) => r * n + c);
const box6 = (b: number) => {
  const r0 = Math.floor(b / 2) * 2;
  const c0 = (b % 2) * 3;
  return [0, 1].flatMap((dr) => [0, 1, 2].map((dc) => (r0 + dr) * 6 + c0 + dc));
};

const knight = (n: number, i: number) => {
  const r = Math.floor(i / n);
  const c = i % n;
  return [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]]
    .map(([a, b]) => [r + a, c + b])
    .filter(([a, b]) => a >= 0 && b >= 0 && a < n && b < n)
    .map(([a, b]) => a * n + b);
};

const whisperText = (n: number) => RULE_TEXTS.whisper.replace('{minDiff}', String(n));

export const LESSONS: Lesson[] = [
  {
    id: 'basics',
    title: 'The basics',
    rule: 'Every row, column and box holds each digit once.',
    steps: [
      {
        text: 'Fill the grid with the digits 1 to 6. Each row holds every digit once. This row has 3, 6, 1, 5 and 2, so the empty cell must be 4.',
        art: {
          size: 6,
          rows: ['36152.', '......', '......', '......', '......', '......'],
          tint: row(6, 0),
          focus: [5],
          label: 'A six by six grid. The top row holds 3, 6, 1, 5 and 2 and one empty cell at the end.',
        },
      },
      {
        text: 'Each column holds every digit once too. This column has 4, 6, 1, 5 and 3, so the empty cell at the bottom must be 2.',
        art: {
          size: 6,
          rows: ['.....4', '.....6', '.....1', '.....5', '.....3', '......'],
          tint: col(6, 5),
          focus: [35],
          label: 'A six by six grid. The right column holds 4, 6, 1, 5 and 3 and one empty cell at the bottom.',
        },
      },
      {
        text: 'The grid is split into six boxes, each three cells wide and two tall. Each box holds every digit once. This box needs a 2.',
        art: {
          size: 6,
          rows: ['361...', '54....', '......', '......', '......', '......'],
          tint: box6(0),
          focus: [8],
          label: 'A six by six grid. The top left box holds 3, 6, 1, 5 and 4 and one empty cell.',
        },
      },
      {
        text: 'Look for an empty cell where only one digit fits. Its row, column and box already hold 1, 2, 4, 5 and 6, so this cell must be 3. Place it, then look again.',
        art: {
          size: 6,
          rows: ['36152.', '..2...', '4.5..1', '.26.35', '.1..53', '6...42'],
          tint: [...new Set([...row(6, 2), ...col(6, 1), ...box6(2)])].filter((i) => i !== 13),
          focus: [13],
          label: 'A six by six grid with one empty cell lit. Its row, column and box hold every digit but 3.',
        },
      },
    ],
  },
  {
    id: 'thermo',
    title: RULE_NAMES.thermo,
    rule: RULE_TEXTS.thermo,
    steps: [
      {
        text: 'A thermometer is a line with a round bulb at one end.',
        art: {
          size: 4,
          clues: [{ kind: 'thermo', cells: [12, 8, 4, 0] }],
          label: 'A four by four grid with a thermometer running up the left column. The bulb is at the bottom.',
        },
      },
      {
        text: 'Each digit is bigger than the one before it. Here the line holds 1, then 3, then 4.',
        art: {
          size: 4,
          clues: [{ kind: 'thermo', cells: [12, 13, 14] }],
          mine: { 12: 1, 13: 3, 14: 4 },
          label: 'A thermometer along the bottom row holding 1, then 3, then 4.',
        },
      },
      {
        text: 'Start at the ends. The bulb can never be the biggest digit and the far end can never be 1. A thermometer of four cells on this grid must hold 1, 2, 3, 4.',
        art: {
          size: 4,
          clues: [{ kind: 'thermo', cells: [3, 7, 11, 15] }],
          mine: { 3: 1, 7: 2, 11: 3, 15: 4 },
          label: 'A thermometer down the right column holding 1, 2, 3, 4 from the bulb at the top.',
        },
      },
    ],
  },
  {
    id: 'arrow',
    title: RULE_NAMES.arrow,
    rule: RULE_TEXTS.arrow,
    steps: [
      {
        text: 'An arrow has a circle at one end and a line that finishes in a point.',
        art: {
          size: 4,
          clues: [{ kind: 'arrow', circle: 4, path: [5, 6] }],
          label: 'A four by four grid with an arrow. The circle is in the second row, first column, and the line runs right.',
        },
      },
      {
        text: 'Here the line holds 1 and 3, which add up to the 4 in the circle.',
        art: {
          size: 4,
          clues: [{ kind: 'arrow', circle: 4, path: [5, 6] }],
          mine: { 4: 4, 5: 1, 6: 3 },
          label: 'An arrow with 4 in the circle and 1 and 3 on the line.',
        },
      },
      {
        text: 'The circle is always bigger than each digit on its line. A 3 in the circle means the line can only hold 1 and 2.',
        art: {
          size: 4,
          clues: [{ kind: 'arrow', circle: 8, path: [9, 10] }],
          mine: { 8: 3, 9: 1, 10: 2 },
          label: 'An arrow with 3 in the circle and 1 and 2 on the line.',
        },
      },
    ],
  },
  {
    id: 'cage',
    title: RULE_NAMES.cage,
    rule: RULE_TEXTS.cage,
    steps: [
      {
        text: 'A dashed outline is a cage. The small number in its corner is the total.',
        art: {
          size: 4,
          clues: [{ kind: 'cage', cells: [0, 1, 5], sum: 7 }],
          label: 'A four by four grid with a dashed cage of three cells in the top left. Its total is 7.',
        },
      },
      {
        text: 'Here the cage holds 1, 4 and 2, which add up to its total of 7.',
        art: {
          size: 4,
          clues: [{ kind: 'cage', cells: [0, 1, 5], sum: 7 }],
          mine: { 0: 1, 1: 4, 5: 2 },
          label: 'A cage with total 7 holding 1, 4 and 2.',
        },
      },
      {
        text: 'A digit never repeats inside a cage. A cage of two cells with a total of 3 must hold 1 and 2.',
        art: {
          size: 4,
          clues: [{ kind: 'cage', cells: [10, 11], sum: 3 }],
          mine: { 10: 2, 11: 1 },
          label: 'A cage of two cells with total 3 holding 2 and 1.',
        },
      },
    ],
  },
  {
    id: 'renban',
    title: RULE_NAMES.renban,
    rule: RULE_TEXTS.renban,
    steps: [
      {
        text: 'A wide pale line joining cells is a renban line.',
        art: {
          size: 4,
          clues: [{ kind: 'renban', cells: [4, 5, 6] }],
          label: 'A four by four grid with a renban line across three cells in the second row.',
        },
      },
      {
        text: '2, 3 and 4 make a run, and so do 3, 2 and 4. Here the line holds 3, 2 and 4.',
        art: {
          size: 4,
          clues: [{ kind: 'renban', cells: [4, 5, 6] }],
          mine: { 4: 3, 5: 2, 6: 4 },
          label: 'A renban line holding 3, 2 and 4.',
        },
      },
      {
        text: 'A digit never repeats on the line. A line of three cells on this grid holds 1, 2, 3 or 2, 3, 4, so 2 and 3 are always on it.',
        art: {
          size: 4,
          clues: [{ kind: 'renban', cells: [9, 10, 11] }],
          mine: { 9: 2, 10: 3 },
          focus: [11],
          label: 'A renban line with 2 and 3 placed and the last cell empty. It can be 1 or 4.',
        },
      },
    ],
  },
  {
    id: 'whisper',
    title: RULE_NAMES.whisper,
    rule: whisperText(2),
    steps: [
      {
        text: 'A whisper line is a thin line that joins cells one after another.',
        art: {
          size: 4,
          clues: [{ kind: 'whisper', cells: [4, 5, 6, 7], minDiff: 2 }],
          label: 'A four by four grid with a thin whisper line across the second row.',
        },
      },
      {
        text: 'The gap depends on the grid. It is 2 here, 3 on a 6 by 6 grid and 5 on a 9 by 9 grid. Every pair of neighbours on this line is at least 2 apart.',
        art: {
          size: 4,
          clues: [{ kind: 'whisper', cells: [4, 5, 6, 7], minDiff: 2 }],
          mine: { 4: 2, 5: 4, 6: 1, 7: 3 },
          label: 'A whisper line holding 2, 4, 1 and 3. Each neighbour is at least 2 apart.',
        },
      },
      {
        text: 'Low digits sit beside high digits. A 2 can only sit beside a 4, and a 3 only beside a 1.',
        art: {
          size: 4,
          clues: [{ kind: 'whisper', cells: [5, 6, 10], minDiff: 2 }],
          mine: { 6: 2 },
          focus: [5, 10],
          label: 'A bent whisper line with a 2 in the middle. Both neighbours must be 4.',
        },
      },
    ],
  },
  {
    id: 'kropki',
    title: RULE_NAMES.kropki,
    rule: RULE_TEXTS.kropki,
    steps: [
      {
        text: 'A white dot sits between two cells whose digits are one apart, like 3 and 4.',
        art: {
          size: 4,
          clues: [{ kind: 'kropki', a: 5, b: 6, color: 'white' }],
          mine: { 5: 3, 6: 4 },
          label: 'A white dot between a 3 and a 4.',
        },
      },
      {
        text: 'A black dot sits between a digit and its double, like 2 and 4, or 1 and 2.',
        art: {
          size: 4,
          clues: [{ kind: 'kropki', a: 9, b: 10, color: 'black' }],
          mine: { 9: 2, 10: 4 },
          label: 'A black dot between a 2 and a 4.',
        },
      },
      {
        text: 'Next to a 4, a white dot leads to a 3 and a black dot leads to a 2. Use the biggest and smallest digits first.',
        art: {
          size: 4,
          clues: [
            { kind: 'kropki', a: 4, b: 5, color: 'white' },
            { kind: 'kropki', a: 10, b: 11, color: 'black' },
          ],
          mine: { 4: 4, 10: 4 },
          focus: [5, 11],
          label: 'Two 4s, each with a dot beside it. The white dot leads to 3 and the black dot to 2.',
        },
      },
    ],
  },
  {
    id: 'xv',
    title: RULE_NAMES.xv,
    rule: RULE_TEXTS.xv,
    steps: [
      {
        text: 'Look for a small X or V between two cells. It tells you what the two digits add up to.',
        art: {
          size: 6,
          clues: [
            { kind: 'xv', a: 13, b: 14, sum: 10 },
            { kind: 'xv', a: 20, b: 21, sum: 5 },
          ],
          label: 'A six by six grid with an X between two cells in the third row and a V between two cells below.',
        },
      },
      {
        text: 'An X means 10 and a V means 5. On this grid an X can only join 4 and 6, and a V joins 1 and 4, or 2 and 3.',
        art: {
          size: 6,
          clues: [
            { kind: 'xv', a: 13, b: 14, sum: 10 },
            { kind: 'xv', a: 20, b: 21, sum: 5 },
          ],
          mine: { 13: 4, 14: 6, 20: 2, 21: 3 },
          label: 'An X between 4 and 6, and a V between 2 and 3.',
        },
      },
    ],
  },
  {
    id: 'diagonal',
    title: RULE_NAMES.diagonal,
    rule: RULE_TEXTS.diagonal,
    steps: [
      {
        text: 'Two long lines run from corner to corner.',
        art: {
          size: 4,
          clues: [{ kind: 'diagonal' }],
          label: 'A four by four grid with both diagonals drawn.',
        },
      },
      {
        text: 'This comes on top of the usual rows, columns and boxes. Here the diagonal already has 1, 2 and 3, so the marked cell must be 4.',
        art: {
          size: 4,
          clues: [{ kind: 'diagonal' }],
          mine: { 0: 1, 5: 2, 10: 3 },
          focus: [15],
          tint: [0, 5, 10],
          label: 'The main diagonal holds 1, 2 and 3, with the last cell empty.',
        },
      },
    ],
  },
  {
    id: 'antiKnight',
    title: RULE_NAMES.antiKnight,
    rule: RULE_TEXTS.antiKnight,
    steps: [
      {
        text: 'A knight in chess jumps two cells one way and one cell the other. Here are all the cells this knight can reach.',
        art: {
          size: 6,
          mine: { 14: 3 },
          focus: [14],
          tint: knight(6, 14),
          label: 'A six by six grid with one cell marked and the eight cells a knight jump away tinted.',
        },
      },
      {
        text: 'So a 3 here rules out 3 in every cell a knight can reach. Those cells are crossed out.',
        art: {
          size: 6,
          mine: { 14: 3 },
          focus: [14],
          cross: knight(6, 14),
          label: 'A 3 with crosses on every cell a knight jump away.',
        },
      },
      {
        text: "Use it like a row or a column. The marked cell is a knight's move from both a 3 and a 5, so it can be neither.",
        art: {
          size: 6,
          mine: { 12: 5, 14: 3 },
          tint: [12, 14],
          focus: [25],
          links: [
            [12, 25],
            [14, 25],
          ],
          label: 'A 5 and a 3 in the same row. The marked cell is a knight jump from both.',
        },
      },
    ],
  },
];

export const LESSON_IDS: LessonId[] = LESSONS.map((l) => l.id);

export function lessonById(id: LessonId): Lesson {
  return LESSONS.find((l) => l.id === id)!;
}

/** The practice puzzle for a lesson, in the engine's Puzzle shape. */
export function practicePuzzle(id: LessonId): Puzzle {
  const d = PRACTICE[id];
  return {
    id: `learn-${id}`,
    seed: `learn-${id}`,
    size: d.size,
    boxW: d.boxW,
    boxH: d.boxH,
    givens: d.givens.slice(),
    solution: d.solution.slice(),
    clues: d.clues.map((c) => ({ ...c })) as Clue[],
    difficulty: 1,
    score: 0,
    name: lessonById(id).title,
  };
}
