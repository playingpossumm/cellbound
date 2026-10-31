// The Run controller: a zustand store that applies the pure transitions, keeps the stats and
// saves after every change. It gets each ante's boards ready in the background, and it scores the
// board in play from the game store's placement events: each correct digit is classified by the
// engine off the input path (a macrotask later, never in the tap) and applied in the order the
// digits went in, so scoring never delays or blocks a move.
import { create } from 'zustand';
import { moves } from '../../app/motion';
import { dailyDate, dailyRunSeed } from '../../engine';
import { allRunStats } from '../../sync/account';
import { classifyPlacementAsync, hardestPlacementAsync, type PlacementClass } from '../../engine/techniques';
import { actions, getGame, onGameEnd, onPlacement, type PlacementEvent } from '../../game/store';
import type { GameState } from '../../game/types';
import { anteOf, KINDS, slotOf } from './boards';
import { fogOf, gameKey, prepareBoard, type Prepared } from './board';
import { withStolen } from './bosses';
import { itemById } from './items';
import { lensPool } from './lenses';
import { addHint, applyPlaced, hintsAllowed, markFilled, voidRule, type Placed, type Popup, type TallyFx } from './live';
import type { RewardId, RunDifficulty, RunState, UnlockId } from './model';
import { rewardPool } from './rewards';
import { buyItem, buyLens, moveLens, reroll, sellLens } from './shop';
import {
  abandon,
  canSkip,
  dropItem,
  endBoard,
  leaveShop,
  leaveTally,
  modsFor,
  newRun,
  passReward,
  pencilCells,
  playBoard,
  ruleOf,
  skip,
  takeReward,
  useSpectra,
  withTarget,
  type BoardEnd,
} from './state';
import { isRanked, levelOpen, onBoardEnd, onBoardStart, onRunEnd, onRunStart, unlockedSet, type RunStats } from './stats';
import { legacyRuns, loadRunStorage, saveRunStorage, type RunStorage } from './storage';
import { INK } from './tuning';

/** What the board shows for a moment: popups over the cells and the last marks times mult. */
export interface RunFx {
  popups: Popup[];
  tally: TallyFx | null;
  /**
   * Points on their way to the score, by placement. With motion on, a placement's points fly up to
   * the score, and the band shows the score without them until they land (landPoints).
   */
  air: Record<number, number>;
}

interface RunStore {
  data: RunStorage;
  /** The run on screen: the unfinished one, or one that just ended. Null on the Run home. */
  run: RunState | null;
  /** Milestones the run that just ended reached. */
  fresh: UnlockId[];
  /** A run just won in view, until its summary has played the win (runId). */
  won: string | null;
  /** Boards of the run on screen, as they get ready. Not saved: they rebuild the same. */
  ready: Record<number, Prepared | 'failed'>;
  readyFor: string;
  fx: RunFx;
  /** Runs the first Run counted, from its own save. */
  legacy: number;
}

/** Points in the air land by then at the latest, flown or not, so the band can never stay behind. */
const AIR_MS = 4000;
const airTimers = new Map<number, ReturnType<typeof setTimeout>>();

/** The board's passing effects, cleared: nothing on show and nothing in the air. */
function noFx(): RunFx {
  airTimers.forEach(clearTimeout);
  airTimers.clear();
  return { popups: [], tally: null, air: {} };
}

export const useRunStore = create<RunStore>(() => ({
  data: loadRunStorage(),
  run: null,
  fresh: [],
  won: null,
  ready: {},
  readyFor: '',
  fx: noFx(),
  legacy: legacyRuns(),
}));

const get = () => useRunStore.getState();
export const runId = (run: RunState) => `${run.seed}@${run.createdAt}`;

/** A placement's points reach the score: the band counts them in. */
export function landPoints(id: number): void {
  clearTimeout(airTimers.get(id));
  airTimers.delete(id);
  const { fx } = get();
  if (!(id in fx.air)) return;
  const air = { ...fx.air };
  delete air[id];
  useRunStore.setState({ fx: { ...fx, air } });
}

/** Milestones reached since the run began, which the summary announces. */
export function unlockedByRun(run: RunState, stats: RunStats): UnlockId[] {
  const before = new Set(run.unlockedAtStart ?? []);
  return [...unlockedSet(allRunStats(stats))].filter((id) => !before.has(id));
}

function commit(data: RunStorage, run: RunState | null, fresh?: UnlockId[]) {
  useRunStore.setState(fresh ? { data, run, fresh } : { data, run });
  saveRunStorage(data);
}

