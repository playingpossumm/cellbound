import { expect, test } from '@playwright/test';
import { localToday, nineByNine, openFresh, openScreen } from './helpers';

test('a new player starts in Prism, and the picker leads with Prism and Letters in space', async ({ page }) => {
  await openFresh(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'prism');
  await openScreen(page, 'Settings');
  const names = await page.getByRole('radio').evaluateAll((els) =>
    els.filter((e) => (e as HTMLInputElement).name === 'theme').map((e) => (e.closest('label')?.querySelector('.cb-look-name')?.textContent ?? '').trim()),
  );
  expect(names).toEqual(['Prism', 'Letters in space', 'Star atlas', 'Paper and ink', 'Washi and sumi', 'Swiss poster']);
  await expect(page.getByRole('radio', { name: 'Prism' })).toBeChecked();
});

test('a player with saves from before keeps the look they had', async ({ page }) => {
  // A saved game and no saved settings: a player from before Prism was the default.
  await openFresh(page, nineByNine());
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'atlas');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'atlas');
});

test('the picker shows each look instead of describing it', async ({ page }) => {
  await openFresh(page);
  await openScreen(page, 'Settings');
  await expect(page.locator('.cb-look')).toHaveCount(6);
  // Each preview is a real board in that look, drawn apart from the page's own look.
  const looks = await page.locator('.cb-look').evaluateAll((els) =>
    els.map((e) => {
      const inner = e.shadowRoot?.querySelector('.cb-look-in');
      return { theme: inner?.getAttribute('data-theme'), cells: inner?.querySelectorAll('.cb-cell').length ?? 0 };
    }),
  );
  expect(looks.map((l) => l.theme)).toEqual(['prism', 'letters', 'atlas', 'paper', 'washi', 'swiss']);
  for (const l of looks) expect(l.cells).toBe(16);
  // The words that used to describe each look are for screen readers only.
  expect(await page.locator('.cb-looks').innerText()).not.toContain('spectrum colour');
  await expect(page.getByRole('radio', { name: 'Prism' })).toHaveAccessibleDescription(/spectrum colour/);
  await page.getByRole('radio', { name: 'Letters in space' }).check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'letters');
});

test('a Daily begun before it became a 9x9 resumes as the board it was', async ({ page }) => {
  const today = localToday();
  const solution = [2, 5, 4, 1, 6, 3, 6, 3, 1, 4, 2, 5, 1, 6, 3, 5, 4, 2, 4, 2, 5, 3, 1, 6, 5, 4, 2, 6, 3, 1, 3, 1, 6, 2, 5, 4];
  const givens = solution.map((d, i) => ([5, 8, 13, 17, 22, 24, 33].includes(i) ? d : 0));
  const values = solution.map((d, i) => (i === 0 ? d : 0));
  const key = `daily:${today}`;
  const game = {
    key,
    mode: 'daily',
    puzzle: { id: `daily-${today}`, seed: key, size: 6, boxW: 3, boxH: 2, givens, solution, clues: [{ kind: 'kropki', a: 34, b: 35, color: 'white' }], difficulty: 2, score: 0, name: 'Lyra' },
    values,
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
  await expect(page.locator('.cb-board[data-size="6"]')).toBeVisible();
  await expect(page.locator('.cb-cell')).toHaveCount(36);
  await expect(page.locator('.cb-key')).toHaveCount(6);
  await expect(page.locator('.cb-slot').first()).toHaveText(String(solution[0]));
});
