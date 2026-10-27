// Game store: the current game, saved games per key, undo and redo, notes,
// mistakes, run modifiers, fog, finished boxes, the timer and the hint ladder.
// Persisted to localStorage under the versioned key cellbound:v1.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { candidates as engineCandidates, hint as engineHint, peers as enginePeers } from '../engine';
import type { CellIndex, Digit, FogSpec, HintStep, Puzzle } from '../engine/types';
import type { GameMods, GameState, ModeId, Move } from './types';
import {
  cellDistance,
  clearAround,
  completedClues,
  completedUnits,
  doneRegions,
  fullGrid,
  hashString,
  isSolvedGrid,
  localDate,
  type ClueHit,
  type UnitHit,
} from './logic';
import { getSettings } from './settings';
import { debouncedStorage } from './storage';

export interface StartOptions {
  key: string;
  mode: ModeId;
  puzzle: Puzzle;
  fog?: FogSpec;
  mods?: GameMods;
  /** Resume a saved game with the same key instead of starting fresh. Default true. */
  resume?: boolean;
}

interface Store {
  game: GameState | null;
  games: Record<string, GameState>;
  /** Last change per save key, for pruning old saves. */
  touched: Record<string, number>;
  /** Most recent save key per mode, so a screen can resume where the player left. */
  lastKey: Partial<Record<ModeId, string>>;
}

/** Visual effects that are not saved: placement and unit flashes, the hint on show. */
export interface Fx {
  /** Increments on every placement; parity picks place-a or place-b. */
  placeCount: number;
  placedCell: CellIndex | null;
  /** placedAt[i] changes every time cell i receives a digit. */
  placedAt: Record<number, number>;
  /** Increments on every unit completion; parity picks flash-a or flash-b. */
  flashCount: number;
  /** Cell to stagger index (distance from the placed cell). */
  flash: Record<number, number>;
  /** Hint step on show, cleared by the next move. */
  hint: HintStep | null;
}

interface Ladder {
  key: string;
  sig: string;
  steps: HintStep[];
  next: number;
}

const STORE_VERSION = 1;
const MAX_SAVES = 40;
const MAX_UNDO = 400;

const emptyFx = (): Fx => ({ placeCount: 0, placedCell: null, placedAt: {}, flashCount: 0, flash: {}, hint: null });

export const useFx = create<Fx>(() => emptyFx());

let ladder: Ladder | null = null;
let groupSeq = 1;

function isGameState(g: unknown): g is GameState {
  if (!g || typeof g !== 'object') return false;
  const s = g as GameState;
  const p = s.puzzle;
  if (!p || typeof p !== 'object' || ![4, 6, 9].includes(p.size)) return false;
  const n = p.size * p.size;
  return (
    typeof s.key === 'string' &&
    Array.isArray(p.givens) && p.givens.length === n &&
    Array.isArray(p.solution) && p.solution.length === n &&
    Array.isArray(s.values) && s.values.length === n &&
    Array.isArray(s.notes) && s.notes.length === n &&
    Array.isArray(s.undo) && Array.isArray(s.redo) &&
    ['playing', 'paused', 'solved', 'failed'].includes(s.status)
  );
}

type Saved = Pick<Store, 'games' | 'touched' | 'lastKey'>;

/** Drops anything that does not look like a saved game. */
export function sanitizeSaved(raw: unknown): Saved {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Saved>;
  const games: Record<string, GameState> = {};
  const touched: Record<string, number> = {};
  const src = r.games && typeof r.games === 'object' ? r.games : {};
  for (const [k, g] of Object.entries(src)) {
    if (!isGameState(g) || g.key !== k) continue;
    games[k] = { ...g, selected: null, doneBoxes: Array.isArray(g.doneBoxes) ? g.doneBoxes : [] };
    touched[k] = typeof r.touched?.[k] === 'number' ? r.touched[k] : 0;
  }
  const lastKey: Saved['lastKey'] = {};
  for (const [m, k] of Object.entries(r.lastKey ?? {})) if (typeof k === 'string' && games[k]) lastKey[m as ModeId] = k;
  return { games, touched, lastKey };
}

function prune(games: Record<string, GameState>, touched: Record<string, number>, keep: string) {
  const keys = Object.keys(games);
  if (keys.length <= MAX_SAVES) return { games, touched };
  const order = keys.filter((k) => k !== keep).sort((a, b) => (touched[a] ?? 0) - (touched[b] ?? 0));
  const g = { ...games };
  const t = { ...touched };
  for (const k of order.slice(0, keys.length - MAX_SAVES)) {
    delete g[k];
    delete t[k];
  }
  return { games: g, touched: t };
}

