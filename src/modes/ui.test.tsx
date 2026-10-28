// @vitest-environment jsdom
// Smoke tests for the two screens with a stand-in play surface: the flows a player takes,
// through real clicks, on top of the real stores.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { GameViewProps } from '../app/GameView';
import { actions, getGame, solveForTesting } from '../game/store';
import { LearnApp } from './learn/LearnApp';
import { LESSONS } from './learn/lessons';
import { isLessonDone, openLesson, peekLessonRequest, resetLearnStore } from './learn/store';
import { RunApp } from './run/RunApp';
import { resetRunStore, runActions, settled, useRunStore } from './run/store';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** A play surface that shows what the modes hand it: the title, the band, the extra panel, the chips, the note and the end panel. */
function FakeGameView(props: GameViewProps) {
  const over = props.game.status === 'solved' || props.game.status === 'failed';
  return (
    <div data-testid="game">
      <h1>
        {props.title} / {props.subtitle}
      </h1>
      {props.band}
      {props.extra}
      {props.chipsLead}
      {props.note && <p data-testid="note">{props.note.text}</p>}
      {props.note?.action && (
        <button type="button" onClick={props.note.action.run} disabled={props.note.action.disabled}>
          {props.note.action.label}
        </button>
      )}
      <div data-testid="overlay">{props.boardOverlay}</div>
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

  it('lists the ten lessons by name, with the first one marked as next', async () => {
    await learn();
    const rows = host.querySelectorAll('.cb-learn-row');
    expect(rows).toHaveLength(10);
    expect(rows[0].classList.contains('is-next')).toBe(true);
    expect(host.querySelectorAll('.cb-learn-row.is-next')).toHaveLength(1);
    // The rule text waits in the lesson: the list names the rules only.
    expect(text()).not.toContain('Digits rise from the round bulb');
    expect(text()).not.toMatch(/lessons done|Next up/);
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
    await act(async () => solveForTesting());
    await until(() => text().includes('Lesson complete'), 'the lesson panel');
    expect(isLessonDone('thermo')).toBe(true);
    await click(button('All lessons'));
    expect(host.querySelectorAll('.cb-learn-row.is-done')).toHaveLength(1);
    // Thermo is done, so the basics is still the next lesson.
    expect(host.querySelector('.cb-learn-row.is-next')?.textContent).toContain('The basics');
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
    await click(host.querySelector('button[aria-label="Back"]') ?? undefined);
    expect(exited).toBe(1);
  });

  it('keeps the menu one tap away on the list and on a lesson', async () => {
    await learn();
    expect(host.querySelector('header.cb-top button[aria-label="Menu"]')).not.toBeNull();
    await click(button(/Cage/));
    expect(host.querySelector('header.cb-top button[aria-label="Menu"]')).not.toBeNull();
    // The arrow in the bar returns to the list; the step buttons keep Back and Next.
    await click(host.querySelector('button[aria-label="All lessons"]') ?? undefined);
    expect(host.querySelector('.cb-learn-list')).not.toBeNull();
  });
});


