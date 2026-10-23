// @vitest-environment jsdom
// Keyboard play on the real GameView: shortcuts, notes and the No notes curse.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LYRA } from '../engine/fixtures';
import { actions, getGame, resetStoreForTesting, startGame, useGame } from '../game/store';
import type { GameMods } from '../game/types';
import { GameView } from './GameView';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Live() {
  const game = useGame();
  return game ? <GameView game={game} title="Test" subtitle="Board" /> : null;
}

let host: HTMLDivElement;
let root: Root;
const empty = LYRA.givens.findIndex((d) => !d);

async function open(mods?: GameMods) {
  startGame({ key: `kb:${JSON.stringify(mods ?? {})}`, mode: 'free', puzzle: LYRA, mods, resume: false });
  await act(async () => root.render(<Live />));
  await act(async () => actions.select(empty));
}

async function press(key: string, code: string, shiftKey = false) {
  await act(async () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, code, shiftKey, bubbles: true }));
  });
}

beforeEach(() => {
  resetStoreForTesting();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe('keyboard play', () => {
  it('writes a note with Shift and a digit, and a digit without', async () => {
    await open();
    await press('#', 'Digit3', true);
    expect(getGame()!.notes[empty]).toBe(1 << 3);
    expect(getGame()!.notesMode).toBe(false);
    await press('4', 'Digit4');
    expect(getGame()!.values[empty]).toBe(4);
  });

  it('never turns the note key into a digit when notes are off', async () => {
    await open({ noNotes: true, hearts: 3 });
    await press('#', 'Digit3', true);
    await press('n', 'KeyN');
    const g = getGame()!;
    expect(g.values[empty]).toBe(0);
    expect(g.notes[empty]).toBe(0);
    expect(g.mistakes).toBe(0);
    expect(g.notesMode).toBe(false);
    expect(host.querySelector('.cb-rtext')?.textContent).toBe('Notes are off for this board.');
  });

  it('pauses and resumes with P', async () => {
    await open();
    await press('p', 'KeyP');
    expect(getGame()!.status).toBe('paused');
    expect(host.querySelector('.cb-pause')).not.toBeNull();
    await press('p', 'KeyP');
    expect(getGame()!.status).toBe('playing');
  });
});