const useStore = create<Store>()(
  persist(
    (): Store => ({ game: null, games: {}, touched: {}, lastKey: {} }),
    {
      name: 'cellbound:v1',
      version: STORE_VERSION,
      storage: debouncedStorage<Saved>(),
      partialize: (s): Saved => ({ games: s.games, touched: s.touched, lastKey: s.lastKey }),
      migrate: (persisted, version) => (version === STORE_VERSION ? sanitizeSaved(persisted) : sanitizeSaved({})),
      merge: (persisted, current) => ({ ...current, ...sanitizeSaved(persisted) }),
    },
  ),
);

const endListeners = new Set<(g: GameState) => void>();

/**
 * One digit placed on the board. The Run scores these; other modes ignore them. Listeners run
 * while the store is still taking the move in, before it is saved and before any game-end
 * listener, so they see moves in order; they must not change the game themselves.
 */
export interface PlacementEvent {
  key: string;
  mode: ModeId;
  puzzle: Puzzle;
  cell: CellIndex;
  digit: Digit;
  /** Givens plus entries before the placement, wrong digits included. */
  before: Digit[];
  correct: boolean;
  /** player: typed or tapped; hint: placed by the hint ladder; reveal: filled in by a card or a rule. */
  source: 'player' | 'hint' | 'reveal';
  /** The player typed the digit that a hint on show was leading to. */
  assisted: boolean;
  /** Rows, columns and boxes the digit completed. Empty for a wrong digit. */
  units: UnitHit[];
  /** Clues the digit completed. Empty for a wrong digit. */
  clues: ClueHit[];
  /** The game after the placement. */
  game: GameState;
}

const placeListeners = new Set<(e: PlacementEvent) => void>();

/** Hears every digit placed on any board. Returns an unsubscribe function. */
export function onPlacement(listener: (e: PlacementEvent) => void): () => void {
  placeListeners.add(listener);
  return () => placeListeners.delete(listener);
}

function emitPlacement(e: PlacementEvent) {
  placeListeners.forEach((l) => {
    try {
      l(e);
    } catch (err) {
      console.error(err);
    }
  });
}

/** Run boards keep each cell's history (notes, mistakes, help) for the Run's clean units. */
const keepsHistory = (g: GameState) => g.mode === 'run';

/** noted with every cell that holds a note now; the same array when nothing changed. */
function withNoted(g: GameState): GameState {
  if (!g.noted) return g;
  let noted = g.noted;
  for (let i = 0; i < g.notes.length; i++) {
    if (g.notes[i] && !noted[i]) {
      if (noted === g.noted) noted = noted.slice();
      noted[i] = true;
    }
  }
  return noted === g.noted ? g : { ...g, noted };
}

/** A copy of a history array with cell i set, or the same array when it is set already. */
function mark(list: boolean[] | undefined, i: CellIndex): boolean[] | undefined {
  if (!list || list[i]) return list;
  const out = list.slice();
  out[i] = true;
  return out;
}

function setGame(input: GameState) {
  const s = useStore.getState();
  const before = s.game?.key === input.key ? s.game : (s.games[input.key] ?? null);
  let g = withNoted(input);
  if (carry > 0 && s.game?.key === g.key) g = { ...g, elapsedMs: g.elapsedMs + carry };
  carry = 0;
  // A finished board cannot be undone; drop its history to keep saves small.
  if ((g.status === 'solved' || g.status === 'failed') && (g.undo.length || g.redo.length)) g = { ...g, undo: [], redo: [] };
  const games = { ...s.games, [g.key]: g };
  const touched = { ...s.touched, [g.key]: Date.now() };
  const pruned = prune(games, touched, g.key);
  useStore.setState({ game: g, ...pruned, lastKey: { ...s.lastKey, [g.mode]: g.key } });
  const ended = g.status === 'solved' || g.status === 'failed';
  const wasEnded = !!before && (before.status === 'solved' || before.status === 'failed');
  if (ended && !wasEnded) {
    endListeners.forEach((l) => {
      try {
        l(g);
      } catch (e) {
        console.error(e);
      }
    });
  }
}

