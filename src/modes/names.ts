// Rule names and one-line texts, exactly as the spec words them.
import type { ClueKind } from '../engine/types';

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

export const RULE_TEXTS: Record<ClueKind, string> = {
  thermo: 'Digits rise from the round bulb to the far end of the line.',
  arrow: 'Digits along the arrow add up to the digit in its circle.',
  cage: 'Digits in the cage add up to its small total and never repeat.',
  renban: 'The line holds a run of consecutive digits, in any order.',
  whisper: 'Neighbours on the line differ by at least {minDiff}.',
  kropki: 'A white dot joins digits one apart, a black dot a digit and its double.',
  xv: 'An X joins digits that sum to 10, a V digits that sum to 5.',
  diagonal: 'Each diagonal holds every digit once.',
  antiKnight: "Equal digits are never a knight's move apart.",
};

export const DIFFICULTY_NAMES = ['', 'Gentle', 'Easy', 'Medium', 'Hard', 'Fiendish'] as const;

/** "Thermo", "Thermo and Arrow", "Thermo, Arrow and Cage". */
export function listRules(kinds: ClueKind[]): string {
  const names = kinds.map((k) => RULE_NAMES[k]);
  if (names.length < 2) return names.join('');
  return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
}
