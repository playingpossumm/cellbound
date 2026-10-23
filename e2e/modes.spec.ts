import { expect, test, type Page } from '@playwright/test';
import { openFresh, openScreen } from './helpers';

type Hook = {
  actions: { select(i: number | null): void; input(d: number): void };
  getGame(): {
    key: string;
    status: string;
    values: number[];
    mistakes: number;
    fog?: { cleared: boolean[] };
    puzzle: { size: number; givens: number[]; solution: number[] };
  } | null;
};

/** Fills every cell it can see with the right digit, through the store, until the board is done. */
async function solve(page: Page) {
  await page.evaluate(() => {
    const { actions, getGame } = (window as unknown as { __cellbound: Hook }).__cellbound;
    for (let pass = 0; pass < 20; pass++) {
      const g = getGame();
      if (!g || g.status !== 'playing') return;
      g.puzzle.givens.forEach((d, i) => {
        const now = getGame()!;
        if (d || now.values[i] === now.puzzle.solution[i] || (now.fog && !now.fog.cleared[i])) return;
        actions.select(i);
        actions.input(now.puzzle.solution[i]);
      });
    }
  });
}

test('a run goes from board to card to the next board, and the menu returns to the Run home', async ({ page }) => {
  await openFresh(page);
  await openScreen(page, 'Run');
  await page.getByRole('button', { name: 'Start free run' }).click();
  await expect(page.locator('.cb-run-hud')).toContainText('Board 1 of 5');
  await expect(page.getByRole('button', { name: 'Menu' })).toBeVisible();
  await solve(page);
  await expect(page.locator('.cb-run-panel')).toContainText('Board 1 cleared');
  await page.locator('.cb-run-panel').getByRole('button', { name: 'Choose a card' }).click();
  const cards = page.locator('.cb-run-offers .cb-run-card');
  await expect(cards).toHaveCount(3);
  await cards.first().click();
  await page.getByRole('button', { name: /^Take / }).click();
  await expect(page.locator('.cb-run-hud')).toContainText('Board 2 of 5');
  // The menu takes you back to the Run home, with the run waiting.
  await openScreen(page, 'Run');
  await expect(page.getByRole('button', { name: 'Resume run' })).toBeVisible();
  await page.getByRole('button', { name: 'Resume run' }).click();
  await expect(page.locator('.cb-run-hud')).toContainText('Board 2 of 5');
});

test('the New mark on a rule chip opens that lesson, and finishing it removes the mark', async ({ page }) => {
  await openFresh(page);
  const chip = page.locator('.cb-chip').first();
  const rule = (await chip.textContent())!.trim();
  await page.locator('.cb-chip-new').first().click();
  await expect(page.locator('.cb-learn-title')).toHaveText(rule);
  await page.getByRole('button', { name: 'Skip to practice' }).click();
  await expect(page.locator('.cb-board')).toBeVisible();
  await solve(page);
  await expect(page.locator('.cb-learn-panel')).toContainText('Lesson complete');
  await openScreen(page, 'Daily');
  await expect(page.locator('.cb-chip').first()).toHaveText(rule);
  await expect(page.locator('.cb-chip-wrap').first().locator('.cb-chip-new')).toHaveCount(0);
});

test('fog clears around a right digit and never around a wrong one', async ({ page }) => {
  await openFresh(page);
  await openScreen(page, 'Fog');
  await expect(page.locator('.cb-fog.is-on').first()).toBeAttached();
  const s = await page.evaluate(() => {
    const g = (window as unknown as { __cellbound: Hook }).__cellbound.getGame()!;
    const n = g.puzzle.size;
    const dist = (a: number, b: number) => Math.max(Math.abs(Math.floor(a / n) - Math.floor(b / n)), Math.abs((a % n) - (b % n)));
    const cleared = g.fog!.cleared;
    const cell = cleared.findIndex((c, i) => c && !g.puzzle.givens[i] && !g.values[i] && cleared.some((cc, j) => !cc && dist(i, j) === 1));
    return { n, cell, right: g.puzzle.solution[cell], count: cleared.filter(Boolean).length };
  });
  const clearedCount = () =>
    page.evaluate(() => (window as unknown as { __cellbound: Hook }).__cellbound.getGame()!.fog!.cleared.filter(Boolean).length);
  await page.locator('.cb-cell').nth(s.cell).click();
  await page.keyboard.press(String((s.right % s.n) + 1));
  expect(await clearedCount()).toBe(s.count);
  await page.keyboard.press(String(s.right));
  expect(await clearedCount()).toBeGreaterThan(s.count);
  await expect(page.locator('.cb-fog.is-on')).toHaveCount(s.n * s.n - (await clearedCount()));
});