function freshGame(o: StartOptions): GameState {
  const n = o.puzzle.size * o.puzzle.size;
  const g: GameState = {
    key: o.key,
    mode: o.mode,
    puzzle: o.puzzle,
    fog: o.fog ? { ...o.fog, cleared: Array.from({ length: n }, (_, i) => o.fog!.start.includes(i)) } : undefined,
    values: new Array(n).fill(0),
    notes: new Array(n).fill(0),
    selected: null,
    notesMode: false,
    undo: [],
    redo: [],
    mistakes: 0,
    hintsUsed: 0,
    elapsedMs: 0,
    status: 'playing',
    doneBoxes: [],
    mods: o.mods,
    hinted: new Array(n).fill(false),
    startedOn: localDate(),
  };
  if (keepsHistory(g)) {
    g.noted = new Array(n).fill(false);
    g.missed = new Array(n).fill(false);
    g.helped = new Array(n).fill(false);
  }
  if (o.mods?.reveal) {
    const empty = g.puzzle.givens.map((d, i) => (d ? -1 : i)).filter((i) => i >= 0);
    empty.sort((a, b) => hashString(`${g.puzzle.seed}:${a}`) - hashString(`${g.puzzle.seed}:${b}`));
    for (const i of empty.slice(0, o.mods.reveal)) {
      g.values[i] = g.puzzle.solution[i];
      g.hinted![i] = true;
      if (g.helped) g.helped[i] = true;
      if (g.fog) g.fog.cleared = clearAround(g.fog.cleared, g.puzzle.size, i, g.fog.radius);
    }
    g.doneBoxes = doneRegions(g.puzzle, fullGrid(g.puzzle, g.values), []);
  }
  if (o.mods?.autoNotes || getSettings().autoNotes) g.notes = candidateNotes(g);
  else if (o.mods?.notesIn?.length) {
    const cands = candidateNotes(g);
    for (const i of o.mods.notesIn) if (i >= 0 && i < n && !g.values[i] && !g.puzzle.givens[i]) g.notes[i] = cands[i];
  }
  return g;
}

function candidateNotes(g: GameState): number[] {
  const full = fullGrid(g.puzzle, g.values);
  let cands: number[];
  try {
    cands = engineCandidates(g.puzzle, full);
  } catch {
    cands = [];
  }
  return full.map((d, i) => (d ? 0 : (cands[i] ?? 0)));
}

/**
 * True when a saved game was played on this very board. The id alone is not enough: a Daily's id is
 * its date, and a device that ran an older app on the morning of 24 October 2026 saved a 6x6 under
 * the id of a day whose Daily is now a 9x9.
 */
function sameBoard(a: Puzzle, b: Puzzle): boolean {
  return a.id === b.id && a.size === b.size && a.givens.length === b.givens.length && a.givens.every((d, i) => d === b.givens[i]);
}

export function startGame(opts: StartOptions): void {
  commitClock();
  const s = useStore.getState();
  const saved = s.games[opts.key];
  ladder = null;
  useFx.setState(emptyFx());
  if (opts.resume !== false && saved && sameBoard(saved.puzzle, opts.puzzle)) {
    const status = saved.status === 'paused' ? 'playing' : saved.status;
    setGame({ ...saved, selected: null, status });
    return;
  }
  setGame(freshGame(opts));
}

export function useGame(): GameState | null {
  return useStore((s) => s.game);
}

export function getGame(): GameState | null {
  return useStore.getState().game;
}

/** A saved game by key, without making it current. */
export function getSavedGame(key: string): GameState | null {
  return useStore.getState().games[key] ?? null;
}

/** The most recent save key for a mode. */
export function lastGameKey(mode: ModeId): string | null {
  return useStore.getState().lastKey[mode] ?? null;
}

/** Leaves the current game (it stays saved). */
export function closeGame(): void {
  commitClock();
  useStore.setState({ game: null });
}

/** Fires once when a game becomes solved or failed. Returns an unsubscribe function. */
export function onGameEnd(listener: (g: GameState) => void): () => void {
  endListeners.add(listener);
  return () => endListeners.delete(listener);
}

/** Hearts left under the hearts and shield mods, or null when the board has no hearts. */
export function heartsLeft(g: GameState): number | null {
  if (g.mods?.hearts === undefined) return null;
  return Math.max(0, g.mods.hearts - Math.max(0, g.mistakes - (g.mods.shield ?? 0)));
}

/** Shield charges left, or null when the board has no shield. */
export function shieldLeft(g: GameState): number | null {
  if (g.mods?.shield === undefined) return null;
  return Math.max(0, g.mods.shield - g.mistakes);
}

