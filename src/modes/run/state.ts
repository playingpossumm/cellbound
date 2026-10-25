// The Run state machine. Every transition is a pure function from one RunState to the
// next, so it can be saved, resumed and tested without a browser.
import { APP_NAME } from '../../app/brand';
import { formatDateLong } from '../../game/logic';
import { BOARD_COUNT, BOARD_SPECS, baseFor, setupBoard, type BoardSetup } from './boards';
import { cardById, isCursed, multiplierOf, START_HEARTS, type Card } from './cards';
import { offerFor } from './offers';
import { endBonus, formatScore, scoreBoard, type BoardScore } from './score';

/**
 * board:  a board is being played (index is that board).
 * result: the board is over and its breakdown is on screen.
 * choose: picking one of three cards for board index + 1.
 * done:   the run is over and the summary is on screen.
 */
export type RunPhase = 'board' | 'result' | 'choose' | 'done';
export type RunOutcome = 'finished' | 'failed' | 'abandoned';

export interface BoardResult {
  index: number;
  status: 'solved' | 'failed';
  /** The level of the board's slot. */
  difficulty: number;
  /** The board's size. Results from before the 9x9 final have none, and were 6x6. */
  size?: number;
  elapsedMs: number;
  /** The par time the time bonus was measured against. */
  parMs?: number;
  mistakes: number;
  hintsUsed: number;
  heartsLost: number;
  heartsAfter: number;
  cardIds: string[];
  cursed: boolean;
  /** All zero when the board failed. */
  score: BoardScore;
  reason?: 'hearts' | 'time';
}

export interface RunState {
  v: 1;
  seed: string;
  /** The date of a daily run, or null for a free run. */
  daily: string | null;
  createdAt: number;
  /** True for a daily run played again after the first attempt. It never changes the daily best. */
  replay?: boolean;
  /** Milestones already reached when the run began, to tell what the run itself unlocked. */
  unlockedAtStart?: string[];
  phase: RunPhase;
  /** The board in play or just finished (0 to 4). */
  index: number;
  /** Hearts and shields after the last finished board. */
  hearts: number;
  shield: number;
  /** Ids of run cards in force on every later board. */
  perks: string[];
  /** Ids on offer while phase is choose. */
  offer: string[];
  /** How board `index` was set up. */
  setup: BoardSetup;
  results: BoardResult[];
  /** Board totals so far, plus the end bonus once the run is finished. */
  score: number;
  endBonus: number;
  outcome: RunOutcome | null;
  /** Set by the store once the stats include this run. */
  recorded: boolean;
}

export interface BoardEnd {
  status: 'solved' | 'failed';
  mistakes: number;
  hintsUsed: number;
  elapsedMs: number;
}

function inForce(pick: string | null, perks: string[]): Card[] {
  const ids = [...(pick ? [pick] : []), ...perks].filter((id, i, all) => all.indexOf(id) === i);
  return ids.map(cardById).filter((c): c is Card => !!c);
}

function setupFor(seed: string, index: number, hearts: number, shield: number, pick: string | null, perks: string[]) {
  const cards = inForce(pick, perks);
  return setupBoard(seed, index, hearts, shield, cards, multiplierOf(cards));
}

export function newRun(seed: string, daily: string | null, now: number, replay = false): RunState {
  return {
    v: 1,
    seed,
    daily,
    createdAt: now,
    replay,
    phase: 'board',
    index: 0,
    hearts: START_HEARTS,
    shield: 0,
    perks: [],
    offer: [],
    setup: setupFor(seed, 0, START_HEARTS, 0, null, []),
    results: [],
    score: 0,
    endBonus: 0,
    outcome: null,
    recorded: false,
  };
}

/** Hearts on screen while a board is in play. */
export function liveHearts(setup: BoardSetup, mistakes: number): number {
  const lost = Math.max(0, mistakes - (setup.mods.shield ?? 0));
  return Math.max(0, (setup.mods.hearts ?? START_HEARTS) - lost);
}

export function liveShield(setup: BoardSetup, mistakes: number): number {
  return Math.max(0, (setup.mods.shield ?? 0) - mistakes);
}

