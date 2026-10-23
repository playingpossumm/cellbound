// @vitest-environment jsdom
// Smoke tests for the two screens with a stand-in play surface: the flows a player takes,
// through real clicks, on top of the real stores.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { GameViewProps } from '../app/GameView';
import { actions, getGame } from '../game/store';
import { LearnApp } from './learn/LearnApp';
import { LESSONS } from './learn/lessons';
import { isLessonDone, openLesson, peekLessonRequest, resetLearnStore } from './learn/store';
import { RunApp } from './run/RunApp';
import { resetRunStore, runActions, useRunStore } from './run/store';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** A play surface that shows what the modes hand it: the title, the extra panel and the end panel. */
function FakeGameView(props: GameViewProps) {
  const over = props.game.status === 'solved' || props.game.status === 'failed';
  return (
    <div data-testid="game">
      <h1>
        {props.title} / {props.subtitle}
      </h1>
      {props.extra}
      {props.onExit && (
        <button type="button" onClick={props.onExit}>
          Leave this board
        </button>
      )}
      {over && props.endPanel}
    </div>
  );
}

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  try {
    localStorage.clear();
  } catch {
    /* no storage in this environment */
  }
  resetRunStore();
  resetLearnStore();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

const mount = async (el: React.ReactElement) => act(async () => root.render(el));
const text = () => host.textContent ?? '';
const buttons = () => [...host.querySelectorAll('button')];
const button = (label: string | RegExp) =>
  buttons().find((b) => (typeof label === 'string' ? (b.textContent ?? '').trim() === label : label.test(b.textContent ?? '')));
const click = async (el: Element | undefined) => {
  if (!el) throw new Error('nothing to click');
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};
async function until(cond: () => boolean, what: string, ms = 3000) {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('timed out waiting for ' + what + '\n' + text().slice(0, 300));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
  }
}

describe('Learn screen', () => {
  const learn = () => mount(<LearnApp onExit={() => undefined} GameViewComponent={FakeGameView} />);

  it('lists the ten lessons with their rule lines', async () => {
    await learn();
    expect(host.querySelectorAll('.cb-learn-row')).toHaveLength(10);
    expect(text()).toContain('0 of 10 lessons done');
    expect(text()).toContain('Digits rise from the round bulb to the far end of the line.');
    expect(text()).toContain('Next up');
  });

  it('walks a lesson step by step and on to the practice puzzle, then marks it done', async () => {
    await learn();
    await click(button(/Thermo/));
    expect(host.querySelector('.cb-learn-title')?.textContent).toBe('Thermo');
    expect(host.querySelectorAll('.cb-learn-steps li')).toHaveLength(LESSONS.find((l) => l.id === 'thermo')!.steps.length);
    expect(host.querySelector('svg.cb-learn-board')).not.toBeNull();
    expect(button('Back')?.disabled).toBe(true);
    await click(button('Next'));
    expect(button('Back')?.disabled).toBe(false);
    await click(button('Next'));
    expect(button('Next')).toBeUndefined();
    await click(button('Practice puzzle'));
    await until(() => !!host.querySelector('[data-testid="game"]'), 'the practice game');
    expect(getGame()?.mode).toBe('learn');
    expect(getGame()?.puzzle.size).toBe(4);
    expect(isLessonDone('thermo')).toBe(false);
    await act(async () => actions.solveForTesting());
    await until(() => text().includes('Lesson complete'), 'the lesson panel');
    expect(isLessonDone('thermo')).toBe(true);
    await click(button('All lessons'));
    expect(text()).toContain('1 of 10 lessons done');
    expect(host.querySelectorAll('.cb-learn-row.is-done')).toHaveLength(1);
  });

  it('opens at the lesson a rule chip asked for, and clears the request', async () => {
    openLesson('whisper');
    await learn();
    expect(host.querySelector('.cb-learn-title')?.textContent).toBe('Whisper');
    expect(peekLessonRequest()).toBeNull();
  });

  it('follows a request that arrives while it is open', async () => {
    await learn();
    expect(host.querySelector('.cb-learn-list')).not.toBeNull();
    await act(async () => openLesson('xv'));
    expect(host.querySelector('.cb-learn-title')?.textContent).toBe('XV');
  });

  it('goes back out through onExit from the list', async () => {
    let exited = 0;
    await mount(<LearnApp onExit={() => exited++} GameViewComponent={FakeGameView} />);
    await click(host.querySelector('.cb-learn-back') ?? undefined);
    expect(exited).toBe(1);
  });
});