/** True when the game checks digits against the solution (fog, runs and the strict setting). */
export function checksSolution(g: GameState): boolean {
  return g.mode === 'fog' || g.mode === 'run' || !!g.fog || g.mods?.hearts !== undefined || getSettings().mistakes === 'strict';
}

function canEdit(g: GameState, i: CellIndex): boolean {
  if (g.puzzle.givens[i]) return false;
  if (g.fog && !g.fog.cleared[i]) return false;
  return true;
}

function clearHint() {
  ladder = null;
  if (useFx.getState().hint) useFx.setState({ hint: null });
}

/**
 * Places digit d in cell i: mistakes, fog, unit flashes, done boxes, status, and the placement
 * event. source tells a typed digit from one a hint or a card put there. The digit leaves the
 * notes of every cell that must hold a different one, in the same undo step.
 */
function place(g: GameState, i: CellIndex, d: Digit, kind: 'value' | 'hint', source: PlacementEvent['source'] = kind === 'hint' ? 'hint' : 'player', assisted = false): GameState {
  const n = g.puzzle.size;
  const group = groupSeq++;
  const before = fullGrid(g.puzzle, g.values);
  const values = g.values.slice();
  const notes = g.notes.slice();
  const hinted = (g.hinted ?? new Array(n * n).fill(false)).slice();
  const moves: Move[] = [{ cell: i, prevValue: values[i], prevNotes: notes[i], value: d, notes: 0, kind, group }];
  values[i] = d;
  notes[i] = 0;
  hinted[i] = kind === 'hint';
  const correct = d === g.puzzle.solution[i];
  let mistakes = g.mistakes;
  if (!correct && kind === 'value') mistakes++;
  const missed = correct ? g.missed : mark(g.missed, i);
  const helped = source !== 'player' || assisted ? mark(g.helped, i) : g.helped;
  // A digit the board already shows to be wrong leaves the notes alone, for when it comes out
  // again: one that repeats a digit it must differ from, or a wrong one where the game checks
  // the solution. Anywhere else the board cannot tell, so the notes go.
  const seen = enginePeers(g.puzzle)[i];
  if (!seen.some((j) => before[j] === d) && (correct || !checksSolution(g))) {
    for (const j of seen) {
      if (values[j] || g.puzzle.givens[j] || !(notes[j] & (1 << d))) continue;
      moves.push({ cell: j, prevValue: values[j], prevNotes: notes[j], value: values[j], notes: notes[j] & ~(1 << d), kind: 'note', group });
      notes[j] &= ~(1 << d);
    }
  }
  let fog = g.fog;
  if (fog && correct) fog = { ...fog, cleared: clearAround(fog.cleared, n, i, fog.radius) };
  const grid = fullGrid(g.puzzle, values);
  const fx = useFx.getState();
  const fxPatch: Partial<Fx> = {
    placeCount: fx.placeCount + 1,
    placedCell: i,
    placedAt: { ...fx.placedAt, [i]: fx.placeCount + 1 },
    hint: kind === 'hint' ? fx.hint : null,
  };
  let doneBoxes = g.doneBoxes;
  let status: GameState['status'] = g.status;
  if (isSolvedGrid(g.puzzle, grid)) status = 'solved';
  const units = correct ? completedUnits(g.puzzle, grid, i) : [];
  if (correct) {
    // The last digit flashes the whole board, in the theme's unit flash, as a wave
    // that spreads from that cell; any other digit flashes the units it completes.
    const flashed = status === 'solved' ? [{ cells: Array.from({ length: n * n }, (_, j) => j) }] : units;
    if (flashed.length) {
      const flash: Record<number, number> = {};
      for (const u of flashed) for (const j of u.cells) flash[j] = cellDistance(n, i, j);
      fxPatch.flash = flash;
      fxPatch.flashCount = fx.flashCount + 1;
    }
    doneBoxes = doneRegions(g.puzzle, grid, g.doneBoxes);
  }
  useFx.setState(fxPatch);
  const next: GameState = {
    ...g,
    values,
    notes,
    hinted,
    fog,
    mistakes,
    doneBoxes,
    status,
    undo: [...g.undo, ...moves].slice(-MAX_UNDO),
    redo: [],
    ...(g.missed ? { missed } : {}),
    ...(g.helped ? { helped } : {}),
  };
  const hearts = heartsLeft(next);
  if (status === 'playing' && hearts !== null && hearts <= 0) next.status = 'failed';
  if (placeListeners.size) {
    emitPlacement({
      key: g.key,
      mode: g.mode,
      puzzle: g.puzzle,
      cell: i,
      digit: d,
      before,
      correct,
      source,
      assisted,
      units,
      clues: correct ? completedClues(g.puzzle, grid, i) : [],
      game: next,
    });
  }
  return next;
}

