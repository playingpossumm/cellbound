import { expect, test, type Page } from '@playwright/test';
import { openFresh, openScreen, shot } from './helpers';

// Badges: a solved Daily's result card shows what it earned, the Stats screen counts every level and
// opens a picked badge's card, and a badge earned out of sight marks Stats in the menu, once.

type Hook = {
  actions: { select(i: number | null): void; input(d: number): void };
  getGame(): { status: string; values: number[]; puzzle: { givens: number[]; solution: number[] } } | null;
};

/** Fills in today's Daily with its solution, at once and with no mistakes. */
async function solveDaily(page: Page) {
  await page.evaluate(() => {
    const { actions, getGame } = (window as unknown as { __cellbound: Hook }).__cellbound;
    for (let k = 0; k < 200; k++) {
      const g = getGame();
      if (!g || g.status !== 'playing') return;
      const i = g.puzzle.givens.findIndex((d, j) => !d && g.values[j] !== g.puzzle.solution[j]);
      if (i < 0) return;
      actions.select(i);
      actions.input(g.puzzle.solution[i]);
    }
  });
}

test('a solved Daily shows the badges it earned, and Stats holds every level', async ({ page }) => {
  await openFresh(page);
  await solveDaily(page);
  const strip = page.locator('.cb-newbadges');
  // At once, with no mistakes or hints: Quick at its top level and Clean at its first. A Daily
  // with three rules or more adds Variety.
  await expect(strip).toContainText('Quick III');
  await expect(strip).toContainText('Clean I');
  await expect(page.locator('.cb-result-actions button').first()).toBeInViewport();
  await shot(page, 'badges-result');
  await page.locator('.cb-result').getByRole('button', { name: 'Stats' }).click();
  const card = page.locator('.cb-badges');
  await expect(card.locator('.cb-badges-head span')).toHaveText(/^[45] of 63$/);
  await expect(card.locator('.cb-gem-btn')).toHaveCount(21);
  // The result card showed them, so they are not marked again here.
  await expect(card.locator('.cb-gem-btn.is-new')).toHaveCount(0);
  await card.getByRole('button', { name: /^Quick/ }).click();
  await expect(card.locator('.cb-badge-card h3')).toHaveText('Quick III');
  await expect(card.locator('.cb-badge-next')).toHaveText('Every level earned');
  await shot(page, 'badges-stats');
});

test('a badge earned out of sight marks Stats in the menu and on its screen, once', async ({ page }) => {
  await openFresh(page);
  // A Daily solved in 10 minutes with no mistakes, counted after this device last showed its badges.
  await page.evaluate(() => {
    const day = '2026-10-20';
    const daily = { [day]: { status: 'solved', ms: 600_000, mistakes: 0, hints: 0, solvedOn: day } };
    localStorage.setItem('cellbound:v1:stats', JSON.stringify({ state: { solves: { daily: 1 }, fails: {}, times: {}, daily, recorded: [] }, version: 1 }));
    localStorage.setItem('cellbound:v1:badges', JSON.stringify({ v: 1, seen: {} }));
  });
  await page.reload();
  await expect(page.locator('.cb-board')).toBeVisible();
  await page.getByRole('button', { name: 'Menu' }).first().click();
  const menu = page.locator('dialog.cb-menu');
  await expect(menu.locator('.cb-menu-dot')).toBeVisible();
  await menu.getByRole('button', { name: 'Stats, a new badge' }).click();
  await expect(page.locator('.cb-gem-btn.is-new')).toHaveCount(2);
  await expect(page.locator('.cb-badge-card h3')).toHaveText('Quick II');
  await openScreen(page, 'Daily');
  await page.getByRole('button', { name: 'Menu' }).first().click();
  await expect(menu.locator('.cb-menu-dot')).toHaveCount(0);
});
