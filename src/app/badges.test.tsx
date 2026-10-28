// @vitest-environment jsdom
// Badges on screen: the gem at each level, the Stats screen's card with its new marks and the
// picked badge, and the strip of badges a game has just earned, shown once.
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useStats, type DailyEntry } from '../game/stats';
import { useLearnStore } from '../modes/learn/store';
import { BadgesCard, Gem, NewBadges, primeBadges, resetSeenForTesting } from './badges';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
const render = (el: ReactElement) => act(async () => root.render(el));
async function remount(el: ReactElement) {
  await act(async () => root.unmount());
  root = createRoot(host);
  await render(el);
}
const solved = (date: string, ms: number): [string, DailyEntry] => [date, { status: 'solved', ms, mistakes: 0, hints: 0, solvedOn: date }];

beforeEach(() => {
  localStorage.clear();
  useStats.getState().clear();
  useLearnStore.setState({ done: {} });
  resetSeenForTesting();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe('a gem', () => {
  it('lights a third of its rim at each level, and adds a glint at III', async () => {
    const lit = () => host.querySelectorAll('.cb-gem-rim.is-lit').length;
    await render(<Gem id="streak" level={0} />);
    expect(lit()).toBe(0);
    expect(host.querySelector('.cb-gem.is-locked')).not.toBeNull();
    await render(<Gem id="streak" level={2} />);
    expect(lit()).toBe(4);
    expect(host.querySelector('.cb-gem-glint')).toBeNull();
    await render(<Gem id="streak" level={3} />);
    expect(lit()).toBe(6);
    expect(host.querySelector('.cb-gem-glint')).not.toBeNull();
  });
});

describe('the Stats screen’s badges', () => {
  it('count the levels earned, mark the new ones until the screen is left, and show the picked one', async () => {
    primeBadges();
    useStats.setState({ daily: Object.fromEntries([solved('2026-10-27', 9 * 60_000), solved('2026-10-28', 10 * 60_000)]) });
    await render(<BadgesCard />);
    // Quick II and Clean I.
    expect(host.querySelector('.cb-badges-head span')?.textContent).toBe('3 of 63');
    expect(host.querySelectorAll('.cb-gem-btn.is-new')).toHaveLength(2);
    expect(host.querySelector('.cb-badge-card h3')?.textContent).toBe('Quick II');
    expect(host.querySelector('.cb-badge-next')?.textContent).toBe('Best 9:00, level III at 8 min');
    await act(async () => (host.querySelector('button[aria-label^="Streak"]') as HTMLButtonElement).click());
    expect(host.querySelector('.cb-badge-card h3')?.textContent).toBe('Streak');
    expect(host.querySelector('.cb-badge-next')?.textContent).toBe('2 of 3 days');
    await remount(<BadgesCard />);
    expect(host.querySelectorAll('.cb-gem-btn.is-new')).toHaveLength(0);
  });
});

describe('badges just earned', () => {
  it('show on the card that follows a game, once', async () => {
    primeBadges();
    useStats.setState({ daily: Object.fromEntries([solved('2026-10-28', 7 * 60_000)]) });
    await render(<NewBadges />);
    expect(host.querySelector('.cb-newbadges h3')?.textContent).toBe('New badges');
    expect([...host.querySelectorAll('.cb-newbadges li')].map((li) => li.textContent)).toEqual(['Quick III', 'Clean I']);
    await remount(<NewBadges />);
    expect(host.querySelector('.cb-newbadges')).toBeNull();
  });

  it('leave unannounced what was earned before badges arrived', async () => {
    useStats.setState({ daily: Object.fromEntries([solved('2026-10-28', 7 * 60_000)]) });
    primeBadges();
    await render(<NewBadges />);
    expect(host.querySelector('.cb-newbadges')).toBeNull();
  });
});