/** The cell and digit the hint ladder in progress leads to, if it leads to a placement. */
function ladderMove(g: GameState): { cell: CellIndex; digit: Digit } | null {
  if (!ladder || ladder.key !== g.key) return null;
  return ladder.steps.find((s) => s.move)?.move ?? null;
}

function applyMoves(g: GameState, moves: Move[], dir: 'undo' | 'redo'): GameState {
  const values = g.values.slice();
  const notes = g.notes.slice();
  const hinted = (g.hinted ?? new Array(values.length).fill(false)).slice();
  const ordered = dir === 'undo' ? moves.slice().reverse() : moves;
  for (const m of ordered) {
    values[m.cell] = dir === 'undo' ? m.prevValue : m.value;
    notes[m.cell] = dir === 'undo' ? m.prevNotes : m.notes;
    if (m.kind === 'hint') hinted[m.cell] = dir === 'redo';
    else if (m.kind === 'value' || m.kind === 'erase') hinted[m.cell] = false;
  }
  const grid = fullGrid(g.puzzle, values);
  let fog = g.fog;
  if (fog && dir === 'redo') {
    for (const m of moves) {
      if (m.value && m.value === g.puzzle.solution[m.cell]) fog = { ...fog, cleared: clearAround(fog.cleared, g.puzzle.size, m.cell, fog.radius) };
    }
  }
  const status: GameState['status'] = isSolvedGrid(g.puzzle, grid) ? 'solved' : g.status;
  return { ...g, values, notes, hinted, fog, status, doneBoxes: doneRegions(g.puzzle, grid, g.doneBoxes), selected: moves[0].cell };
}

function takeGroup(stack: Move[]): [Move[], Move[]] {
  if (!stack.length) return [stack, []];
  const last = stack[stack.length - 1];
  let k = stack.length - 1;
  if (last.group !== undefined) while (k > 0 && stack[k - 1].group === last.group) k--;
  return [stack.slice(0, k), stack.slice(k)];
}

function signature(g: GameState): string {
  return `${g.key}|${g.values.join('')}|${g.notes.join(',')}`;
}

function wrongCells(g: GameState): CellIndex[] {
  return g.values.map((v, i) => (v && v !== g.puzzle.solution[i] ? i : -1)).filter((i) => i >= 0);
}

/** Hint steps when the engine finds nothing: point at one cell and give its digit. */
function fallbackSteps(g: GameState): HintStep[] | null {
  const grid = fullGrid(g.puzzle, g.values);
  const empty = grid.map((d, i) => (d ? -1 : i)).filter((i) => i >= 0 && (!g.fog || g.fog.cleared[i]));
  if (!empty.length) return null;
  let target = empty[0];
  if (g.selected !== null && empty.includes(g.selected)) target = g.selected;
  else {
    // Otherwise the empty cell with the fewest candidates.
    let cands: number[] = [];
    try {
      cands = engineCandidates(g.puzzle, grid);
    } catch {
      cands = [];
    }
    let best = 99;
    for (const i of empty) {
      let c = 0;
      for (let m = cands[i] ?? 0; m; m &= m - 1) c++;
      if (c && c < best) {
        best = c;
        target = i;
      }
    }
  }
  const d = g.puzzle.solution[target];
  return [
    { level: 1, focus: [target], rule: 'cell', text: 'Look at the glowing cell.' },
    { level: 2, focus: [target], rule: 'cell', text: 'Only one digit fits here once every rule is applied.' },
    { level: 3, focus: [target], rule: 'cell', text: `This cell is ${d}.`, move: { cell: target, digit: d } },
  ];
}

function mistakeSteps(g: GameState, wrong: CellIndex[]): HintStep[] {
  const first = wrong[0];
  return [
    { level: 1, focus: [], rule: 'cell', text: 'A digit on the board does not fit. Check your work before going on.' },
    { level: 2, focus: wrong, rule: 'cell', text: 'The glowing cells hold digits that do not fit.' },
    {
      level: 3,
      focus: [first],
      rule: 'cell',
      text: `This cell is ${g.puzzle.solution[first]}.`,
      move: { cell: first, digit: g.puzzle.solution[first] },
    },
  ];
}

