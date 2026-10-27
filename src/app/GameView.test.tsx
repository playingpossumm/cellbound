// @vitest-environment jsdom
// Keyboard play on the real GameView: shortcuts, notes and the No notes curse.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LYRA } from '../engine/fixtures';
import { actions, getGame, resetStoreForTesting, startGame, useGame } from '../game/store';
import type { GameMods } from '../game/types';
import { GameView } from './GameView';
import { KeyList } from './keys';

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
  delete document.documentElement.dataset.keys;
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
    expect(host.querySelector('.cb-msg-text')?.textContent).toBe('Notes are off for this board.');
  });

  it('pauses and resumes with P', async () => {
    await open();
    await press('p', 'KeyP');
    expect(getGame()!.status).toBe('paused');
    expect(host.querySelector('.cb-pause')).not.toBeNull();
    await press('p', 'KeyP');
    expect(getGame()!.status).toBe('playing');
  });

  it('shows the tool keys once a key has done something, not before', async () => {
    await open();
    const keys = () => document.documentElement.dataset.keys;
    expect([...host.querySelectorAll('.cb-tool')].map((t) => t.getAttribute('data-key'))).toEqual(['Z', 'E', 'N', 'H']);
    await press('q', 'KeyQ');
    expect(keys()).toBeUndefined();
    await press('4', 'Digit4');
    expect(keys()).toBe('on');
  });

  it('does with each tool key what the tool does', async () => {
    await open();
    const tool = (name: string) => host.querySelector<HTMLElement>(`.cb-tool[aria-label="${name}"]`)!;
    const pressKey = (name: string) => {
      const k = tool(name).dataset.key!;
      return press(k.toLowerCase(), `Key${k}`);
    };
    await press('4', 'Digit4');
    await pressKey('Undo');
    expect(getGame()!.values[empty]).toBe(0);
    await press('4', 'Digit4');
    await pressKey('Erase');
    expect(getGame()!.values[empty]).toBe(0);
    await pressKey('Notes');
    expect(getGame()!.notesMode).toBe(true);
    await pressKey('Notes');
    await pressKey('Hint');
    expect(host.querySelector('.cb-msg.is-hint')).not.toBeNull();
  });

  it('answers every key that Settings lists', async () => {
    const list = document.createElement('div');
    const listRoot = createRoot(list);
    await act(async () => listRoot.render(<KeyList />));
    const listed = [...list.querySelectorAll('kbd')].map((k) => k.textContent!);
    await act(async () => listRoot.unmount());
    expect(listed.length).toBeGreaterThan(8);
    // Shift with a digit has its own test above; WASD is four keys and Esc is Escape.
    const named: Record<string, string[]> = { Shift: [], WASD: ['w', 'a', 's', 'd'], Esc: ['Escape'] };
    for (const k of listed.flatMap((t) => named[t] ?? [t.length === 1 ? t.toLowerCase() : t])) {
      await open();
      delete document.documentElement.dataset.keys;
      await press(k, '');
      expect(document.documentElement.dataset.keys, k).toBe('on');
    }
  });
});

const click = async (el: Element | null | undefined) => {
  if (!el) throw new Error('nothing to click');
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

describe('the play screen says only what the moment needs', () => {
  it('shows no rule text and no band line until a chip is on', async () => {
    await open();
    expect(host.querySelector('.cb-msg')).toBeNull();
    expect(host.textContent).not.toMatch(/Each row, column and box|Tap a rule/);
    // The board's description ("Board" here) goes into a shared result, never into the band.
    expect(host.querySelector('.cb-band-wrap')?.textContent).not.toContain('Board');
  });

  it('shows a rule with a way to its lesson while its chip is on, and hides it when it is off', async () => {
    await open();
    const chip = [...host.querySelectorAll('.cb-chip')].find((b) => b.textContent === 'Thermo')!;
    await click(chip);
    expect(chip.getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector('.cb-msg-text')?.textContent).toBe('Digits rise from the round bulb to the far end of the line.');
    expect(host.querySelector('.cb-msg-btn')?.getAttribute('aria-label')).toBe('Open the Thermo lesson');
    // The same words reach screen readers through a live region.
    expect([...host.querySelectorAll('[aria-live]')].some((n) => n.textContent === 'Digits rise from the round bulb to the far end of the line.')).toBe(true);
    await click(chip);
    expect(host.querySelector('.cb-msg')).toBeNull();
  });

  it('marks a rule with no lesson done with a dot, described for screen readers', async () => {
    await open();
    const chip = host.querySelector('.cb-chip')!;
    expect(chip.classList.contains('is-new')).toBe(true);
    const desc = document.getElementById(chip.getAttribute('aria-describedby')!);
    expect(desc?.textContent).toBe('New rule');
  });

  it('gives every tool a name, and Notes a pressed state', async () => {
    await open();
    const tools = [...host.querySelectorAll('.cb-tool')];
    expect(tools.map((t) => t.getAttribute('aria-label'))).toEqual(['Undo', 'Erase', 'Notes', 'Hint']);
    expect(tools.every((t) => !t.textContent)).toBe(true);
    const notes = tools[2];
    expect(notes.getAttribute('aria-pressed')).toBe('false');
    await click(notes);
    expect(notes.getAttribute('aria-pressed')).toBe('true');
    expect(notes.classList.contains('on')).toBe(true);
  });

  it('shows a finished digit as a spent key instead of a count', async () => {
    await open();
    const keys = () => [...host.querySelectorAll('.cb-key')];
    expect(host.textContent).not.toMatch(/\d left/);
    // Fill every 1 of the solution.
    await act(async () => {
      LYRA.solution.forEach((d, i) => {
        if (d === 1 && !LYRA.givens[i]) {
          actions.select(i);
          actions.input(1);
        }
      });
    });
    const one = keys()[0];
    expect(one.classList.contains('spent')).toBe(true);
    expect(one.getAttribute('aria-label')).toBe('Enter 1, all placed');
    expect(one.querySelector('.cb-key-done')).not.toBeNull();
    expect(keys()[1].classList.contains('spent')).toBe(false);
  });
});