/** Saves a change to the run in progress. */
function commitRun(run: RunState, stats?: RunStats) {
  const { data } = get();
  commit({ ...data, current: run, ...(stats ? { stats } : {}) }, run);
}

/**
 * The difficulty a free run starts on: the one last picked, or the hardest open one below it. With
 * nothing picked that is Normal, so a new player starts on Easy and moves up with the first win.
 */
export function pickOf(data: RunStorage, all: RunStats): RunDifficulty {
  const down: RunDifficulty[] = ['hard', 'normal', 'easy'];
  return down.slice(down.indexOf(data.pick ?? 'normal')).find((level) => levelOpen(all, level)) ?? 'easy';
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

/**
 * What a run may offer: a daily run uses the starter cards and lenses only, so everyone shares them.
 * Unlocks count the player's runs on every device they have signed in on (allRunStats).
 */
export function poolsFor(run: RunState, stats: RunStats) {
  const unlocked = unlockedSet(allRunStats(stats));
  const starter = run.daily !== null;
  return { rewards: rewardPool(unlocked, starter), lenses: lensPool(unlocked, starter) };
}

export function hasDailyBest(stats: RunStats, date: string): boolean {
  return !!stats.dailyBest[date];
}

// ---- boards ----------------------------------------------------------------------------

/** Gets the boards still ahead in the run's ante ready, one after another, and keeps their targets. */
async function prepareAhead(run: RunState): Promise<void> {
  const id = runId(run);
  if (get().readyFor !== id) useRunStore.setState({ ready: {}, readyFor: id });
  const ante = anteOf(run.slot);
  const slots = KINDS.map((k) => slotOf(ante, k)).filter((s) => s >= run.slot);
  for (const slot of slots) {
    const have = get().ready[slot];
    if (have && have !== 'failed') continue;
    try {
      const p = await prepareBoard(run, slot);
      if (get().readyFor !== id) return;
      useRunStore.setState((s) => ({ ready: { ...s.ready, [slot]: p } }));
      const cur = get().run;
      if (cur && runId(cur) === id && !cur.outcome && cur.targets[slot] !== p.target) commitRun(withTarget(cur, slot, p.target));
    } catch {
      if (get().readyFor === id) useRunStore.setState((s) => ({ ready: { ...s.ready, [slot]: 'failed' } }));
    }
  }
}

/** The puzzle and fog a board is played with: Thief's givens taken out, fog laid over the same board. */
export function playedBoard(run: RunState, p: Prepared) {
  const puzzle = withStolen(p.puzzle, ruleOf(run, p.slot) === 'thief' ? p.stolen : []);
  const fog = run.live?.fog ? fogOf(puzzle) : undefined;
  return { puzzle, fog };
}

// ---- scoring the board in play ---------------------------------------------------------

let queue: Promise<unknown> = Promise.resolve();

function enqueue(job: () => unknown): void {
  queue = queue.then(job).catch((e) => console.error(e));
}

/** Runs fn a macrotask later, so a tap's render goes first. */
function later<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => setTimeout(() => fn().then(resolve, reject), 0));
}

/** The board as the player knew it before the digit: givens and correct entries, the cell itself empty. */
export function knownBefore(e: Pick<PlacementEvent, 'before' | 'cell' | 'puzzle'>): number[] {
  return e.before.map((d, i) => (i === e.cell ? 0 : e.puzzle.givens[i] || d === e.puzzle.solution[i] ? d : 0));
}

/** Waits for every placement and board end taken in so far to be applied. For tests. */
export function settled(): Promise<void> {
  return queue.then(() => undefined);
}

const FALLBACK: PlacementClass = { tier: 1, technique: 'nakedSingle', name: 'Single', focus: [] };
/** A classification that takes longer than this scores as the fallback, so the queue never stalls. */
const CLASSIFY_LIMIT_MS = 4000;

/** The run with a board in play: the one on screen, or the saved one while the Run home is showing. */
function inPlay(): RunState | null {
  const { run, data } = get();
  const r = run ?? data.current;
  return r && r.phase === 'board' && r.live ? r : null;
}

/** Saves a change to the run in play, on screen or not. */
function saveInPlay(next: RunState) {
  const { run, data } = get();
  if (run && runId(run) === runId(next)) commitRun(next);
  else commit({ ...data, current: next }, run);
}

function within<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
}