export const actions = {
  select(cell: CellIndex | null): void {
    const g = getGame();
    if (!g) return;
    const n = g.puzzle.size * g.puzzle.size;
    if (cell !== null && (cell < 0 || cell >= n)) return;
    if (g.selected !== cell) setGame({ ...g, selected: cell });
  },
  input(d: Digit): void {
    const g = getGame();
    if (!g || g.status !== 'playing' || g.selected === null) return;
    const i = g.selected;
    if (!canEdit(g, i) || d < 1 || d > g.puzzle.size) return;
    if (g.notesMode && !g.mods?.noNotes) {
      if (g.values[i]) return;
      const notes = g.notes.slice();
      notes[i] ^= 1 << d;
      const move: Move = { cell: i, prevValue: 0, prevNotes: g.notes[i], value: 0, notes: notes[i], kind: 'note', group: groupSeq++ };
      clearHint();
      setGame({ ...g, notes, undo: [...g.undo, move].slice(-MAX_UNDO), redo: [] });
      return;
    }
    if (g.values[i] === d) {
      actions.erase();
      return;
    }
    // A digit the hint on show was leading to counts as helped, whoever types it.
    const led = ladderMove(g);
    const assisted = !!led && led.cell === i && led.digit === d;
    clearHint();
    setGame(place(g, i, d, 'value', 'player', assisted));
  },
  erase(): void {
    const g = getGame();
    if (!g || g.status !== 'playing' || g.selected === null) return;
    const i = g.selected;
    if (!canEdit(g, i) || (!g.values[i] && !g.notes[i])) return;
    const values = g.values.slice();
    const notes = g.notes.slice();
    const hinted = (g.hinted ?? new Array(values.length).fill(false)).slice();
    const move: Move = { cell: i, prevValue: values[i], prevNotes: notes[i], value: 0, notes: 0, kind: 'erase', group: groupSeq++ };
    values[i] = 0;
    notes[i] = 0;
    hinted[i] = false;
    clearHint();
    const grid = fullGrid(g.puzzle, values);
    setGame({ ...g, values, notes, hinted, doneBoxes: doneRegions(g.puzzle, grid, g.doneBoxes), undo: [...g.undo, move].slice(-MAX_UNDO), redo: [] });
  },
  toggleNotes(): void {
    const g = getGame();
    if (!g) return;
    if (g.mods?.noNotes) {
      if (g.notesMode) setGame({ ...g, notesMode: false });
      return;
    }
    setGame({ ...g, notesMode: !g.notesMode });
  },
  undo(): void {
    const g = getGame();
    if (!g || g.status !== 'playing' || !g.undo.length) return;
    const [rest, moves] = takeGroup(g.undo);
    clearHint();
    setGame({ ...applyMoves(g, moves, 'undo'), undo: rest, redo: [...g.redo, ...moves] });
  },
  redo(): void {
    const g = getGame();
    if (!g || g.status !== 'playing' || !g.redo.length) return;
    const [rest, moves] = takeGroup(g.redo);
    clearHint();
    setGame({ ...applyMoves(g, moves, 'redo'), redo: rest, undo: [...g.undo, ...moves] });
  },
  /** Advances the hint ladder for the current deduction; returns the step to show. */
  hint(): HintStep | null {
    const g = getGame();
    if (!g || g.status !== 'playing') return null;
    const sig = signature(g);
    let current = ladder && ladder.key === g.key && ladder.sig === sig ? ladder : null;
    let counted = g.hintsUsed;
    let helped = g.helped;
    if (!current) {
      const wrong = wrongCells(g);
      // A board with a set number of hints (a Run) marks a wrong digit the moment it goes in, and it
      // has cost its heart already, so pointing at it spends no hint and starts no ladder.
      if (g.mods?.hints !== undefined && wrong.length) {
        const step: HintStep = { level: 2, focus: wrong, rule: 'cell', text: 'The glowing cells hold digits that do not fit.' };
        ladder = null;
        useFx.setState({ hint: step });
        return step;
      }
      // A board with a set number of hints gives no new one once they are used.
      if (g.mods?.hints !== undefined && g.hintsUsed >= g.mods.hints) return null;
      let steps: HintStep[] | null = null;
      if (wrong.length) steps = mistakeSteps(g, wrong);
      else {
        try {
          steps = engineHint(g.puzzle, fullGrid(g.puzzle, g.values), g.notes);
        } catch {
          steps = null;
        }
        if (!steps || !steps.length) steps = fallbackSteps(g);
      }
      if (!steps || !steps.length) return null;
      steps = steps.slice().sort((a, b) => a.level - b.level);
      // A quick hint skips where to look and which rule, and goes straight to the move.
      const quick = g.hintsUsed < (g.mods?.quickHints ?? 0);
      current = { key: g.key, sig, steps, next: quick ? steps.length - 1 : 0 };
      counted++;
      const move = steps.find((s) => s.move)?.move;
      if (move) helped = mark(helped, move.cell);
    }
    const step = current.steps[Math.min(current.next, current.steps.length - 1)];
    current.next++;
    ladder = current;
    useFx.setState({ hint: step });
    if (step.level === 3 && step.move && canPlaceHint(g, step.move.cell)) {
      const placed = place({ ...g, hintsUsed: counted, ...(helped ? { helped } : {}) }, step.move.cell, step.move.digit, 'hint');
      ladder = null;
      setGame({ ...placed, selected: step.move.cell });
      useFx.setState({ hint: step });
      return step;
    }
    if (step.level === 3 && !step.move && step.eliminate?.length) {
      // A deduction that only removes candidates: clear those notes.
      const notes = g.notes.slice();
      const group = groupSeq++;
      const moves: Move[] = [];
      for (const e of step.eliminate) {
        if (g.values[e.cell] || g.puzzle.givens[e.cell]) continue;
        let m = notes[e.cell];
        for (const d of e.digits) m &= ~(1 << d);
        if (m === notes[e.cell]) continue;
        moves.push({ cell: e.cell, prevValue: 0, prevNotes: notes[e.cell], value: 0, notes: m, kind: 'note', group });
        notes[e.cell] = m;
      }
      if (moves.length) {
        ladder = null;
        setGame({ ...g, hintsUsed: counted, notes, ...(helped ? { helped } : {}), undo: [...g.undo, ...moves].slice(-MAX_UNDO), redo: [] });
        useFx.setState({ hint: step });
        return step;
      }
    }
    if (counted !== g.hintsUsed || helped !== g.helped) setGame({ ...g, hintsUsed: counted, ...(helped ? { helped } : {}) });
    return step;
  },
  /** Hides the hint on show without placing anything. */
  dismissHint(): void {
    clearHint();
  },
  pause(): void {
    const g = getGame();
    if (g && g.status === 'playing') {
      commitClock();
      setGame({ ...getGame()!, status: 'paused' });
    }
  },
  resume(): void {
    const g = getGame();
    if (g && g.status === 'paused') {
      lastTick = now();
      setGame({ ...g, status: 'playing' });
    }
  },
  /** Fills candidate notes in every empty cell. */
  fillNotes(): void {
    const g = getGame();
    if (!g || g.status !== 'playing' || g.mods?.noNotes) return;
    const notes = candidateNotes(g);
    const group = groupSeq++;
    const moves: Move[] = [];
    notes.forEach((m, i) => {
      if (m !== g.notes[i] && !g.values[i] && !g.puzzle.givens[i]) {
        moves.push({ cell: i, prevValue: 0, prevNotes: g.notes[i], value: 0, notes: m, kind: 'note', group });
      }
    });
    if (!moves.length) return;
    setGame({ ...g, notes: g.notes.map((old, i) => (g.values[i] || g.puzzle.givens[i] ? old : notes[i])), undo: [...g.undo, ...moves].slice(-MAX_UNDO), redo: [] });
  },
  /**
   * Fills in the right digit, as a card or a rule does (a Run's Peek, Thief or Reveal ink). With no
   * cell it takes the selected empty cell, or else the first empty one in the board's own order.
   * It uses no hint. Returns the cell filled, or null.
   */
  reveal(cell?: CellIndex): CellIndex | null {
    const g = getGame();
    if (!g || g.status !== 'playing') return null;
    const open = (i: CellIndex) => !g.puzzle.givens[i] && g.values[i] !== g.puzzle.solution[i] && (!g.fog || g.fog.cleared[i]);
    let i = cell ?? null;
    if (i === null) {
      if (g.selected !== null && open(g.selected)) i = g.selected;
      else {
        const order = g.puzzle.givens.map((_, k) => k).filter(open);
        order.sort((a, b) => hashString(`${g.puzzle.seed}:${a}`) - hashString(`${g.puzzle.seed}:${b}`));
        i = order[0] ?? null;
      }
    }
    if (i === null || i < 0 || i >= g.values.length || g.puzzle.givens[i] || g.values[i] === g.puzzle.solution[i]) return null;
    clearHint();
    setGame(place(g, i, g.puzzle.solution[i], 'hint', 'reveal'));
    return i;
  },
  /** Clears the fog around a cell, as a correct digit there would, or all of it. */
  clearFog(cell: CellIndex | 'all'): void {
    const g = getGame();
    if (!g || !g.fog || (g.status !== 'playing' && g.status !== 'paused')) return;
    const n = g.puzzle.size;
    const cleared = cell === 'all' ? g.fog.cleared.map(() => true) : clearAround(g.fog.cleared, n, cell, g.fog.radius);
    setGame({ ...g, fog: { ...g.fog, cleared } });
  },
  /** Changes the current board's modifiers, for example when a Run card lifts a rule. */
  updateMods(patch: Partial<GameMods>): void {
    const g = getGame();
    if (!g) return;
    const mods: GameMods = { ...(g.mods ?? {}), ...patch };
    for (const k of Object.keys(mods) as (keyof GameMods)[]) if (mods[k] === undefined) delete mods[k];
    setGame({ ...g, mods, notesMode: mods.noNotes ? false : g.notesMode });
  },
  /** Ends the current board as failed, for a rule outside the store (a Run out of hearts). */
  failGame(): void {
    const g = getGame();
    if (!g || (g.status !== 'playing' && g.status !== 'paused')) return;
    commitClock();
    clearHint();
    setGame({ ...getGame()!, status: 'failed' });
  },
};

