// Game store API. This file is a minimal working STUB; the app agent replaces
// the implementation (persistence, timer, fog, hint ladder, effects) and keeps
// every exported name and signature.
import { create } from 'zustand';
import type { CellIndex, Digit, FogSpec, HintStep, Puzzle } from '../engine/types';
import type { GameMods, GameState, ModeId } from './types';

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
}

const useStore = create<Store>(() => ({ game: null }));
const endListeners = new Set<(g: GameState) => void>();

function freshGame(o: StartOptions): GameState {
  const n = o.puzzle.size * o.puzzle.size;
  return {
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
  };
}

function setGame(g: GameState) {
  const before = useStore.getState().game;
  useStore.setState({ game: g });
  if (before?.status !== g.status && (g.status === 'solved' || g.status === 'failed')) {
    endListeners.forEach((l) => l(g));
  }
}

export function startGame(opts: StartOptions): void {
  setGame(freshGame(opts));
}

export function useGame(): GameState | null {
  return useStore((s) => s.game);
}

export function getGame(): GameState | null {
  return useStore.getState().game;
}

/** Fires once when a game becomes solved or failed. Returns an unsubscribe function. */
export function onGameEnd(listener: (g: GameState) => void): () => void {
  endListeners.add(listener);
  return () => endListeners.delete(listener);
}

function full(g: GameState): Digit[] {
  return g.puzzle.givens.map((d, i) => d || g.values[i]);
}

export const actions = {
  select(cell: CellIndex | null): void {
    const g = getGame();
    if (g) setGame({ ...g, selected: cell });
  },
  input(d: Digit): void {
    const g = getGame();
    if (!g || g.status !== 'playing' || g.selected === null || g.puzzle.givens[g.selected]) return;
    const i = g.selected;
    const values = g.values.slice();
    values[i] = values[i] === d ? 0 : d;
    let mistakes = g.mistakes;
    let status: GameState['status'] = g.status;
    if (values[i] && values[i] !== g.puzzle.solution[i]) mistakes++;
    const grid = full({ ...g, values });
    if (grid.every((v, k) => v === g.puzzle.solution[k])) status = 'solved';
    if (g.mods?.hearts !== undefined && mistakes >= g.mods.hearts) status = 'failed';
    setGame({ ...g, values, mistakes, status });
  },
  erase(): void {
    const g = getGame();
    if (!g || g.selected === null || g.puzzle.givens[g.selected]) return;
    const values = g.values.slice();
    const notes = g.notes.slice();
    values[g.selected] = 0;
    notes[g.selected] = 0;
    setGame({ ...g, values, notes });
  },
  toggleNotes(): void {
    const g = getGame();
    if (g) setGame({ ...g, notesMode: !g.notesMode });
  },
  undo(): void {},
  redo(): void {},
  /** Advances the hint ladder for the current deduction; returns the step to show. */
  hint(): HintStep | null {
    return null;
  },
  pause(): void {
    const g = getGame();
    if (g && g.status === 'playing') setGame({ ...g, status: 'paused' });
  },
  resume(): void {
    const g = getGame();
    if (g && g.status === 'paused') setGame({ ...g, status: 'playing' });
  },
  /** Development helper: fills the solution and marks the game solved. */
  solveForTesting(): void {
    const g = getGame();
    if (g) setGame({ ...g, values: g.puzzle.solution.map((d, i) => (g.puzzle.givens[i] ? 0 : d)), status: 'solved' });
  },
};
