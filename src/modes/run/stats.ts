// Run statistics and the unlock milestones. Unlocks are derived from the counters, so
// there is no separate list to keep in step.
import { CARDS, type Card, type UnlockId } from './cards';
import type { BoardResult, RunOutcome, RunState } from './state';

export interface DailyRecord {
  score: number;
  /** Boards cleared in the first attempt. */
  boards: number;
  outcome: RunOutcome;
}

export interface RunStats {
  started: number;
  finished: number;
  failed: number;
  abandoned: number;
  /** Highest score of any free run. */
  bestFree: { score: number; date: string } | null;
  /** The first attempt of each date, and only the first. */
  dailyBest: Record<string, DailyRecord>;
  /** Furthest board number started in any run, 0 to 5. */
  topBoard: number;
  /** Most hearts left at the end of a finished run. */
  bestHearts: number;
  /** Boards cleared with a curse or bargain in force. */
  cursedCleared: number;
}

export function emptyStats(): RunStats {
  return {
    started: 0,
    finished: 0,
    failed: 0,
    abandoned: 0,
    bestFree: null,
    dailyBest: {},
    topBoard: 0,
    bestHearts: 0,
    cursedCleared: 0,
  };
}

export function onRunStart(s: RunStats): RunStats {
  return { ...s, started: s.started + 1 };
}

/** boardNumber is 1 to 5. */
export function onBoardStart(s: RunStats, boardNumber: number): RunStats {
  return boardNumber > s.topBoard ? { ...s, topBoard: boardNumber } : s;
}

export function onBoardEnd(s: RunStats, result: BoardResult): RunStats {
  return result.status === 'solved' && result.cursed ? { ...s, cursedCleared: s.cursedCleared + 1 } : s;
}

/** Folds a run that has just ended into the stats. today is YYYY-MM-DD. */
export function onRunEnd(s: RunStats, run: RunState, today: string): RunStats {
  if (!run.outcome) return s;
  const next: RunStats = { ...s, dailyBest: { ...s.dailyBest } };
  if (run.outcome === 'finished') {
    next.finished += 1;
    next.bestHearts = Math.max(next.bestHearts, run.hearts);
  } else if (run.outcome === 'failed') {
    next.failed += 1;
  } else {
    next.abandoned += 1;
  }
  if (run.daily) {
    // Only the first attempt of a date sets the daily best; replays never change it.
    if (!next.dailyBest[run.daily]) {
      next.dailyBest[run.daily] = {
        score: run.score,
        boards: run.results.filter((r) => r.status === 'solved').length,
        outcome: run.outcome,
      };
    }
  } else if (run.score > 0 && (!next.bestFree || run.score > next.bestFree.score)) {
    next.bestFree = { score: run.score, date: today };
  }
  return next;
}

export function bestDaily(s: RunStats): { date: string; score: number } | null {
  let best: { date: string; score: number } | null = null;
  for (const [date, r] of Object.entries(s.dailyBest)) {
    if (!best || r.score > best.score) best = { date, score: r.score };
  }
  return best;
}

// ---- milestones ------------------------------------------------------------------------

export interface Milestone {
  id: UnlockId;
  /** How to earn it, as shown in the Collection. */
  how: string;
  goal: number;
  progress(s: RunStats): number;
}

export const MILESTONES: readonly Milestone[] = [
  { id: 'first-run', how: 'Finish a run.', goal: 1, progress: (s) => s.finished },
  { id: 'board-3', how: 'Reach board 3 in any run.', goal: 3, progress: (s) => s.topBoard },
  // Five 9x9 boards hold nearly twice the digits of the old run, so one lost heart is allowed.
  { id: 'full-hearts', how: 'Finish a run with 2 hearts or more left.', goal: 2, progress: (s) => s.bestHearts },
  { id: 'cursed-board', how: 'Clear a board that has a curse on it.', goal: 1, progress: (s) => s.cursedCleared },
  {
    id: 'daily-3',
    how: 'Play the daily run on three different days.',
    goal: 3,
    // A day counts once a board was cleared in the first attempt, so opening and dropping a run does not.
    progress: (s) => Object.values(s.dailyBest).filter((r) => r.boards >= 1).length,
  },
];

export function milestoneOf(id: UnlockId): Milestone {
  return MILESTONES.find((m) => m.id === id)!;
}

export function unlockedSet(s: RunStats): Set<UnlockId> {
  const out = new Set<UnlockId>();
  for (const m of MILESTONES) if (m.progress(s) >= m.goal) out.add(m.id);
  return out;
}

export function newlyUnlocked(before: RunStats, after: RunStats): UnlockId[] {
  const was = unlockedSet(before);
  return [...unlockedSet(after)].filter((id) => !was.has(id));
}

export function cardsUnlockedBy(ids: UnlockId[]): Card[] {
  return CARDS.filter((c) => c.unlock && ids.includes(c.unlock));
}
