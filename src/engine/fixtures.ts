import type { Puzzle } from './types';

// The 6x6 puzzle from the look studies. Its seven givens make it unique;
// the clues alone leave two solutions.
const solution = [
  2, 5, 4, 1, 6, 3,
  6, 3, 1, 4, 2, 5,
  1, 6, 3, 5, 4, 2,
  4, 2, 5, 3, 1, 6,
  5, 4, 2, 6, 3, 1,
  3, 1, 6, 2, 5, 4,
];

const givens = solution.map((d, i) => ([5, 8, 13, 17, 22, 24, 33].includes(i) ? d : 0));

export const LYRA: Puzzle = {
  id: 'fixture-lyra',
  seed: 'fixture-lyra',
  size: 6,
  boxW: 3,
  boxH: 2,
  givens,
  solution,
  clues: [
    { kind: 'thermo', cells: [31, 26, 21, 16] },
    { kind: 'arrow', circle: 1, path: [8, 9] },
    { kind: 'cage', cells: [4, 5, 11], sum: 14 },
    { kind: 'renban', cells: [18, 19, 14] },
    { kind: 'kropki', a: 34, b: 35, color: 'white' },
    { kind: 'kropki', a: 27, b: 28, color: 'black' },
  ],
  difficulty: 2,
  score: 0,
  name: 'Lyra',
};