/** Test helper: fills the solution and marks the game solved. Not part of `actions`, so builds leave it out. */
export function solveForTesting(): void {
  const g = getGame();
  if (!g) return;
  const n = g.puzzle.size * g.puzzle.size;
  setGame({
    ...g,
    values: g.puzzle.solution.map((d, i) => (g.puzzle.givens[i] ? 0 : d)),
    notes: new Array(n).fill(0),
    fog: g.fog ? { ...g.fog, cleared: new Array(n).fill(true) } : undefined,
    doneBoxes: doneRegions(g.puzzle, g.puzzle.solution, g.doneBoxes),
    status: 'solved',
  });
}

function canPlaceHint(g: GameState, i: CellIndex): boolean {
  return !g.puzzle.givens[i] && g.values[i] !== g.puzzle.solution[i];
}

// Timer. Active time accumulates while a game is playing, a GameView is
// mounted and the tab is visible. It commits to the store once per second.
let lastTick = 0;
let carry = 0;
let clockUsers = 0;
let clockTimer: ReturnType<typeof setInterval> | null = null;

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const hidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';

function commitClock() {
  const g = useStore.getState().game;
  if (!g || carry <= 0) {
    carry = 0;
    return;
  }
  const add = carry;
  carry = 0;
  const s = useStore.getState();
  const next = { ...g, elapsedMs: g.elapsedMs + add };
  useStore.setState({ game: next, games: { ...s.games, [g.key]: next } });
}