function hearPlacement(e: PlacementEvent) {
  const run = inPlay();
  const live = run?.live;
  if (!run || !live || e.key !== live.key) return;
  const placed: Placed = {
    key: e.key,
    cell: e.cell,
    digit: e.digit,
    correct: e.correct,
    source: e.source,
    assisted: e.assisted,
    units: e.units,
    clues: e.clues,
    puzzle: e.puzzle,
    noted: e.game.noted,
    missed: e.game.missed,
    helped: e.game.helped,
  };
  const classify = e.correct && e.source === 'player' && !e.assisted;
  // Microscope scores a placement as the hardest technique that proves it.
  const engine = run.perks.microscope ? hardestPlacementAsync : classifyPlacementAsync;
  const cls: Promise<PlacementClass | null> = classify
    ? within(
        later(() => engine(e.puzzle, knownBefore(e), e.cell, e.digit)),
        CLASSIFY_LIMIT_MS,
        FALLBACK,
      ).catch((err) => {
        // An engine error must not cost the player the placement: it scores as a single.
        console.error(err);
        return FALLBACK;
      })
    : Promise.resolve(null);
  enqueue(async () => apply(placed, await cls));
}

function apply(placed: Placed, cls: PlacementClass | null) {
  const run = inPlay();
  if (!run) return;
  const { run: next, out } = applyPlaced(run, placed, cls);
  if (next === run) return;
  saveInPlay(next);
  if (out.popup || out.tally) {
    const fx = get().fx;
    const popups = out.popup ? [...fx.popups.slice(-5), out.popup] : fx.popups;
    const up = out.popup && out.popup.points > 0 && moves() ? out.popup : null;
    useRunStore.setState({ fx: { popups, tally: out.tally ?? fx.tally, air: up ? { ...fx.air, [up.id]: up.points } : fx.air } });
    if (up) airTimers.set(up.id, setTimeout(() => landPoints(up.id), AIR_MS));
  }
  const game = getGame();
  if (!game || game.key !== placed.key) return;
  for (const c of out.reveal) actions.reveal(c);
  if (out.fail) actions.failGame();
}

function hearEnd(g: GameState) {
  const run = inPlay();
  if (!run || !run.live || g.key !== run.live.key) return;
  const limit = g.mods?.timeLimitMs;
  const end: BoardEnd = {
    mistakes: g.mistakes,
    hintsUsed: g.hintsUsed,
    elapsedMs: g.elapsedMs,
    timedOut: g.status === 'failed' && limit !== undefined && g.elapsedMs >= limit,
  };
  enqueue(() => finish(end));
}

function finish(end: BoardEnd, today: string = dailyDate()) {
  const { data } = get();
  const run = inPlay();
  if (!run || !run.live) return;
  // The run stays where it is on screen: in view, it moves on to its tally; at the Run home, it waits there.
  const shown = get().run;
  const onScreen = !!shown && runId(shown) === runId(run);
  const live = run.live;
  const next = endBoard(run, end);
  const result = next.results[next.results.length - 1];
  let stats = onBoardEnd(data.stats, result, live.cleanBoxes >= 9, isRanked(run));
  if (next.outcome) {
    const ended = { ...next, recorded: true };
    stats = onRunEnd(stats, ended, today);
    commit({ ...data, current: null, last: ended, stats }, onScreen ? ended : shown, onScreen ? unlockedByRun(ended, stats) : undefined);
    // A run won in front of the player gets its summary's burst, once.
    if (onScreen && ended.outcome === 'won') useRunStore.setState({ won: runId(ended) });
  } else {
    commit({ ...data, current: next, stats }, onScreen ? next : shown);
  }
}

onPlacement(hearPlacement);
onGameEnd(hearEnd);

// ---- actions ---------------------------------------------------------------------------

