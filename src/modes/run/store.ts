// The Run controller: a small zustand store that applies the pure transitions, keeps
// the stats and saves after every change.
import { create } from 'zustand';
import { dailyDate, dailyRunSeed } from '../../engine';
import { cardPool, type Card, type UnlockId } from './cards';
import {
  abandon,
  advance,
  choose,
  finishBoard,
  newRun,
  type BoardEnd,
  type RunState,
} from './state';
import {
  onBoardEnd,
  onBoardStart,
  onRunEnd,
  onRunStart,
  unlockedSet,
  type RunStats,
} from './stats';
import { loadRunStorage, saveRunStorage, type RunStorage } from './storage';

interface RunStore {
  data: RunStorage;
  /** The run on screen: the unfinished one, or one that just ended. Null on the Run home. */
  run: RunState | null;
  /** Cards opened by the run that just ended. */
  fresh: UnlockId[];
}

export const useRunStore = create<RunStore>(() => ({ data: loadRunStorage(), run: null, fresh: [] }));

const get = () => useRunStore.getState();

/** Milestones reached since the run began, which the summary announces. */
export function unlockedByRun(run: RunState, stats: RunStats): UnlockId[] {
  const before = new Set(run.unlockedAtStart ?? []);
  return [...unlockedSet(stats)].filter((id) => !before.has(id));
}

function commit(data: RunStorage, run: RunState | null, fresh?: UnlockId[]) {
  useRunStore.setState(fresh ? { data, run, fresh } : { data, run });
  saveRunStorage(data);
}

/** A random run seed from the browser's secure generator. */
export function randomSeed(): string {
  const words = new Uint32Array(2);
  try {
    crypto.getRandomValues(words);
  } catch {
    // No secure generator in this browser: a free run does not need one.
    words[0] = Math.floor(Math.random() * 2 ** 32);
    words[1] = Math.floor(Math.random() * 2 ** 32);
  }
  return 'free:' + Array.from(words, (w) => w.toString(36).padStart(7, '0')).join('');
}

/** The cards a run may offer: daily runs use starter cards only, so everyone sees the same ones. */
export function poolFor(run: RunState, stats: RunStats): Card[] {
  return cardPool(unlockedSet(stats), run.daily !== null);
}

export function hasDailyBest(stats: RunStats, date: string): boolean {
  return !!stats.dailyBest[date];
}

export const runActions = {
  /** Starts a run. An unfinished run is given up first, and counts as an attempt. */
  start(kind: 'daily' | 'free', now: number = Date.now(), today: string = dailyDate()): void {
    let { data } = get();
    if (data.current) {
      const ended = abandon(data.current);
      data = { ...data, current: null, last: ended, stats: onRunEnd(data.stats, ended, today) };
    }
    const daily = kind === 'daily' ? today : null;
    const fresh = newRun(daily ? dailyRunSeed(daily) : randomSeed(), daily, now, daily !== null && hasDailyBest(data.stats, daily));
    const run = { ...fresh, unlockedAtStart: [...unlockedSet(data.stats)] };
    const stats = onBoardStart(onRunStart(data.stats), 1);
    commit({ ...data, current: run, stats }, run, []);
  },

  resume(): void {
    const { data } = get();
    if (data.current) useRunStore.setState({ run: data.current });
  },

  viewLast(): void {
    const { data } = get();
    if (data.last) useRunStore.setState({ run: { ...data.last, phase: 'done' }, fresh: [] });
  },

  /** Back to the Run home. An unfinished run stays saved. */
  home(): void {
    useRunStore.setState({ run: null });
  },

  /** The game store reported that the current board ended. */
  reportBoard(end: BoardEnd, today: string = dailyDate()): void {
    const { data, run } = get();
    if (!run || run.phase !== 'board') return;
    const next = finishBoard(run, end);
    let stats = onBoardEnd(data.stats, next.results[next.results.length - 1]);
    if (next.outcome) {
      const ended = { ...next, recorded: true };
      stats = onRunEnd(stats, ended, today);
      commit({ ...data, current: null, last: ended, stats }, ended, unlockedByRun(ended, stats));
    } else {
      commit({ ...data, current: next, stats }, next);
    }
  },

  /** Leaves the result screen for the card choice or the summary. */
  next(): void {
    const { data, run } = get();
    if (!run || run.phase !== 'result') return;
    const moved = advance(run, poolFor(run, data.stats));
    if (moved.phase === 'done') {
      useRunStore.setState({ run: moved });
      return;
    }
    commit({ ...data, current: moved }, moved);
  },

  pick(cardId: string): void {
    const { data, run } = get();
    if (!run || run.phase !== 'choose') return;
    const next = choose(run, cardId);
    if (next === run) return;
    commit({ ...data, current: next, stats: onBoardStart(data.stats, next.index + 1) }, next);
  },

  /** Ends the run in view (or the saved one) early. */
  giveUp(today: string = dailyDate()): void {
    const { data, run } = get();
    const target = run && !run.outcome ? run : data.current;
    if (!target) return;
    const ended = { ...abandon(target), recorded: true };
    const stats = onRunEnd(data.stats, ended, today);
    commit({ ...data, current: null, last: ended, stats }, ended, unlockedByRun(ended, stats));
  },
};

/** Test helper: put the store back to a given state. */
export function resetRunStore(data: RunStorage = loadRunStorage(null)): void {
  useRunStore.setState({ data, run: null, fresh: [] });
}