describe('Run screen', () => {
  const run = () => mount(<RunApp onExit={() => undefined} GameViewComponent={FakeGameView} />);

  it('moves focus to the page when a screen opens, so keyboard users start at the top', async () => {
    await run();
    expect(document.activeElement).toBe(host.querySelector('.cb-run-page'));
    await click(button(/Collection/));
    expect(document.activeElement).toBe(host.querySelector('.cb-run-page'));
  });

  it('opens on the home with the daily and the free run', async () => {
    await run();
    expect(text()).toContain('Daily run');
    expect(text()).toContain('Free run');
    expect(button('Start daily run')).toBeDefined();
    expect(text()).toContain('Not played');
    expect(text()).toContain('16 of 21 cards');
  });

  it('plays a board, takes a card and starts the next board with it', async () => {
    await run();
    await click(button('Start free run'));
    await until(() => !!host.querySelector('.cb-run-hud'), 'the first board');
    expect(text()).toContain('Board 1 of 5');
    expect(getGame()?.key.startsWith('run:')).toBe(true);
    expect(getGame()?.mods).toMatchObject({ hearts: 3, shield: 0 });
    expect(host.querySelector('.cb-run-hearts')?.getAttribute('aria-label')).toBe('3 hearts');

    await act(async () => actions.solveForTesting());
    await until(() => text().includes('Board 1 cleared'), 'the board result');
    expect(text()).toContain('Run total');
    await click(button('Choose a card'));

    expect(host.querySelectorAll('.cb-run-offers button')).toHaveLength(3);
    expect(button(/^Pick a card/)?.disabled).toBe(true);
    await click(host.querySelector('.cb-run-offers button') ?? undefined);
    expect(host.querySelector('.cb-run-picked')?.textContent).toContain('Selected');
    const taken = useRunStore.getState().run!.offer[0];
    await click(button(/^Take /));
    await until(() => !!host.querySelector('.cb-run-hud') && text().includes('Board 2 of 5'), 'the second board');
    expect(useRunStore.getState().run!.setup.cardIds).toContain(taken);
    expect(getGame()?.key).toContain(':1@');
  });

  it('ends the run when the hearts run out and shows the summary', async () => {
    await run();
    await click(button('Start free run'));
    await until(() => !!host.querySelector('.cb-run-hud'), 'the first board');
    // Three wrong digits through the store's own rules.
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        const g = getGame()!;
        const cell = g.puzzle.givens.findIndex((d, k) => d === 0 && !g.values[k]);
        actions.select(cell);
        actions.input((g.puzzle.solution[cell] % g.puzzle.size) + 1);
      });
    }
    await until(() => text().includes('Run over'), 'the failure panel');
    expect(text()).toContain('out of hearts on board 1 of 5');
    await click(button('See summary'));
    expect(text()).toContain('Run over');
    expect(host.querySelector('.cb-run-share')?.textContent).toContain('Out of hearts on board 1 of 5');
    expect(useRunStore.getState().data.stats.failed).toBe(1);
    await click(button('Run home'));
    expect(text()).toContain('Last run');
  });

  it('offers to resume a run that was left, and resumes it on the same board', async () => {
    await run();
    await click(button('Start free run'));
    await until(() => !!host.querySelector('.cb-run-hud'), 'the first board');
    await click(button('Leave this board'));
    expect(text()).toContain('Run in progress');
    await click(button('Resume run'));
    await until(() => !!host.querySelector('.cb-run-hud'), 'the board again');
    expect(text()).toContain('Board 1 of 5');
  });

  it('asks before a new run replaces one in progress, and ends it on request', async () => {
    await run();
    await click(button('Start free run'));
    await until(() => !!host.querySelector('.cb-run-hud'), 'the first board');
    await click(button('Leave this board'));
    await click(button('Start free run'));
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('ends the one in progress');
    await click(button('Keep playing'));
    expect(host.querySelector('[role="alert"]')).toBeNull();
    await click(button('End run'));
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('End this run?');
    await click(host.querySelector('[role="alert"] .is-primary') ?? undefined);
    expect(text()).toContain('Run ended');
    expect(useRunStore.getState().data.current).toBeNull();
  });

  it('shows the daily run as running once started, with a resume button', async () => {
    runActions.start('daily', 1000, '2099-01-01');
    runActions.home();
    await run();
    // The home looks for today's date, so only a run for today counts as the daily in progress.
    expect(text()).toContain('Run in progress');
  });

  it('shows locked cards with how to unlock them in the Collection', async () => {
    await run();
    await click(button(/Collection/));
    expect(host.querySelectorAll('.cb-run-card.is-locked')).toHaveLength(5);
    expect(text()).toContain('Finish a run.');
    await click(host.querySelector('.cb-run-back') ?? undefined);
    expect(button('Start daily run')).toBeDefined();
  });
});
