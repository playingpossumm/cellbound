// The Run state machine. Every transition is a pure function from one RunState to the next, so a
// run can be saved, resumed and tested without a browser; store.ts applies them. The board in
// play is live.ts.
import { APP_NAME } from '../../app/brand';
import { TECHNIQUES } from '../../engine/techniques';
import type { CellIndex, Puzzle } from '../../engine/types';
import { formatDateLong, regionCells } from '../../game/logic';
import type { GameMods } from '../../game/types';
import { anteOf, isBoss, kindOf, SLOT_COUNT, SLOT_SPECS, ANTES, KINDS, slotOf } from './boards';
import { bossesFor, clockMs, type BossRule } from './bosses';
import { itemById } from './items';
import { effectiveLens, maxHeartsOf, type LensDef } from './lenses';
import { hurt, newLive, type LiveSetup } from './live';
import type { BoardResult, BoardStatus, CashOut, Category, LiveBoard, RewardId, RunState } from './model';
import { makeOffer } from './offers';
import { rewardById, type RewardDef } from './rewards';
import { openShop } from './shop';
import { COINS, HEARTS, HINTS_PER_BOARD, SPECTRA_MAX } from './tuning';

export function newRun(seed: string, daily: string | null, now: number, replay = false): RunState {
  return {
    v: 2,
    seed,
    daily,
    createdAt: now,
    replay,
    phase: 'select',
    slot: 0,
    hearts: HEARTS.start,
    maxHearts: HEARTS.start,
    shield: 0,
    coins: COINS.start,
    hintPool: 0,
    lenses: [],
    items: [],
    perks: {},
    levels: new Array(9).fill(0),
    bosses: bossesFor(seed),
    targets: new Array(SLOT_COUNT).fill(null),
    next: {},
    pending: null,
    secondWindUsed: false,
    results: [],
    score: 0,
    bonus: 0,
    live: null,
    offer: null,
    shop: null,
    lastCats: [],
    hintsLast: 0,
    outcome: null,
    recorded: false,
  };
}

// ---- reading a run ---------------------------------------------------------------------

/** The boss rule of a slot's board, or null for a Small or Big board. */
export function ruleOf(run: Pick<RunState, 'bosses'>, slot: number): BossRule | null {
  return isBoss(slot) ? (run.bosses[anteOf(slot) - 1] ?? null) : null;
}

/** True when the boss rule of the run's current ante shows: on the boss itself, or from the start with Scout. */
export function bossShown(run: Pick<RunState, 'perks' | 'slot'>): boolean {
  return !!run.perks.scout || isBoss(run.slot);
}

export function resultOf(run: RunState, slot: number): BoardResult | undefined {
  return run.results.find((r) => r.slot === slot);
}

export function canSkip(run: RunState): boolean {
  return run.phase === 'select' && !isBoss(run.slot);
}

/** The cells of the box with the most empty cells (the first on a tie), for Candidate Glass. */
export function emptiestBox(p: Puzzle): CellIndex[] {
  let best: CellIndex[] = [];
  for (let b = 0; b < p.size; b++) {
    const empty = regionCells(p, b).filter((i) => !p.givens[i]);
    if (empty.length > best.length) best = empty;
  }
  return best;
}

/** The game modifiers a board starts with, from its rule, the cards for it and the run's perks. */
export function modsFor(run: RunState, slot: number, puzzle: Puzzle): GameMods {
  const rule = ruleOf(run, slot);
  const mods: GameMods = {};
  if (rule === 'mute') mods.noNotes = true;
  if (rule === 'clock' || run.next.clock) mods.timeLimitMs = clockMs(SLOT_SPECS[slot].minutes);
  if (run.perks.peek) mods.reveal = run.perks.peek;
  mods.hints = HINTS_PER_BOARD + run.hintPool + (run.perks.sharpEye ? 1 : 0);
  if (run.perks.sharpEye) mods.quickHints = 1;
  if (run.perks.candidateGlass && rule !== 'mute') mods.notesIn = emptiestBox(puzzle);
  return mods;
}

// ---- transitions -----------------------------------------------------------------------

/** On to the next board's select screen. */
export function advance(run: RunState): RunState {
  return { ...run, phase: 'select', slot: Math.min(SLOT_COUNT - 1, run.slot + 1), offer: null, shop: null };
}

/** Records a board's target once its board is built. */
export function withTarget(run: RunState, slot: number, target: number): RunState {
  if (run.targets[slot] === target) return run;
  const targets = run.targets.slice();
  targets[slot] = target;
  return { ...run, targets };
}

/** Skips a Small or Big board for a tag: a smaller pick, commons only, and no coins. */
export function skip(run: RunState, rewards: readonly RewardDef[]): RunState {
  if (!canSkip(run)) return run;
  const result: BoardResult = {
    slot: run.slot,
    status: 'skipped',
    score: 0,
    target: run.targets[run.slot] ?? 0,
    coins: null,
    heartsLost: 0,
    heartsAfter: run.hearts,
    mistakes: 0,
    hintsUsed: 0,
    elapsedMs: 0,
    tech: {},
    best: null,
    clean: 0,
    rule: null,
  };
  const next: RunState = { ...run, results: [...run.results, result], hintsLast: 0 };
  return { ...next, phase: 'reward', offer: makeOffer(next, 'tag', rewards) };
}

