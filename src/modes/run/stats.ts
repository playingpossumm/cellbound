// Run statistics, the technique codex and the unlock milestones. Unlocks are read off the
// counters, so there is no separate list to keep in step.
import type { TechniqueId } from '../../engine/techniques';
import { anteOf } from './boards';
import { LENSES, type LensDef } from './lenses';
import type { BestPlacement, BoardResult, RunOutcome, RunState, TechTally, UnlockId } from './model';
import { REWARDS, type RewardDef } from './rewards';

export interface DailyRecord {
  score: number;
  /** Boards cleared in the first attempt. */
  cleared: number;
  outcome: RunOutcome;
}

export interface RunStats {
  started: number;
  won: number;
  lost: number;
  abandoned: number;
  /** Highest score of any free run. */
  bestFree: { score: number; date: string } | null;
  /** The first attempt of each date, and only the first. */
  dailyBest: Record<string, DailyRecord>;
  /** Furthest ante reached in any run, 0 to 3. */
  topAnte: number;
  /** Boss boards cleared. */
  bosses: number;
  /** Boards finished with every box clean. */
  cleanBoards: number;
  /** Placements and best single placement per technique, over every run. */
  codex: Partial<Record<TechniqueId, { n: number; best: number }>>;
  /** The best single placement of any run. */
  best: BestPlacement | null;
}

export function emptyStats(): RunStats {
  return {
    started: 0,
    won: 0,
    lost: 0,
    abandoned: 0,
    bestFree: null,
    dailyBest: {},
    topAnte: 0,
    bosses: 0,
    cleanBoards: 0,
    codex: {},
    best: null,
  };
}

export function onRunStart(s: RunStats): RunStats {
  return { ...s, started: s.started + 1, topAnte: Math.max(s.topAnte, 1) };
}

/** A board was started: the ante it is in counts as reached. */
export function onBoardStart(s: RunStats, slot: number): RunStats {
  const ante = anteOf(slot);
  return ante > s.topAnte ? { ...s, topAnte: ante } : s;
}

/** Folds a technique tally into the codex. */
export function addToCodex(s: RunStats, tech: TechTally, best: BestPlacement | null): RunStats {
  const codex = { ...s.codex };
  for (const [id, t] of Object.entries(tech) as [TechniqueId, { n: number; points: number; top: number }][]) {
    const was = codex[id] ?? { n: 0, best: 0 };
    codex[id] = { n: was.n + t.n, best: Math.max(was.best, t.top) };
  }
  const top = best && (!s.best || best.points > s.best.points) ? best : s.best;
  return { ...s, codex, best: top };
}

export function onBoardEnd(s: RunStats, r: BoardResult, boxesAllClean: boolean): RunStats {
  let next = addToCodex(s, r.tech, r.best);
  if (r.status === 'cleared' && r.rule !== null) next = { ...next, bosses: next.bosses + 1 };
  if (boxesAllClean && (r.status === 'cleared' || r.status === 'missed')) next = { ...next, cleanBoards: next.cleanBoards + 1 };
  return next;
}

/** Folds a run that has just ended into the stats. today is YYYY-MM-DD. */
export function onRunEnd(s: RunStats, run: RunState, today: string): RunStats {
  if (!run.outcome) return s;
  const next: RunStats = { ...s, dailyBest: { ...s.dailyBest } };
  if (run.outcome === 'won') next.won += 1;
  else if (run.outcome === 'lost') next.lost += 1;
  else next.abandoned += 1;
  if (run.daily) {
    // Only the first attempt of a date sets the daily best; replays never change it.
    if (!next.dailyBest[run.daily] && !run.replay) {
      next.dailyBest[run.daily] = {
        score: run.score,
        cleared: run.results.filter((r) => r.status === 'cleared').length,
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
  /** How to earn it, as the Collection shows it. */
  how: string;
  goal: number;
  progress(s: RunStats): number;
}

export const MILESTONES: readonly Milestone[] = [
  { id: 'boss', how: 'Beat a boss.', goal: 1, progress: (s) => s.bosses },
  { id: 'ante3', how: 'Reach ante 3.', goal: 3, progress: (s) => s.topAnte },
  { id: 'win', how: 'Win a run.', goal: 1, progress: (s) => s.won },
  { id: 'xwing', how: 'Place an X-Wing.', goal: 1, progress: (s) => s.codex.xWing?.n ?? 0 },
  { id: 'chain', how: 'Place a chain.', goal: 1, progress: (s) => (s.codex.chain?.n ?? 0) + (s.codex.forcing?.n ?? 0) },
  { id: 'clean', how: 'Finish a board with every box clean.', goal: 1, progress: (s) => s.cleanBoards },
  {
    id: 'daily3',
    how: 'Play the daily run on three days.',
    goal: 3,
    // A day counts once a board was cleared in its first attempt.
    progress: (s) => Object.values(s.dailyBest).filter((r) => r.cleared >= 1).length,
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

/** What a milestone opens. */
export function opensWith(id: UnlockId): { lenses: LensDef[]; rewards: RewardDef[] } {
  return { lenses: LENSES.filter((l) => l.unlock === id), rewards: REWARDS.filter((r) => r.unlock === id) };
}

/** Names of everything the milestones in `ids` opened. */
export function unlockedNames(ids: readonly UnlockId[]): string[] {
  return ids.flatMap((id) => {
    const o = opensWith(id);
    return [...o.lenses.map((l) => l.name), ...o.rewards.map((r) => r.name)];
  });
}