/** Advances the clock by dt milliseconds of active time. Exported for tests. */
export function tickClock(dt: number): void {
  const g = getGame();
  if (!g || g.status !== 'playing' || dt <= 0 || dt > 5000) return;
  const before = g.elapsedMs + carry;
  carry += dt;
  const after = g.elapsedMs + carry;
  const limit = g.mods?.timeLimitMs;
  if (limit !== undefined && after >= limit) {
    carry = 0;
    setGame({ ...g, elapsedMs: limit, status: 'failed' });
    return;
  }
  if (Math.floor(after / 1000) !== Math.floor(before / 1000)) commitClock();
}

function onVisibility() {
  if (hidden()) {
    tickClock(now() - lastTick);
    commitClock();
  }
  lastTick = now();
}

/** Starts counting active time; returns a stop function. GameView calls it while mounted. */
export function startClock(): () => void {
  clockUsers++;
  if (clockUsers === 1 && typeof window !== 'undefined') {
    lastTick = now();
    clockTimer = setInterval(() => {
      const t = now();
      const dt = t - lastTick;
      lastTick = t;
      if (!hidden()) tickClock(dt);
    }, 250);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', commitClock);
  }
  return () => {
    clockUsers = Math.max(0, clockUsers - 1);
    if (clockUsers === 0 && clockTimer) {
      clearInterval(clockTimer);
      clockTimer = null;
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', commitClock);
      commitClock();
    }
  };
}

/** Test helper: forget the current game and every save. */
export function resetStoreForTesting(): void {
  ladder = null;
  carry = 0;
  useFx.setState(emptyFx());
  useStore.setState({ game: null, games: {}, touched: {}, lastKey: {} });
}