/** Starts the board on the select screen. The cards meant for the next board are used up here. */
export function playBoard(run: RunState, setup: Omit<LiveSetup, 'rule' | 'slot'>): RunState {
  if (run.phase !== 'select') return run;
  const slot = run.slot;
  const live = newLive(run, { ...setup, slot, rule: ruleOf(run, slot) });
  return { ...withTarget(run, slot, setup.target), phase: 'board', live, next: {} };
}

export interface BoardEnd {
  mistakes: number;
  hintsUsed: number;
  elapsedMs: number;
  /** The clock ran out. */
  timedOut: boolean;
}

/**
 * Coins a board pays when it is cashed out: its own coins, the overflow, interest and what the
 * lenses pay. Only a cleared board is cashed out, as a skipped one is not: a missed board pays
 * nothing at all.
 */
export function cashOut(run: RunState, live: LiveBoard, cleared: boolean, hintsLeft: number): CashOut {
  if (!cleared) return { board: 0, overflow: 0, interest: 0, lenses: 0, total: 0 };
  const times = live.coinTimes;
  const board = COINS.board[kindOf(live.slot)] * times;
  const over = live.target > 0 ? Math.floor((live.score - live.target) / (live.target * COINS.overflowStep) + 1e-9) : 0;
  const overflow = Math.max(0, Math.min(COINS.overflowMax, over)) * times;
  const interest = Math.min(COINS.interestMax, Math.floor(run.coins / COINS.interestPer));
  let lenses = 0;
  run.lenses.forEach((_, k) => {
    const e = effectiveLens(run.lenses, k);
    if (e?.def.coins) lenses += e.def.coins({ hintsLeft, cleanBoxes: live.cleanBoxes }, e.slot);
  });
  return { board, overflow, interest, lenses, total: board + overflow + interest + lenses };
}

/** Hint charges the board used from each source, and what is left. */
export function hintsAfter(live: LiveBoard, used: number): { pool: number; left: number } {
  const quick = Math.min(used, live.hints.quick);
  const paid = Math.max(0, used - quick);
  const own = live.hints.board + live.hints.extra;
  const fromOwn = Math.min(paid, own);
  const fromPool = Math.min(live.hints.pool, paid - fromOwn);
  const pool = live.hints.pool - fromPool;
  return { pool, left: own - fromOwn + pool };
}

/** The board ended: solved, out of time, broken or out of hearts. Its tally comes next. */
export function endBoard(run: RunState, end: BoardEnd): RunState {
  const live = run.live;
  if (run.phase !== 'board' || !live) return run;
  const slot = live.slot;
  const hints = hintsAfter(live, end.hintsUsed);
  let status: BoardStatus;
  if (live.broken) status = live.hearts > 0 ? 'broken' : 'out';
  else if (live.hearts <= 0) status = 'out';
  else status = live.score >= live.target ? 'cleared' : 'missed';

  let next: RunState = { ...run, hintPool: hints.pool };
  let board = live;
  if (status === 'missed') {
    // A board under its target costs a heart.
    const h = hurt(next, live, 1);
    next = h.run;
    board = h.live;
  }
  const played = status === 'cleared' || status === 'missed';
  const coins = played ? cashOut(next, board, status === 'cleared', hints.left) : null;

  // Double or Nothing rides on the next board played after the one it was picked on.
  let bonus = next.bonus;
  let pending = next.pending;
  if (pending && pending.slot !== slot) {
    bonus += end.mistakes === 0 && played ? pending.score : -pending.score;
    pending = null;
  }

  const hearts = Math.max(0, board.hearts);
  const result: BoardResult = {
    slot,
    status,
    ...(end.timedOut ? { timedOut: true } : {}),
    score: live.score,
    target: live.target,
    coins,
    heartsLost: board.heartsLost,
    heartsAfter: hearts,
    mistakes: end.mistakes,
    hintsUsed: end.hintsUsed,
    elapsedMs: end.elapsedMs,
    tech: live.tech,
    best: live.best,
    clean: live.clean,
    rule: ruleOf(run, slot),
  };
  const outcome = hearts <= 0 ? 'lost' : slot === SLOT_COUNT - 1 ? (status === 'cleared' ? 'won' : 'lost') : null;
  return {
    ...next,
    phase: 'tally',
    live: null,
    hearts: Math.min(hearts, maxHeartsOf(next)),
    shield: board.shield,
    coins: next.coins + (coins?.total ?? 0),
    results: [...next.results, result],
    score: next.score + live.score + (bonus - next.bonus),
    bonus,
    pending,
    hintsLast: end.hintsUsed,
    outcome,
  };
}

