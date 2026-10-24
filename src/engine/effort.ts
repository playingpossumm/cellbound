// Estimated solving time for an experienced player, used to pace the 9x9
// Dailies. The logical solver plays the puzzle; each placement costs input
// time plus a search cost that shrinks with the number of moves open at that
// moment, and clue steps, pointing, pairs and contradiction tests cost more.
// Puzzles that keep many moves open are quicker than puzzles that offer one
// move at a time, which is what Pelanek found in human solving times
// ("Difficulty Rating of Sudoku Puzzles: An Overview and Evaluation", 2014).
// The 9x9 Dailies are cut to these estimates, so changing a cost changes
// them; see the note at the top of craft.ts.
import { Logic } from './logic';
import { buildModel, POP, support, type Model } from './model';
import type { PuzzleShape } from './types';

/** Seconds per unit of work. Search costs are for one open move and fall with the square root of the count. */
export const EFFORT_COST = {
  /** Selecting a cell and entering a digit. */
  input: 1.8,
  /** Finding a naked or hidden single. */
  single: 12,
  /** Finding a deduction from one clue. */
  clue: 20,
  /** Pointing or claiming. */
  locked: 30,
  /** A naked or hidden pair. */
  pair: 45,
  /** A contradiction test of unknown length. */
  probe: 120,
  /** A short contradiction test: a base cost plus a cost per forced cell in its chain. */
  probeBase: 60,
  probeStep: 10,
} as const;

export interface EffortOptions {
  /** Use short contradiction tests (see Logic.probeDepth) of at most this many forced cells. */
  probeDepth?: number;
}

export interface Effort {
  /** Estimated seconds for an experienced player. */
  seconds: number;
  solved: boolean;
  /** Solver steps by kind: naked, hidden, clue, locked, nakedPair, hiddenPair, probe. */
  steps: Record<string, number>;
  /** Clue steps per clue kind, so a test can see that every kind does some work. */
  clueSteps: Record<string, number>;
}

/** Cells that a naked or hidden single would fill right now. */
function openSingles(L: Logic): number {
  const { m, masks, values } = L;
  const seen = new Uint8Array(m.N);
  let k = 0;
  for (let c = 0; c < m.N; c++) {
    if (!values[c] && POP[masks[c]] === 1) { seen[c] = 1; k++; }
  }
  for (const cells of m.houses) {
    let once = 0, twice = 0, placed = 0;
    for (const c of cells) {
      const v = masks[c];
      if (values[c]) { placed |= v; continue; }
      twice |= once & v;
      once |= v;
    }
    let uniq = once & ~twice & ~placed;
    while (uniq) {
      const b = uniq & -uniq;
      uniq ^= b;
      for (const c of cells) {
        if (!values[c] && masks[c] & b && !seen[c]) { seen[c] = 1; k++; }
      }
    }
  }
  return k;
}

/** Clues that would remove a candidate right now. */
function openClues(m: Model, L: Logic): number {
  const { masks, values } = L;
  let k = 0;
  for (const con of m.cons) {
    if (con.cells.every((c) => values[c])) continue;
    const sup = support(con, masks);
    if (sup && con.cells.some((c, i) => !values[c] && masks[c] & ~sup[i])) k++;
  }
  return k;
}

/**
 * Plays the puzzle with the grading solver (same steps, same contradiction
 * budget) and adds up the estimated time. With probeDepth it uses short
 * contradiction tests instead (see Logic.probeDepth), as a person would.
 */
export function estimateEffort(p: PuzzleShape, opts: EffortOptions = {}): Effort {
  const m = buildModel(p);
  const L = new Logic(m, p.givens);
  L.probeBudget = p.size === 9 ? 12 : 40;
  L.probeDepth = opts.probeDepth ?? Infinity;
  const C = EFFORT_COST;
  let seconds = 0;
  const clueSteps: Record<string, number> = {};
  for (let guard = 0; guard < 4 * m.N * m.n && !L.solved(); guard++) {
    const singles = openSingles(L);
    if (singles) {
      L.next(1);
      seconds += C.input + C.single / Math.sqrt(singles);
      continue;
    }
    const clues = openClues(m, L);
    if (clues) {
      const s = L.next(2)!;
      seconds += C.clue / Math.sqrt(clues);
      const kind = m.cons[s.con!].kind === 'negKropki' ? 'kropki' : m.cons[s.con!].kind;
      clueSteps[kind] = (clueSteps[kind] ?? 0) + 1;
      continue;
    }
    const s = L.next(4);
    if (!s) break;
    if (s.kind === 'probe') seconds += s.depth === undefined ? C.probe : C.probeBase + C.probeStep * s.depth;
    else seconds += s.kind === 'locked' ? C.locked : C.pair;
  }
  const steps: Record<string, number> = {};
  for (const s of L.steps) steps[s.kind] = (steps[s.kind] ?? 0) + 1;
  return { seconds: Math.round(seconds), solved: L.solved(), steps, clueSteps };
}
