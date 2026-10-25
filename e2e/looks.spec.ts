import { expect, test } from '@playwright/test';
import { localToday, nineByNine, openFresh, openScreen } from './helpers';

const SETTINGS = 'cellbound:v1:settings';

test('a new player starts in Prism, and the picker offers Prism and Letters in space', async ({ page }) => {
  await openFresh(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'prism');
  await openScreen(page, 'Settings');
  const names = await page.getByRole('radio').evaluateAll((els) =>
    els.filter((e) => (e as HTMLInputElement).name === 'theme').map((e) => (e.closest('label')?.querySelector('.cb-look-name')?.textContent ?? '').trim()),
  );
  expect(names).toEqual(['Prism', 'Letters in space']);
  await expect(page.getByRole('radio', { name: 'Prism' })).toBeChecked();
});

test('a player from before who never picked a look gets Prism', async ({ page }) => {
  // A saved game and no saved settings: these players were kept on Star atlas until it was removed.
  await openFresh(page, nineByNine());
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'prism');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'prism');
});

test('a saved look that was removed becomes Prism, and the other settings stay', async ({ page }) => {
  await openFresh(page);
  for (const old of ['atlas', 'paper', 'washi', 'swiss']) {
    await page.evaluate(([key, theme]) => localStorage.setItem(key, JSON.stringify({ state: { theme, night: 'dark', hideTimer: true }, version: 1 })), [SETTINGS, old]);
    await page.reload();
    await expect(page.locator('.cb-board')).toBeVisible();
    await expect(page.locator('html'), old).toHaveAttribute('data-theme', 'prism');
    await expect(page.locator('html'), old).toHaveAttribute('data-night', 'true');
    await expect(page.locator('.cb-timer'), old).toHaveCount(0);
    const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), SETTINGS);
    expect(saved?.state?.theme, old).toBe('prism');
  }
});

test('the picker shows each look instead of describing it', async ({ page }) => {
  await openFresh(page);
  await openScreen(page, 'Settings');
  await expect(page.locator('.cb-look')).toHaveCount(2);
  // Each preview is a real board in that look, drawn apart from the page's own look.
  const looks = await page.locator('.cb-look').evaluateAll((els) =>
    els.map((e) => {
      const inner = e.shadowRoot?.querySelector('.cb-look-in');
      return { theme: inner?.getAttribute('data-theme'), cells: inner?.querySelectorAll('.cb-cell').length ?? 0 };
    }),
  );
  expect(looks.map((l) => l.theme)).toEqual(['prism', 'letters']);
  for (const l of looks) expect(l.cells).toBe(16);
  // The words that used to describe each look are for screen readers only.
  expect(await page.locator('.cb-looks').innerText()).not.toContain('spectrum colour');
  await expect(page.getByRole('radio', { name: 'Prism' })).toHaveAccessibleDescription(/spectrum colour/);
  await page.getByRole('radio', { name: 'Letters in space' }).check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'letters');
});

test('the app opens on today\'s 9x9 Daily, even over a 6x6 begun for today before every Daily was a 9x9', async ({ page }) => {
  // From 24 October 2026 every Daily is a 9x9. A device that still ran the older app that morning
  // may hold a 6x6 under today's save key and puzzle id; that board is not today's Daily any more.
  const today = localToday();
  const solution = [2, 5, 4, 1, 6, 3, 6, 3, 1, 4, 2, 5, 1, 6, 3, 5, 4, 2, 4, 2, 5, 3, 1, 6, 5, 4, 2, 6, 3, 1, 3, 1, 6, 2, 5, 4];
  const givens = solution.map((d, i) => ([5, 8, 13, 17, 22, 24, 33].includes(i) ? d : 0));
  const key = `daily:${today}`;
  const game = {
    key,
    mode: 'daily',
    puzzle: { id: `daily-${today}`, seed: key, size: 6, boxW: 3, boxH: 2, givens, solution, clues: [{ kind: 'kropki', a: 34, b: 35, color: 'white' }], difficulty: 2, score: 0, name: 'Lyra' },
    values: solution.map((d, i) => (i === 0 ? d : 0)),
    notes: new Array(36).fill(0),
    selected: null,
    notesMode: false,
    undo: [],
    redo: [],
    mistakes: 0,
    hintsUsed: 0,
    elapsedMs: 42000,
    status: 'playing',
    doneBoxes: [],
    hinted: new Array(36).fill(false),
  };
  await openFresh(page, { state: { games: { [key]: game }, touched: { [key]: 1 }, lastKey: { daily: key } }, version: 1 });
  await expect(page.locator('.cb-top-title')).toHaveText('Daily');
  await expect(page.locator('.cb-board[data-size="9"]')).toBeVisible();
  await expect(page.locator('.cb-cell')).toHaveCount(81);
  await expect(page.locator('.cb-key')).toHaveCount(9);
  // It stays today's 9x9 after a reload.
  await page.reload();
  await expect(page.locator('.cb-board[data-size="9"]')).toBeVisible();
});