/** Leaves the tally: to the summary, a reward pick, the shop after a boss, or the next board. */
export function leaveTally(run: RunState, rewards: readonly RewardDef[], lenses: readonly LensDef[]): RunState {
  if (run.phase !== 'tally') return run;
  if (run.outcome) return { ...run, phase: 'done' };
  const last = run.results[run.results.length - 1];
  if (last?.status === 'cleared') return { ...run, phase: 'reward', offer: makeOffer(run, isBoss(run.slot) ? 'boss' : 'reward', rewards) };
  return isBoss(run.slot) ? openShop(run, lenses) : advance(run);
}

/** After a pick: the shop when it followed a boss, the next board otherwise. */
function afterPick(run: RunState, kind: string, lenses: readonly LensDef[]): RunState {
  return kind === 'boss' ? openShop(run, lenses) : advance(run);
}

/** Takes one of the offered cards. */
export function takeReward(run: RunState, id: RewardId, lenses: readonly LensDef[]): RunState {
  const offer = run.offer;
  if (run.phase !== 'reward' || !offer || !offer.cards.includes(id)) return run;
  const def = rewardById(id);
  if (!def) return run;
  const cats = offer.cards.map((c) => rewardById(c)?.category).filter((c): c is Category => !!c);
  const next = def.apply({ ...run, offer: null, lastCats: cats });
  return afterPick(next, offer.kind, lenses);
}

/** Moves on from an offer with nothing in it. */
export function passReward(run: RunState, lenses: readonly LensDef[]): RunState {
  const offer = run.offer;
  if (run.phase !== 'reward' || !offer || offer.cards.length) return run;
  return afterPick({ ...run, offer: null }, offer.kind, lenses);
}

export function leaveShop(run: RunState): RunState {
  if (run.phase !== 'shop') return run;
  return advance({ ...run, shop: null });
}

/** Gives up the run. The score so far stays; the board in play counts for nothing. */
export function abandon(run: RunState): RunState {
  if (run.outcome) return run;
  return { ...run, phase: 'done', live: null, offer: null, shop: null, outcome: 'abandoned' };
}

/** Uses a Spectra from its slot: its tier goes up a level. Inks are used on a board, through the store. */
export function useSpectra(run: RunState, k: number): RunState {
  const def = itemById(run.items[k] ?? '');
  if (!def || def.kind !== 'spectra' || def.tier === undefined || run.phase === 'done') return run;
  const levels = run.levels.slice();
  if (levels[def.tier] >= SPECTRA_MAX) return run;
  levels[def.tier] += 1;
  return { ...run, levels, items: run.items.filter((_, i) => i !== k) };
}

/** Takes an item out of its slot once it is used. */
export function dropItem(run: RunState, k: number): RunState {
  return run.items[k] ? { ...run, items: run.items.filter((_, i) => i !== k) } : run;
}

// ---- words -----------------------------------------------------------------------------

export const KIND_NAMES: Record<string, string> = { small: 'Small', big: 'Big', boss: 'Boss' };

/** "Ante 2, Big". */
export function slotName(slot: number): string {
  return `Ante ${anteOf(slot)}, ${KIND_NAMES[kindOf(slot)]}`;
}

/** 1250 becomes "1,250" without depending on the device locale. */
export function formatScore(n: number): string {
  const s = String(Math.round(Math.abs(n)));
  return (n < 0 ? '-' : '') + s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** 2.5 becomes "2.5" and 3 becomes "3": a mult without trailing zeros. */
export function formatMult(x: number): string {
  return String(Math.round(x * 100) / 100);
}

export function shareText(run: RunState): string {
  const lines: string[] = [];
  lines.push(run.daily ? `${APP_NAME} Run, ${formatDateLong(run.daily)}` : `${APP_NAME} Run, free run`);
  const last = run.results[run.results.length - 1];
  if (run.outcome === 'won') lines.push(`Won with ${run.hearts} ${run.hearts === 1 ? 'heart' : 'hearts'} left`);
  else if (run.outcome === 'lost' && last) lines.push(`${last.status === 'out' || run.hearts <= 0 ? 'Out of hearts' : 'Run over'} on ${slotName(last.slot)}`);
  else lines.push(`Stopped on ${slotName(run.slot)}`);
  lines.push(`Score ${formatScore(run.score)}`);
  for (let a = 1; a <= ANTES; a++) {
    const cells = KINDS.map((k) => {
      const r = resultOf(run, slotOf(a, k));
      if (!r) return null;
      return r.status === 'skipped' ? 'skipped' : r.status === 'cleared' ? formatScore(r.score) : `${formatScore(r.score)} missed`;
    }).filter((x): x is string => !!x);
    if (cells.length) lines.push(`Ante ${a}: ${cells.join(', ')}`);
  }
  const best = run.results.reduce<BoardResult['best']>((b, r) => (r.best && (!b || r.best.points > b.points) ? r.best : b), null);
  if (best) lines.push(`Best placement: ${TECHNIQUES[best.technique].name}, ${formatScore(best.points)}`);
  return lines.join('\n');
}
