// The board in play: its hearts, its running score and the points of every placement. Pure: the
// store feeds it the game store's placement events, each with the technique the engine found,
// and carries out what comes back (a popup, Thief's returning givens, a board that ended).
import type { PlacementClass, TechniqueTier } from '../../engine/techniques';
import type { CellIndex, Puzzle } from '../../engine/types';
import { regionOf, type ClueHit, type UnitHit } from '../../game/logic';
import type { GameMods } from '../../game/types';
import { returning, type BossRule } from './bosses';
import { maxHeartsOf } from './lenses';
import type { LiveBoard, RunState } from './model';
import { scorePlacement, type PlacementFacts } from './scoring';
import { HEARTS, HINTS_PER_BOARD, REWARD } from './tuning';

/** A placement as the Run hears it from the game store. */
export interface Placed {
  key: string;
  cell: CellIndex;
  digit: number;
  correct: boolean;
  source: 'player' | 'hint' | 'reveal';
  assisted: boolean;
  units: UnitHit[];
  clues: ClueHit[];
  puzzle: Puzzle;
  /** Each cell's history after the placement, for clean units. */
  noted?: boolean[];
  missed?: boolean[];
  helped?: boolean[];
}

export interface Popup {
  id: number;
  cell: number;
  name: string;
  points: number;
  tier: TechniqueTier;
  /** What its clean units multiplied the mult by: 1 when none was clean. */
  clean: number;
  /** For a protection that fired rather than a placement: what it did, in place of the points. */
  note?: string;
}

/** One placement's marks times mult, for the tally in the header. */
export interface TallyFx {
  id: number;
  marks: number;
  mult: number;
  points: number;
  flow: number;
  fired: number[];
  tier: TechniqueTier;
}

export interface PlacedOut {
  popup: Popup | null;
  tally: TallyFx | null;
  /** Cells whose hidden givens come back now (Thief). */
  reveal: number[];
  /** The board is over: Glass broke, or the hearts ran out. */
  fail: boolean;
  /** Second Wind kept the run going. */
  saved: boolean;
}

const none = (): PlacedOut => ({ popup: null, tally: null, reveal: [], fail: false, saved: false });

export interface LiveSetup {
  key: string;
  slot: number;
  target: number;
  rule: BossRule | null;
  stolen: number[];
  fog: boolean;
  mods: GameMods;
}

/** The board as it starts: the run's hearts and shield, Compound's head start, the hint charges. */
export function newLive(run: RunState, s: LiveSetup): LiveBoard {
  const head = run.perks.compound ? Math.round(run.score * REWARD.compound) : 0;
  return {
    key: s.key,
    slot: s.slot,
    target: s.target,
    score: head,
    head,
    streak: 0,
    chain: 0,
    last: null,
    scored: [],
    units: [],
    clues: [],
    hearts: run.hearts,
    shield: run.shield,
    heartsLost: 0,
    mistakes: 0,
    tech: {},
    best: null,
    clean: 0,
    cleanBoxes: 0,
    boxes: 0,
    rule: s.rule,
    stolen: s.stolen.slice(),
    hints: { board: HINTS_PER_BOARD, pool: run.hintPool, quick: run.perks.sharpEye ? 1 : 0, extra: 0 },
    coinTimes: run.next.coinTimes ?? 1,
    fog: s.fog,
    mods: s.mods,
    seq: 0,
  };
}

/** Hint ladders the board allows in all. */
export function hintsAllowed(live: LiveBoard): number {
  return live.hints.board + live.hints.pool + live.hints.quick + live.hints.extra;
}

const inLine = (p: Puzzle, a: number, b: number) => {
  const n = p.size;
  return Math.floor(a / n) === Math.floor(b / n) || a % n === b % n || regionOf(p, a) === regionOf(p, b);
};

/** Takes n hearts. Second Wind keeps the last one, once a run. */
export function hurt(run: RunState, live: LiveBoard, n: number): { run: RunState; live: LiveBoard; saved: boolean } {
  let hearts = live.hearts - n;
  let saved = false;
  if (hearts <= 0 && run.perks.secondWind && !run.secondWindUsed) {
    hearts = 1;
    saved = true;
    const perks = { ...run.perks };
    delete perks.secondWind;
    run = { ...run, perks, secondWindUsed: true };
  }
  const lost = live.hearts - Math.max(0, hearts);
  return { run, live: { ...live, hearts: Math.max(0, hearts), heartsLost: live.heartsLost + Math.max(0, lost) }, saved };
}

/**
 * One placement on the board in play. cls is the technique the engine found for a player's
 * correct digit; for anything else it is not needed. Returns the run after it and what to show.
 */