describe('Run screen', () => {
  const run = () => mount(<RunApp onExit={() => undefined} GameViewComponent={FakeGameView} />);
  const state = () => useRunStore.getState();
  /** Waits for the board on the ante screen to be built, then plays it. */
  const playBoard = async () => {
    await until(() => !!button('Play') && !button('Play')!.disabled, 'the board to be ready', 20_000);
    await click(button('Play'));
    await until(() => !!host.querySelector('[data-testid="game"]'), 'the board', 20_000);
  };
  /** Types every remaining digit of the board through the store's own actions. */
  const solve = async () => {
    await act(async () => {
      const g = getGame()!;
      g.puzzle.givens.forEach((d, i) => {
        if (d || getGame()!.values[i] === g.puzzle.solution[i]) return;
        actions.select(i);
        actions.input(g.puzzle.solution[i]);
      });
      await settled();
    });
  };

  it('moves focus to the page when a screen opens, so keyboard users start at the top', async () => {
    await run();
    expect(document.activeElement).toBe(host.querySelector('.cb-run-page'));
    await click(button('Collection'));
    expect(document.activeElement).toBe(host.querySelector('.cb-run-page'));
  });

  it('opens on the home with the daily and the free run, and draws the shape of a run', async () => {
    await run();
    expect(button('Start daily run')).toBeDefined();
    expect(button('Start Run')).toBeDefined();
    expect(text()).toContain('Not played');
    // Three antes of three boards, every boss drawn larger, and a new player's four hearts on Easy.
    expect(host.querySelectorAll('.cb-run-shape .cb-run-pip')).toHaveLength(9);
    expect(host.querySelectorAll('.cb-run-shape .cb-run-pip.is-boss')).toHaveLength(3);
    expect(host.querySelector('.cb-run-shape .cb-run-hearts')?.getAttribute('aria-label')).toBe('4 hearts');
    expect(text()).not.toMatch(/How a run works|Everyone gets the same boards/);
  });

  it('starts a new player on Easy, opens Normal with a win on Easy, and draws the hearts of the pick', async () => {
    await run();
    const level = (name: string) => [...host.querySelectorAll<HTMLButtonElement>('.cb-run-levels button')].find((b) => b.textContent === name)!;
    expect(level('Easy').getAttribute('aria-pressed')).toBe('true');
    expect(level('Normal').getAttribute('aria-disabled')).toBe('true');
    expect(level('Hard').getAttribute('aria-disabled')).toBe('true');
    expect(host.querySelector('.cb-run-shape .cb-run-hearts')?.getAttribute('aria-label')).toBe('4 hearts');
    await click(level('Normal'));
    expect(text()).toContain('Win a run on Easy to open Normal.');
    await click(level('Hard'));
    expect(text()).toContain('Win a run on Normal to open Hard.');
    // A win on Easy opens Normal, which a player who never picked moves up to.
    await act(async () => useRunStore.setState({ data: { ...state().data, stats: { ...state().data.stats, won: 1, wonEasy: 1 } } }));
    expect(level('Normal').getAttribute('aria-disabled')).toBeNull();
    expect(level('Normal').getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector('.cb-run-shape .cb-run-hearts')?.getAttribute('aria-label')).toBe('3 hearts');
    await click(level('Easy'));
    expect(level('Easy').getAttribute('aria-pressed')).toBe('true');
    await click(button('Start Run'));
    expect(state().run!.difficulty).toBe('easy');
    expect(host.querySelector('.cb-run-title')?.textContent).toBe('Ante 1 Easy');
  });

  it('counts the runs of the first Run on the home', async () => {
    useRunStore.setState({ legacy: 5 });
    await run();
    expect(host.querySelector('.cb-run-stats')?.textContent).toContain('Runs5');
  });

  it('shows the ante with each target before the board starts, then plays it with the score band', async () => {
    await run();
    await click(button('Start Run'));
    expect(host.querySelector('.cb-run-title')?.textContent).toBe('Ante 1 Easy');
    expect(host.querySelectorAll('.cb-run-board')).toHaveLength(3);
    await until(() => state().run!.targets[0] !== null, 'the first target', 20_000);
    const digits = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');
    expect(digits(host.querySelector('.cb-run-board.is-now .cb-run-board-target')?.textContent)).toBe(String(state().run!.targets[0]));
    await playBoard();
    expect(getGame()?.key.startsWith('run2:')).toBe(true);
    expect(getGame()?.mods).toMatchObject({ hints: 1 });
    expect(host.querySelector('.cb-run-band-score')?.textContent).toBe('0');
    expect(text()).toContain('Ante 1, Small');
    // A placement scores once the engine has classified it: the popup and the band follow.
    await act(async () => {
      const g = getGame()!;
      const i = g.puzzle.givens.findIndex((d) => !d);
      actions.select(i);
      actions.input(g.puzzle.solution[i]);
      await settled();
    });
    expect(state().run!.live!.scored).toHaveLength(1);
    expect(host.querySelectorAll('[data-testid="overlay"] .cb-run-pop')).toHaveLength(1);
  });

  it('tallies a solved board, then goes on to a card pick, the shop and the next board', async () => {
    await run();
    await click(button('Start Run'));
    await playBoard();
    await solve();
    await until(() => !!host.querySelector('.cb-run-panel'), 'the tally', 20_000);
    const r = state().run!.results[0];
    expect(host.querySelector('.cb-run-panel-title')?.textContent).toBe(r.status === 'cleared' ? 'Cleared' : 'Missed');
    expect(host.querySelectorAll('.cb-run-techs tr').length).toBeGreaterThan(0);
    await click(button(r.status === 'cleared' ? 'Pick a card' : 'Shop'));
    if (r.status === 'cleared') {
      expect(host.querySelectorAll('.cb-run-offers button')).toHaveLength(3);
      expect(button(/^Pick a card/)?.disabled).toBe(true);
      await click(host.querySelector('.cb-run-offers button') ?? undefined);
      expect(host.querySelector('.cb-run-offers button')?.getAttribute('aria-pressed')).toBe('true');
      await click(button(/^Take /));
    }
    expect(host.querySelector('.cb-run-title')?.textContent).toBe('Shop');
    await click(button('Next board'));
    expect(state().run!.phase).toBe('select');
    expect(state().run!.slot).toBe(1);
    expect(host.querySelector('.cb-run-board.is-now .cb-run-board-kind')?.textContent).toBe('Big');
  });

  it('skips a Small board for a pick of two cards, and its shop with it', async () => {
    await run();
    await click(button('Start Run'));
    await click(button('Skip for a card'));
    expect(host.querySelectorAll('.cb-run-offers button')).toHaveLength(2);
    await click(host.querySelector('.cb-run-offers button') ?? undefined);
    await click(button(/^Take /));
    expect(state().run!.slot).toBe(1);
    expect(state().run!.results[0].status).toBe('skipped');
  });

  it('ends the run when the hearts run out and shows the summary', async () => {
    await run();
    await click(button('Start Run'));
    await playBoard();
    await act(async () => {
      const g = getGame()!;
      const cell = g.puzzle.givens.findIndex((d) => !d);
      // A different wrong digit for each heart the run has.
      for (const d of [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((x) => x !== g.puzzle.solution[cell]).slice(0, state().run!.hearts)) {
        actions.select(cell);
        actions.input(d);
      }
      await settled();
    });
    await until(() => text().includes('Out of hearts'), 'the tally');
    await click(button('See summary'));
    expect(host.querySelector('.cb-run-title')?.textContent).toBe('Run over');
    expect(host.querySelector('.cb-run-share')).toBeNull();
    await click(button('Share result'));
    await until(() => !!host.querySelector('.cb-run-share'), 'the result text');
    expect(host.querySelector('.cb-run-share')?.textContent).toContain('Out of hearts on Ante 1, Small');
    expect(state().data.stats.lost).toBe(1);
    await click(button('Run home'));
    expect(text()).toContain('Last run');
  });

  it('offers to resume a run that was left, and resumes it on the same board', async () => {
    await run();
    await click(button('Start Run'));
    await playBoard();
    await click(button('Leave this board'));
    expect(text()).toContain('Run in progress');
    await click(button('Resume run'));
    await until(() => !!host.querySelector('[data-testid="game"]'), 'the board again', 20_000);
    expect(text()).toContain('Ante 1, Small');
  });

  it('asks before a new run replaces one in progress, and ends it on request', async () => {
    await run();
    await click(button('Start Run'));
    await click(host.querySelector('button[aria-label="Back"]') ?? undefined);
    await click(button('Start Run'));
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('ends the one in progress');
    await click(button('Keep playing'));
    expect(host.querySelector('[role="alert"]')).toBeNull();
    await click(button('End run'));
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('End this run?');
    await click(host.querySelector('[role="alert"] .is-primary') ?? undefined);
    expect(host.querySelector('.cb-run-title')?.textContent).toBe('Run ended');
    expect(state().data.current).toBeNull();
  });

  it('runs the shop: buy a lens, see it in a slot, sell it, reroll, and go on to the next board', async () => {
    runActions.start('free', 1000, '2099-01-01');
    const r = state().run!;
    useRunStore.setState({ run: { ...r, phase: 'shop', slot: 2, coins: 30, shop: { ante: 1, rerolls: 0, lenses: ['loupe', 'spyglass'], items: ['spectra1', 'inkHint'] } } });
    await run();
    expect(host.querySelector('.cb-run-title')?.textContent).toBe('Shop');
    await click(host.querySelector('button[aria-label="Buy Loupe for 4 coins"]') ?? undefined);
    expect(state().run!.lenses).toEqual([{ id: 'loupe' }]);
    expect(state().run!.coins).toBe(26);
    await click(host.querySelector('.cb-run-loadout button[aria-label^="Loupe"]') ?? undefined);
    await click(host.querySelector('button[aria-label="Sell for 2 coins"]') ?? undefined);
    expect(state().run!.lenses).toEqual([]);
    expect(state().run!.coins).toBe(28);
    await click(host.querySelector('button[aria-label="Reroll for 2 coins"]') ?? undefined);
    expect(state().run!.shop!.rerolls).toBe(1);
    expect(state().run!.coins).toBe(26);
    await click(button('Next board'));
    expect(state().run!).toMatchObject({ phase: 'select', slot: 3 });
    expect(host.querySelector('.cb-run-title')?.textContent).toBe('Ante 2 Easy');
  });

  it('keeps a lens picked while it moves, and drops the pick when it is sold, so a second tap cannot sell the next one', async () => {
    runActions.start('free', 1000, '2099-01-01');
    const r = state().run!;
    const shop = { ante: 1, rerolls: 0, lenses: ['spyglass', 'arrow'], items: ['spectra1', 'inkHint'] };
    useRunStore.setState({ run: { ...r, phase: 'shop', slot: 2, coins: 30, lenses: [{ id: 'loupe' }, { id: 'monocle' }], shop } as typeof r });
    await run();
    const tiles = () => [...host.querySelectorAll('.cb-run-loadout .cb-run-lens')];
    const picked = () => tiles().filter((t) => t.className.includes('is-selected')).map((t) => (t.getAttribute('aria-label') ?? '').split(':')[0]);
    await click(tiles()[0]);
    expect(picked()).toEqual(['Loupe']);
    await click(button('Move right'));
    expect(state().run!.lenses.map((l) => l.id)).toEqual(['monocle', 'loupe']);
    expect(picked()).toEqual(['Loupe']);
    expect(host.querySelector('.cb-run-detail')?.textContent).toContain('Loupe');
    await click(button(/^Sell/));
    expect(state().run!.lenses.map((l) => l.id)).toEqual(['monocle']);
    expect(host.querySelector('.cb-run-detail')).toBeNull();
    expect(picked()).toEqual([]);
  });

  it('shows the cards a run holds by name, with how many, and what a picked one does', async () => {
    runActions.start('free', 1000, '2099-01-01');
    const r = state().run!;
    useRunStore.setState({ run: { ...r, perks: { prismShard: 2, peek: 1, lifeLink: 1 } } });
    await run();
    expect(host.querySelector('.cb-run-title')?.textContent).toBe('Ante 1 Easy');
    const pills = [...host.querySelectorAll('.cb-run-perk')];
    expect(pills.map((p) => p.textContent)).toEqual(['Life Link', 'Peek', 'Prism Shard×2']);
    expect(host.querySelector('.cb-run-detail')).toBeNull();
    await click(pills[2]);
    expect(host.querySelector('.cb-run-detail')?.textContent).toContain('Prism Shard ×2');
    expect(host.querySelector('.cb-run-detail')?.textContent).toContain('on all scoring');
    await click(pills[2]);
    expect(host.querySelector('.cb-run-detail')).toBeNull();
    // A run with no cards draws no row for them.
    useRunStore.setState({ run: { ...state().run!, perks: {} } });
    await run();
    expect(host.querySelector('.cb-run-perk')).toBeNull();
  });

  it('brings the words and buttons of a picked tile into view, no further than needed, and not when it is put away', async () => {
    const scrolled: Array<{ cls: string; arg: unknown }> = [];
    const before = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (this: Element, arg?: boolean | ScrollIntoViewOptions) {
      scrolled.push({ cls: this.className, arg });
    };
    try {
      runActions.start('free', 1000, '2099-01-01');
      const r = state().run!;
      useRunStore.setState({ run: { ...r, perks: { peek: 1 } } });
      await run();
      await click(host.querySelector('.cb-run-perk') ?? undefined);
      expect(scrolled).toHaveLength(1);
      expect(scrolled[0]!.cls).toContain('cb-run-detail');
      expect(scrolled[0]!.arg).toMatchObject({ block: 'nearest' });
      await click(host.querySelector('.cb-run-perk') ?? undefined);
      expect(host.querySelector('.cb-run-detail')).toBeNull();
      expect(scrolled).toHaveLength(1);
    } finally {
      Element.prototype.scrollIntoView = before;
    }
  });

  it('marks where a Thief gives come back with a question mark, and takes the mark off when the given returns', async () => {
    await run();
    await click(button('Start Run'));
    await playBoard();
    const live = state().run!.live!;
    useRunStore.setState({ run: { ...state().run!, live: { ...live, stolen: [3, 17] } } });
    await act(async () => undefined);
    expect(host.querySelectorAll('[data-testid="overlay"] .cb-run-ghost')).toHaveLength(2);
    expect(host.querySelector('[data-testid="overlay"] .cb-run-ghost')?.getAttribute('aria-hidden')).toBe('true');
    useRunStore.setState({ run: { ...state().run!, live: { ...state().run!.live!, stolen: [17] } } });
    await act(async () => undefined);
    expect(host.querySelectorAll('[data-testid="overlay"] .cb-run-ghost')).toHaveLength(1);
  });

  it('draws one run in progress on the home: its own box to resume from, and no empty shape or second button', async () => {
    runActions.start('daily', 1000);
    runActions.home();
    await run();
    expect(host.querySelector('.cb-run-shape')).toBeNull();
    expect(host.querySelectorAll('.cb-run-box [class*="cb-run-pip"]').length).toBeGreaterThan(0);
    expect(buttons().filter((b) => /^Resume/.test(b.textContent ?? ''))).toHaveLength(1);
    expect(button(/daily/i)).toBeUndefined();
    expect(button('Start Run')).toBeDefined();
    // Neither start is the main button while there is a run to resume.
    expect(host.querySelectorAll('.cb-run-btn.is-primary')).toHaveLength(1);
  });

  it('shows a lens or the boss rule in the message panel on the board, and uses an item from there', async () => {
    runActions.start('free', 1000, '2099-01-01');
    const r = state().run!;
    useRunStore.setState({ run: { ...r, slot: 2, bosses: ['mute', 'fog', 'clock'], lenses: [{ id: 'loupe' }], items: ['inkHint'] } });
    runActions.retry();
    await run();
    await playBoard();
    await click(host.querySelector('button[aria-label^="Loupe"]') ?? undefined);
    expect(host.querySelector('[data-testid="note"]')?.textContent).toContain('Loupe.');
    await click(host.querySelector('.cb-run-bosschip') ?? undefined);
    expect(host.querySelector('[data-testid="note"]')?.textContent).toContain('No notes on this board.');
    await click(host.querySelector('button[aria-label^="Hint Ink"]') ?? undefined);
    await click(button('Use'));
    expect(getGame()!.mods!.hints).toBe(2);
    expect(state().run!.items).toEqual([]);
  });

  it('shows locked lenses and cards with how to open them, and the codex, in the Collection', async () => {
    await run();
    await click(button('Collection'));
    expect(host.querySelectorAll('.cb-run-grid > li')).toHaveLength(20);
    expect(host.querySelectorAll('.cb-run-grid > li.is-locked')).toHaveLength(8);
    expect(text()).toContain('Win a run.');
    await click(button('Cards'));
    expect(host.querySelectorAll('.cb-run-grid > li.is-locked')).toHaveLength(2);
    await click(button('Codex'));
    expect(text()).toContain('X-Wing');
    expect(host.querySelectorAll('.cb-run-codex-tier')).toHaveLength(8);
    await click(host.querySelector('button[aria-label="Back"]') ?? undefined);
    expect(button('Start daily run')).toBeDefined();
  });

  it('keeps the menu one tap away on every Run page', async () => {
    await run();
    expect(host.querySelector('header.cb-top button[aria-label="Menu"]')).not.toBeNull();
    await click(button('Collection'));
    expect(host.querySelector('header.cb-top button[aria-label="Menu"]')).not.toBeNull();
    await click(host.querySelector('button[aria-label="Back"]') ?? undefined);
    await click(button('Start Run'));
    expect(host.querySelector('header.cb-top button[aria-label="Menu"]')).not.toBeNull();
  });
});