export const runActions = {
  /** Starts a run. An unfinished run is given up first, and counts as an attempt. */
  start(kind: 'daily' | 'free', now: number = Date.now(), today: string = dailyDate()): void {
    let { data } = get();
    if (data.current) {
      const ended = { ...abandon(data.current), recorded: true };
      data = { ...data, current: null, last: ended, stats: onRunEnd(data.stats, ended, today) };
    }
    const daily = kind === 'daily' ? today : null;
    // A daily run played first on another device makes this one a replay.
    const all = allRunStats(data.stats);
    const fresh = newRun(daily ? dailyRunSeed(daily) : randomSeed(), daily, now, daily !== null && hasDailyBest(all, daily), pickOf(data, all));
    const run: RunState = { ...fresh, unlockedAtStart: [...unlockedSet(all)] };
    const stats = onRunStart(data.stats);
    useRunStore.setState({ fx: noFx() });
    commit({ ...data, current: run, stats }, run, []);
    void prepareAhead(run);
  },

  /** Picks the difficulty of the next free run. Normal waits for a win on Easy, and Hard for one on Normal. */
  pickLevel(level: RunDifficulty): void {
    const { data, run } = get();
    if (!levelOpen(allRunStats(data.stats), level)) return;
    commit({ ...data, pick: level }, run);
  },

  resume(): void {
    const { data } = get();
    if (!data.current) return;
    useRunStore.setState({ run: data.current, fx: noFx() });
    void prepareAhead(data.current);
  },

  viewLast(): void {
    const { data } = get();
    if (data.last) useRunStore.setState({ run: { ...data.last, phase: 'done' }, fresh: [] });
  },

  /** Back to the Run home. An unfinished run stays saved. */
  home(): void {
    useRunStore.setState({ run: null, fx: noFx() });
  },

  /** The summary has played the win. */
  celebrated(): void {
    useRunStore.setState({ won: null });
  },

  /** Builds the boards ahead in the ante again, after a failure. */
  retry(): void {
    const run = get().run;
    if (!run) return;
    useRunStore.setState((s) => ({ ready: Object.fromEntries(Object.entries(s.ready).filter(([, v]) => v !== 'failed')) }));
    void prepareAhead(run);
  },

  /** Plays the board on the select screen, once it is ready. */
  play(): void {
    const { data, run, ready } = get();
    const p = run ? ready[run.slot] : undefined;
    if (!run || run.phase !== 'select' || !p || p === 'failed') return;
    const rule = ruleOf(run, run.slot);
    const fog = rule === 'fog' || !!run.next.fog;
    const puzzle = withStolen(p.puzzle, rule === 'thief' ? p.stolen : []);
    const mods = modsFor(run, run.slot, puzzle);
    const key = gameKey(run.seed, run.slot, run.createdAt);
    const next = playBoard(run, { key, target: p.target, stolen: rule === 'thief' ? p.stolen : [], fog, mods });
    useRunStore.setState({ fx: noFx() });
    commitRun(next, onBoardStart(data.stats, run.slot));
  },

  /** Skips a Small or Big board for its tag. */
  skip(): void {
    const { data, run } = get();
    if (!run || !canSkip(run)) return;
    commitRun(skip(run, poolsFor(run, data.stats).rewards));
  },

  /**
   * The board's game is in the store: cells already filled (Peek, a resumed board) score nothing,
   * and a board that ended while the app was closed is finished now.
   */
  sync(game: GameState): void {
    const run = get().run;
    if (!run || run.phase !== 'board' || !run.live || game.key !== run.live.key) return;
    const filled = game.values.map((d, i) => (d && d === game.puzzle.solution[i] ? i : -1)).filter((i) => i >= 0);
    const next = markFilled(run, game.key, filled);
    if (next !== run) commitRun(next);
    if (game.status === 'solved' || game.status === 'failed') hearEnd(game);
  },

  /** Leaves the tally for the reward pick, the shop, the next board or the summary. */
  next(): void {
    const { data, run } = get();
    if (!run || run.phase !== 'tally') return;
    const pools = poolsFor(run, data.stats);
    const moved = leaveTally(run, pools.rewards, pools.lenses);
    useRunStore.setState({ fx: noFx() });
    if (moved.phase === 'done') {
      useRunStore.setState({ run: moved });
      return;
    }
    commitRun(moved);
    if (moved.phase === 'select') void prepareAhead(moved);
  },

  take(id: RewardId): void {
    const { data, run } = get();
    if (!run || run.phase !== 'reward') return;
    const next = takeReward(run, id, poolsFor(run, data.stats).lenses);
    if (next === run) return;
    commitRun(next);
    if (next.phase === 'select') void prepareAhead(next);
  },

  /** Moves on from an empty offer. */
  pass(): void {
    const { data, run } = get();
    if (!run) return;
    const next = passReward(run, poolsFor(run, data.stats).lenses);
    if (next === run) return;
    commitRun(next);
    if (next.phase === 'select') void prepareAhead(next);
  },

  buyLens(k: number): void {
    const run = get().run;
    if (run) commitRun(buyLens(run, k));
  },

  buyItem(k: number): void {
    const run = get().run;
    if (run) commitRun(buyItem(run, k));
  },

  sell(slot: number): void {
    const run = get().run;
    if (run) commitRun(sellLens(run, slot));
  },

  move(from: number, to: number): void {
    const run = get().run;
    if (run && !run.outcome) commitRun(moveLens(run, from, to));
  },

  reroll(): void {
    const { data, run } = get();
    if (run) commitRun(reroll(run, poolsFor(run, data.stats).lenses));
  },

  leaveShop(): void {
    const run = get().run;
    if (!run || run.phase !== 'shop') return;
    const next = leaveShop(run);
    commitRun(next);
    void prepareAhead(next);
  },

  /**
   * Uses the item in slot k. A Spectra works anywhere; an ink works on the board in play: Reveal
   * fills a cell, Clear lifts the fog around the selected cell, Hint adds a charge, Void lifts the
   * boss rule, Pencil fills one box's notes (Mute or not) and Time adds to the clock.
   */
  useItem(k: number): boolean {
    const run = get().run;
    const id = run?.items[k];
    const def = id ? itemById(id) : undefined;
    if (!run || !id || !def) return false;
    if (def.kind === 'spectra') {
      const next = useSpectra(run, k);
      if (next === run) return false;
      commitRun(next);
      return true;
    }
    const live = run.live;
    const game = getGame();
    if (run.phase !== 'board' || !live || !game || game.key !== live.key || game.status !== 'playing') return false;
    if (!inkUsable(run, game, k)) return false;
    if (id === 'inkReveal') {
      if (actions.reveal() === null) return false;
    } else if (id === 'inkClear') {
      actions.clearFog(game.selected!);
    } else if (id === 'inkPencil') {
      if (!actions.pencilIn(pencilCells(game.puzzle, game.values, game.selected))) return false;
    } else if (id === 'inkTime') {
      actions.updateMods({ timeLimitMs: game.mods!.timeLimitMs! + INK.timeMs });
    } else if (id === 'inkHint') {
      const next = addHint(run);
      commitRun(dropItem(next, k));
      actions.updateMods({ hints: hintsAllowed(next.live!) });
      return true;
    } else if (id === 'inkVoid') {
      const rule = live.rule;
      const voided = dropItem(voidRule(run), k);
      commitRun(voided);
      if (rule === 'fog') actions.clearFog('all');
      if (rule === 'mute') actions.updateMods({ noNotes: undefined });
      if (rule === 'clock') actions.updateMods({ timeLimitMs: undefined });
      if (rule === 'thief') for (const c of live.stolen) actions.reveal(c);
      return true;
    }
    const after = get().run;
    if (after) commitRun(dropItem(after, after.items.indexOf(id)));
    return true;
  },

  /** Ends the run in view (or the saved one) early. */
  giveUp(today: string = dailyDate()): void {
    const { data, run } = get();
    const target = run && !run.outcome ? run : data.current;
    if (!target) return;
    const ended = { ...abandon(target), recorded: true };
    let stats = data.stats;
    // Placements on the board in play still go into the codex.
    if (target.live) stats = onBoardEnd(stats, { ...endedBoard(target), status: 'missed' }, false, isRanked(target));
    stats = onRunEnd(stats, ended, today);
    commit({ ...data, current: null, last: ended, stats }, ended, unlockedByRun(ended, stats));
  },
};