export function applyPlaced(run: RunState, e: Placed, cls: PlacementClass | null): { run: RunState; out: PlacedOut } {
  const live = run.live;
  const out = none();
  if (run.phase !== 'board' || !live || live.key !== e.key || live.hearts <= 0 || live.broken) return { run, out };

  if (!e.correct) {
    let next: LiveBoard = { ...live, mistakes: live.mistakes + 1, streak: 0, chain: 0 };
    // A shield or Second Wind takes the mistake without a word, so the cell says what it did.
    const said = (name: string, note: string): Popup => ({ id: -next.mistakes, cell: e.cell, name, points: 0, tier: 0, clean: 1, note });
    if (next.shield > 0) {
      out.popup = said('Shield', 'No heart lost');
      return { run: { ...run, live: { ...next, shield: next.shield - 1 } }, out };
    }
    const glass = next.rule === 'glass';
    let cost = (glass ? HEARTS.glass : 1) * (run.perks.daredevil ? REWARD.daredevilHurt : 1);
    // Insurance pays for hearts with coins, as many as the coins cover.
    const insured = run.perks.insurance ? Math.min(cost, Math.floor(run.coins / REWARD.insurance)) : 0;
    if (insured) {
      cost -= insured;
      run = { ...run, coins: run.coins - insured * REWARD.insurance };
      out.popup = said('Insurance', `−${insured * REWARD.insurance} coins`);
    }
    const h = cost ? hurt(run, next, cost) : { run, live: next, saved: false };
    next = { ...h.live, broken: glass || undefined };
    out.saved = h.saved;
    if (h.saved) out.popup = said('Second Wind', 'Heart kept');
    else if (run.perks.daredevil && cost > 1 && !insured) out.popup = said('Daredevil', `−${cost} hearts`);
    out.fail = glass || next.hearts <= 0;
    return { run: { ...h.run, live: next }, out };
  }

  if (live.scored.includes(e.cell)) return { run, out };
  const source: PlacementFacts['source'] = e.source === 'reveal' ? 'reveal' : e.source === 'hint' || e.assisted ? 'hint' : 'player';
  const p = e.puzzle;
  const clean = (cells: number[]) => cells.every((i) => !e.noted?.[i] && !e.missed?.[i] && !e.helped?.[i]);
  const newUnits = e.units.filter((u) => !live.units.includes(`${u.kind}:${u.index}`));
  const newClues = e.clues.filter((c) => !live.clues.includes(`${c.index}:${c.cells[0]}`));
  const cleanUnits = newUnits.filter((u) => clean(u.cells));

  const tier: TechniqueTier = source === 'player' ? (cls?.tier ?? 0) : 0;
  const facts: PlacementFacts = {
    tier,
    technique: cls?.technique ?? 'unproven',
    digit: e.digit,
    source,
    units: newUnits.length,
    clean: cleanUnits.length,
    clues: newClues.map((c) => ({ kind: c.kind, total: c.cells.reduce((s, i) => s + p.solution[i], 0) })),
    ...(cls?.clue ? { clue: cls.clue } : {}),
    inLine: live.last !== null && inLine(p, live.last, e.cell),
  };
  const sc = scorePlacement(facts, { levels: run.levels, perks: run.perks, lenses: run.lenses, hearts: live.hearts, rule: live.rule }, { streak: live.streak, chain: live.chain });

  let next: LiveBoard = {
    ...live,
    score: live.score + sc.points,
    streak: sc.next.streak,
    chain: sc.next.chain,
    last: source === 'player' ? e.cell : live.last,
    scored: [...live.scored, e.cell],
    units: [...live.units, ...newUnits.map((u) => `${u.kind}:${u.index}`)],
    clues: [...live.clues, ...newClues.map((c) => `${c.index}:${c.cells[0]}`)],
    clean: live.clean + cleanUnits.length,
    seq: live.seq + 1,
  };
  if (source === 'player') {
    const id = facts.technique;
    const was = next.tech[id] ?? { n: 0, points: 0, top: 0 };
    next.tech = { ...next.tech, [id]: { n: was.n + 1, points: was.points + sc.points, top: Math.max(was.top, sc.points) } };
    // A full house is the last cell of a unit and proves nothing, but it finishes the most units, so
    // it would always be the best placement of a run: the best is the best deduction.
    if (id !== 'fullHouse' && (!next.best || sc.points > next.best.points)) next.best = { technique: id, points: sc.points };
    out.popup = { id: next.seq, cell: e.cell, name: cls?.name ?? 'Guess', points: sc.points, tier, clean: sc.clean };
    if (tier > 0) out.tally = { id: next.seq, marks: sc.marks, mult: sc.mult, points: sc.points, flow: sc.flow, fired: sc.fired, tier };
  }

  // Finished boxes: Kaleidoscope grows, and a clean one may heal.
  let lenses = run.lenses;
  for (const u of newUnits) {
    if (u.kind !== 'box') continue;
    next.boxes++;
    lenses = lenses.map((l) => (l.id === 'kaleidoscope' ? { ...l, n: (l.n ?? 0) + 1 } : l));
    if (clean(u.cells)) {
      next.cleanBoxes++;
      if (run.perks.lifeLink) next.hearts = Math.min(maxHeartsOf(run), next.hearts + 1);
    }
  }

  // Thief: a solved cell brings back the hidden givens next to it.
  if (next.rule === 'thief' && source === 'player' && next.stolen.length) {
    const back = returning(p.size, next.stolen, e.cell);
    if (back.length) {
      out.reveal = back;
      next.stolen = next.stolen.filter((s) => !back.includes(s));
    }
  }
  return { run: { ...run, lenses, live: next }, out };
}

/** Cells already filled when the board opens (Peek, or a board resumed mid-way) score nothing. */
export function markFilled(run: RunState, key: string, filled: number[]): RunState {
  const live = run.live;
  if (!live || live.key !== key) return run;
  const add = filled.filter((i) => !live.scored.includes(i));
  return add.length ? { ...run, live: { ...live, scored: [...live.scored, ...add] } } : run;
}

/** A Void ink lifts the boss rule. */
export function voidRule(run: RunState): RunState {
  return run.live ? { ...run, live: { ...run.live, rule: null, stolen: [] } } : run;
}

/** A Hint ink adds a charge. */
export function addHint(run: RunState): RunState {
  return run.live ? { ...run, live: { ...run.live, hints: { ...run.live.hints, extra: run.live.hints.extra + 1 } } } : run;
}
