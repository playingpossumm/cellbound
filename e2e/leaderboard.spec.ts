import { expect, test, type BrowserContextOptions, type Page } from '@playwright/test';
import { openFresh, openScreen, shot } from './helpers';

// The leaderboard, against the dev server's /api (a store in memory for the whole run, so every
// test picks a name of its own): logging in from the menu with a username and a PIN, a solved Daily
// on the board, the same username and PIN bringing a player's history to another device, and
// logging out.

type Hook = {
  actions: { select(i: number | null): void; input(d: number): void };
  getGame(): { status: string; values: number[]; puzzle: { givens: number[]; solution: number[] } } | null;
};

/** A name no other test of the run has: letters and digits, under 16. */
const freshName = () => `T${Date.now().toString(36).slice(-5)}${Math.random().toString(36).slice(2, 6)}`;

/** Logs in with the Log in button at the top of the menu. */
async function logIn(page: Page, name: string, pin: string) {
  await openScreen(page, 'Log in');
  await page.getByLabel('Username').fill(name);
  await page.getByLabel('PIN').fill(pin);
  await page.getByRole('button', { name: 'Log in' }).click();
}

/** Fills in today's Daily with its solution. */
async function solveDaily(page: Page) {
  await openScreen(page, 'Daily');
  await expect(page.locator('.cb-board')).toBeVisible();
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

test('a player logs in from the menu with a username and a PIN, and their solved Daily goes on the board', async ({ page }) => {
  const name = freshName();
  await openFresh(page);
  await openScreen(page, 'Log in');
  await expect(page.locator('.cb-join-note')).toHaveText('Just a username and a 4-digit PIN.');
  await logIn(page, name, '2468');
  await expect(page.getByRole('tab', { name: 'Daily', exact: true })).toHaveAttribute('aria-selected', 'true');
  // The menu shows who this device plays as, where Log in was.
  await page.getByRole('button', { name: 'Menu' }).first().click();
  await expect(page.getByRole('button', { name: `Logged in as ${name}` })).toBeVisible();
  await page.getByRole('button', { name: 'Close menu' }).click();
  await solveDaily(page);
  await openScreen(page, 'Leaderboard');
  const me = page.locator('.cb-lb-row.is-you');
  await expect(me).toContainText(name);
  await page.getByRole('tab', { name: 'Streak' }).click();
  await expect(page.locator('.cb-lb-row.is-you')).toContainText('1 day');
  await shot(page, 'leaderboard');
});

test('the same username and PIN bring a player’s history to another device, and a wrong PIN does not', async ({ page, browser }) => {
  const name = freshName();
  await openFresh(page);
  await logIn(page, name, '1357');
  await solveDaily(page);
  await openScreen(page, 'Leaderboard');
  await expect(page.locator('.cb-lb-row.is-you')).toContainText(name);

  const use = test.info().project.use;
  const other = await browser.newContext({
    viewport: use.viewport,
    isMobile: use.isMobile,
    hasTouch: use.hasTouch,
    userAgent: use.userAgent,
    deviceScaleFactor: use.deviceScaleFactor,
    reducedMotion: 'reduce',
    baseURL: use.baseURL,
  } as BrowserContextOptions);
  const second = await other.newPage();
  await openFresh(second);
  await logIn(second, name, '0000');
  await expect(second.locator('.cb-error')).toHaveText('That username is taken, or the PIN is wrong.');
  await second.getByLabel('PIN').fill('1357');
  await second.getByRole('button', { name: 'Log in' }).click();
  await expect(second.locator('.cb-lb-row.is-you')).toContainText(name);
  // The first device's Daily counts in this one's Stats.
  await openScreen(second, 'Stats');
  await expect(second.locator('.cb-figures').first()).toContainText(/Current\s*1/i);
  await other.close();
});

test('Settings shows the username, and logging out leaves the leaderboard on this device', async ({ page }) => {
  const name = freshName();
  await openFresh(page);
  await logIn(page, name, '9753');
  await expect(page.getByRole('tablist', { name: 'Boards' })).toBeVisible();
  await openScreen(page, 'Settings');
  await expect(page.locator('.cb-account')).toContainText(name);
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page.locator('.cb-account')).toHaveCount(0);
  await openScreen(page, 'Log in');
  await expect(page.getByLabel('Username')).toBeVisible();
});