/** The board in play as a result, for the codex when a run is given up mid-board. */
function endedBoard(run: RunState) {
  const live = run.live!;
  return {
    slot: live.slot,
    status: 'missed' as const,
    score: live.score,
    target: live.target,
    coins: null,
    heartsLost: live.heartsLost,
    heartsAfter: live.hearts,
    mistakes: live.mistakes,
    hintsUsed: 0,
    elapsedMs: 0,
    tech: live.tech,
    best: live.best,
    clean: live.clean,
    rule: null,
  };
}

/** True when the ink in slot k can act on the board in play now. */
export function inkUsable(run: RunState, game: GameState, k: number): boolean {
  const id = run.items[k];
  const live = run.live;
  if (!live || !id) return false;
  switch (id) {
    case 'inkReveal':
      return game.values.some((d, i) => !game.puzzle.givens[i] && d !== game.puzzle.solution[i]);
    case 'inkClear':
      return !!game.fog && game.selected !== null && game.fog.cleared.some((c) => !c);
    case 'inkHint':
      return true;
    case 'inkVoid':
      return live.rule !== null && live.rule !== 'fish';
    case 'inkPencil':
      return pencilCells(game.puzzle, game.values, game.selected).length > 0;
    case 'inkTime':
      return game.mods?.timeLimitMs !== undefined;
    default:
      return false;
  }
}

/** Test helper: put the store back to a given state. */
export function resetRunStore(data: RunStorage = loadRunStorage(null)): void {
  queue = Promise.resolve();
  useRunStore.setState({ data, run: null, fresh: [], won: null, ready: {}, readyFor: '', fx: noFx(), legacy: 0 });
}
