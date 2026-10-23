// Rule chip names and one-line texts (spec section 3).
import type { ClueKind, Puzzle } from '../engine/types';

export const RULE_NAMES: Record<ClueKind, string> = {
  thermo: 'Thermo',
  arrow: 'Arrow',
  cage: 'Cage',
  renban: 'Renban',
  whisper: 'Whisper',
  kropki: 'Dots',
  xv: 'XV',
  diagonal: 'Diagonal',
  antiKnight: 'Anti-knight',
};

export const ALL_KINDS: ClueKind[] = ['thermo', 'arrow', 'cage', 'renban', 'whisper', 'kropki', 'xv', 'diagonal', 'antiKnight'];

export function ruleText(kind: ClueKind, puzzle?: Puzzle): string {
  switch (kind) {
    case 'thermo':
      return 'Digits rise from the round bulb to the far end of the line.';
    case 'arrow':
      return 'Digits along the arrow add up to the digit in its circle.';
    case 'cage':
      return 'Digits in the cage add up to its small total and never repeat.';
    case 'renban':
      return 'The line holds a run of consecutive digits, in any order.';
    case 'whisper': {
      const w = puzzle?.clues.find((c) => c.kind === 'whisper');
      const minDiff = w && w.kind === 'whisper' ? w.minDiff : puzzle?.size === 9 ? 5 : puzzle?.size === 4 ? 2 : 3;
      return `Neighbours on the line differ by at least ${minDiff}.`;
    }
    case 'kropki':
      return 'A white dot joins digits one apart, a black dot a digit and its double.';
    case 'xv':
      return 'An X joins digits that sum to 10, a V digits that sum to 5.';
    case 'diagonal':
      return 'Each diagonal holds every digit once.';
    case 'antiKnight':
      return "Equal digits are never a knight's move apart.";
  }
}

/** Clue kinds in the puzzle, in first-appearance order. */
export function kindsIn(puzzle: Puzzle): ClueKind[] {
  const out: ClueKind[] = [];
  for (const c of puzzle.clues) if (!out.includes(c.kind)) out.push(c.kind);
  return out;
}

export function classicText(size: number): string {
  return `Each row, column and box holds 1 to ${size} once. Tap a rule to read it.`;
}