/** Records how the current board ended. Only valid while phase is board. */
export function finishBoard(run: RunState, end: BoardEnd): RunState {
  if (run.phase !== 'board') return run;
  const setup = run.setup;
  const lost = Math.max(0, end.mistakes - (setup.mods.shield ?? 0));
  let heartsAfter = Math.max(0, (setup.mods.hearts ?? START_HEARTS) - lost);
  const shieldAfter = liveShield(setup, end.mistakes);
  const status: 'solved' | 'failed' = end.status === 'solved' && heartsAfter > 0 ? 'solved' : 'failed';
  // A failed board with hearts left is a time out, but only when the board had a clock and it ran down.
  const limit = setup.mods.timeLimitMs;
  const timedOut = status === 'failed' && heartsAfter > 0 && limit !== undefined && end.elapsedMs >= limit - 1500;
  if (status === 'failed' && !timedOut) heartsAfter = 0;
  const zero: BoardScore = { base: 0, timeBonus: 0, hintPenalty: 0, subtotal: 0, mult: 1, total: 0 };
  const score =
    status === 'solved'
      ? scoreBoard({
          base: setup.base ?? baseFor(run.index),
          parMs: setup.parMs,
          elapsedMs: end.elapsedMs,
          hintsUsed: end.hintsUsed,
          mult: setup.mult,
        })
      : zero;
  const result: BoardResult = {
    index: run.index,
    status,
    difficulty: BOARD_SPECS[run.index].difficulty,
    size: setup.options.size,
    elapsedMs: end.elapsedMs,
    parMs: setup.parMs,
    mistakes: end.mistakes,
    hintsUsed: end.hintsUsed,
    heartsLost: lost,
    heartsAfter,
    cardIds: setup.cardIds,
    cursed: setup.cardIds.some((id) => {
      const c = cardById(id);
      return !!c && isCursed(c);
    }),
    score,
    ...(status === 'failed' ? { reason: timedOut ? ('time' as const) : ('hearts' as const) } : {}),
  };
  const results = [...run.results, result];
  const base = { ...run, results, hearts: heartsAfter, shield: shieldAfter, score: run.score + score.total };
  if (status === 'failed') {
    return { ...base, phase: 'result', outcome: 'failed' };
  }
  if (run.index >= BOARD_COUNT - 1) {
    const bonus = endBonus(heartsAfter);
    return { ...base, phase: 'result', outcome: 'finished', endBonus: bonus, score: base.score + bonus };
  }
  return { ...base, phase: 'result' };
}

/** Leaves the result screen: on to the card choice, or on to the summary when the run is over. */
export function advance(run: RunState, pool: Card[]): RunState {
  if (run.phase === 'result') {
    if (run.outcome) return { ...run, phase: 'done' };
    return { ...run, phase: 'choose', offer: offerFor(run.seed, run.index + 1, pool).map((c) => c.id) };
  }
  return run;
}

/** Takes one of the offered cards and sets up the next board with it. */
export function choose(run: RunState, cardId: string): RunState {
  if (run.phase !== 'choose' || !run.offer.includes(cardId)) return run;
  const card = cardById(cardId);
  if (!card) return run;
  const next = run.index + 1;
  const perksBefore = run.perks;
  const perks = card.lasts === 'run' && !perksBefore.includes(cardId) ? [...perksBefore, cardId] : perksBefore;
  return {
    ...run,
    phase: 'board',
    index: next,
    perks,
    offer: [],
    setup: setupFor(run.seed, next, run.hearts, run.shield, cardId, perksBefore),
  };
}

/** Gives up the run. The score so far stays. */
export function abandon(run: RunState): RunState {
  if (run.outcome) return run;
  return { ...run, phase: 'done', outcome: 'abandoned' };
}

// ---- reading a run ---------------------------------------------------------------------

export function cardsOf(ids: string[]): Card[] {
  return ids.map(cardById).filter((c): c is Card => !!c);
}

/** Boards started, 1 to 5. */
export function boardsReached(run: RunState): number {
  return run.index + 1;
}

export function boardsCleared(run: RunState): number {
  return run.results.filter((r) => r.status === 'solved').length;
}

export function shareText(run: RunState): string {
  const lines: string[] = [];
  lines.push(run.daily ? `${APP_NAME} Run, ${formatDateLong(run.daily)}` : `${APP_NAME} Run, free run`);
  const last = run.results[run.results.length - 1];
  if (run.outcome === 'finished') {
    lines.push(`Finished all ${BOARD_COUNT} boards with ${run.hearts} ${run.hearts === 1 ? 'heart' : 'hearts'} left`);
  } else if (run.outcome === 'failed' && last) {
    lines.push(
      `${last.reason === 'time' ? 'Out of time' : 'Out of hearts'} on board ${last.index + 1} of ${BOARD_COUNT}`,
    );
  } else {
    lines.push(`Stopped on board ${run.index + 1} of ${BOARD_COUNT}`);
  }
  lines.push(`Score ${formatScore(run.score)}`);
  for (const r of run.results) {
    const names = r.cardIds
      .map((id) => cardById(id))
      .filter((c): c is Card => !!c && isCursed(c))
      .map((c) => c.name);
    const tail = names.length ? ` (${names.join(', ')})` : '';
    lines.push(r.status === 'solved' ? `${r.index + 1}: ${formatScore(r.score.total)}${tail}` : `${r.index + 1}: failed${tail}`);
  }
  return lines.join('\n');
}
