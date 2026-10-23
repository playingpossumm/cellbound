// Game store: the current game, saved games per key, undo and redo, notes,
// mistakes, run modifiers, fog, finished boxes, the timer and the hint ladder.
// Persisted to localStorage under the versioned key cellbound:v1.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { candidates as engineCandidates, hint as engineHint } from '../engine';
import type { CellIndex, Digit, FogSpec, HintStep, Puzzle } from '../engine/types';
import type { GameMods, GameState, ModeId, Move } from './types';
import {
  cellDistance,
  clearAround,
  completedUnits,
  doneRegions,
  fullGrid,
  hashString,
  isSolvedGrid,
  localDate,
  peersOf,
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

function setGame(input: GameState) {
  const s = useStore.getState();
  const before = s.game?.key === input.key ? s.game : (s.games[input.key] ?? null);
  let g = input;
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
  if (o.mods?.reveal) {
    const empty = g.puzzle.givens.map((d, i) => (d ? -1 : i)).filter((i) => i >= 0);
    empty.sort((a, b) => hashString(`${g.puzzle.seed}:${a}`) - hashString(`${g.puzzle.seed}:${b}`));
    for (const i of empty.slice(0, o.mods.reveal)) {
      g.values[i] = g.puzzle.solution[i];
      g.hinted![i] = true;
      if (g.fog) g.fog.cleared = clearAround(g.fog.cleared, g.puzzle.size, i, g.fog.radius);
    }
    g.doneBoxes = doneRegions(g.puzzle, fullGrid(g.puzzle, g.values), []);
  }
  if (o.mods?.autoNotes || getSettings().autoNotes) g.notes = candidateNotes(g);
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

export function startGame(opts: StartOptions): void {
  commitClock();
  const s = useStore.getState();
  const saved = s.games[opts.key];
  ladder = null;
  useFx.setState(emptyFx());
  if (opts.resume !== false && saved && saved.puzzle.id === opts.puzzle.id) {
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

function autoNotesOn(g: GameState): boolean {
  return !!g.mods?.autoNotes || getSettings().autoNotes;
}

/** Places digit d in cell i: mistakes, fog, unit flashes, done boxes, status. */
function place(g: GameState, i: CellIndex, d: Digit, kind: 'value' | 'hint'): GameState {
  const n = g.puzzle.size;
  const group = groupSeq++;
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
  if (autoNotesOn(g)) {
    for (const j of peersOf(g.puzzle, i)) {
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
  if (correct) {
    // The last digit flashes the whole board, in the theme's unit flash, as a wave
    // that spreads from that cell; any other digit flashes the units it completes.
    const units = status === 'solved' ? [{ cells: Array.from({ length: n * n }, (_, j) => j) }] : completedUnits(g.puzzle, grid, i);
    if (units.length) {
      const flash: Record<number, number> = {};
      for (const u of units) for (const j of u.cells) flash[j] = cellDistance(n, i, j);
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
  };
  const hearts = heartsLeft(next);
  if (status === 'playing' && hearts !== null && hearts <= 0) next.status = 'failed';
  return next;
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
    clearHint();
    setGame(place(g, i, d, 'value'));
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
    if (!current) {
      const wrong = wrongCells(g);
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
      current = { key: g.key, sig, steps, next: 0 };
      counted++;
    }
    const step = current.steps[Math.min(current.next, current.steps.length - 1)];
    current.next++;
    ladder = current;
    useFx.setState({ hint: step });
    if (step.level === 3 && step.move && canPlaceHint(g, step.move.cell)) {
      const placed = place({ ...g, hintsUsed: counted }, step.move.cell, step.move.digit, 'hint');
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
        setGame({ ...g, hintsUsed: counted, notes, undo: [...g.undo, ...moves].slice(-MAX_UNDO), redo: [] });
        useFx.setState({ hint: step });
        return step;
      }
    }
    if (counted !== g.hintsUsed) setGame({ ...g, hintsUsed: counted });
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
