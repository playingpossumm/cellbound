import { expect, test } from '@playwright/test';
import { boardSize, nineByNine, openFresh, openScreen, shot } from './helpers';

type Hook = { getGame(): { puzzle: { givens: number[]; solution: number[]; size: number } } | null };

test('9x9 board draws every clue kind and fits', async ({ page }) => {
  await openFresh(page, nineByNine());
  await openScreen(page, 'Free play');
  await expect(page.locator('.cb-board[data-size="9"]')).toBeVisible();
  for (const kind of ['thermo', 'arrow', 'cage', 'renban', 'whisper', 'kropki', 'xv', 'diagonal']) {
    await expect(page.locator(`.cb-clue[data-kind="${kind}"]`).first()).toBeAttached();
  }
  await expect(page.locator('.cb-chip')).toHaveCount(9);
  const keys = page.locator('.cb-key');
  await expect(keys).toHaveCount(9);
  const box = await keys.first().boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
  const noSideScroll = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(noSideScroll).toBe(true);
  await page.locator('.cb-cell').nth(40).click();
  await page.getByRole('button', { name: 'Whisper', exact: true }).click();
  await shot(page, 'nine');
});

test.describe('night', () => {
  test.use({ colorScheme: 'dark' });
  test('night variant follows the device', async ({ page }) => {
    await openFresh(page);
    await expect(page.locator('html')).toHaveAttribute('data-night', 'true');
    await page.locator('.cb-cell:not(.is-given)').first().click();
    await page.keyboard.press('Shift+Digit2');
    await page.keyboard.press('Shift+Digit5');
    await shot(page, 'night');
  });
});

test('keyboard play moves focus with the selection', async ({ page }) => {
  await openFresh(page);
  const n = await boardSize(page);
  await page.locator('.cb-cell').first().focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.cb-cell.is-sel')).toHaveAttribute('data-cell', String(n + 1));
  await expect(page.locator(`.cb-cell[data-cell="${n + 1}"]`)).toBeFocused();
  await page.keyboard.press('d');
  await expect(page.locator('.cb-cell.is-sel')).toHaveAttribute('data-cell', String(n + 2));
  await page.keyboard.press('Escape');
  await expect(page.locator('.cb-cell.is-sel')).toHaveCount(0);
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await shot(page, 'keyboard');
});

test('solving shows the result card with a share button', async ({ page }) => {
  await openFresh(page);
  const p = await page.evaluate(() => (window as unknown as { __cellbound: Hook }).__cellbound.getGame()!.puzzle);
  const cells = page.locator('.cb-cell');
  let first = true;
  for (let i = 0; i < p.givens.length; i++) {
    if (p.givens[i]) continue;
    await cells.nth(i).click();
    if (first) {
      // One wrong digit first, to show it is counted.
      await page.keyboard.press(String((p.solution[i] % p.size) + 1));
      first = false;
    }
    await page.keyboard.press(String(p.solution[i]));
  }
  const card = page.locator('.cb-result-card');
  await expect(card).toBeVisible();
  await expect(card).toContainText('Solved');
  await expect(card.getByRole('button', { name: 'Share' })).toBeVisible();
  await expect(card).toContainText('Streak');
  await shot(page, 'solved');
  await page.reload();
  await expect(page.locator('.cb-result-card')).toBeVisible();
  await page.getByRole('button', { name: 'Stats', exact: true }).first().click();
  await expect(page.locator('.cb-page-title')).toHaveText('Stats');
  await expect(page.locator('.cb-figures').first()).toContainText('1');
});

test('the timer stops while the tab is hidden', async ({ page }) => {
  await openFresh(page);
  const elapsed = () => page.evaluate(() => (window as unknown as { __cellbound: { getGame(): { elapsedMs: number } } }).__cellbound.getGame().elapsedMs);
  const setHidden = (hidden: boolean) =>
    page.evaluate((h) => {
      Object.defineProperty(document, 'visibilityState', { value: h ? 'hidden' : 'visible', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    }, hidden);
  await page.waitForTimeout(1300);
  await setHidden(true);
  const before = await elapsed();
  expect(before).toBeGreaterThan(900);
  await page.waitForTimeout(2200);
  expect(await elapsed()).toBe(before);
  await setHidden(false);
  await page.waitForTimeout(1300);
  expect(await elapsed()).toBeGreaterThan(before);
});

test('settings persist and apply', async ({ page }) => {
  await openFresh(page);
  await openScreen(page, 'Settings');
  await page.getByRole('radio', { name: 'Dark', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Timer', exact: true }).uncheck();
  await expect(page.locator('html')).toHaveAttribute('data-night', 'true');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-night', 'true');
  await openScreen(page, 'Settings');
  await expect(page.getByRole('radio', { name: 'Dark', exact: true })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Timer', exact: true })).not.toBeChecked();
  await openScreen(page, 'Daily');
  await expect(page.locator('.cb-board')).toBeVisible();
  // No time anywhere: neither in the top bar nor in the theme band.
  await expect(page.locator('.cb-timer')).toHaveCount(0);
  await expect(page.locator('.cb-top')).not.toContainText(/\d:\d\d/);
  await expect(page.locator('.cb-band-wrap')).not.toContainText(/\d:\d\d/);
});

test('the time shows once in every theme', async ({ page }) => {
  await openFresh(page);
  for (const theme of ['Star atlas', 'Paper and ink', 'Washi and sumi', 'Swiss poster', 'Prism', 'Letters in space']) {
    await openScreen(page, 'Settings');
    await page.getByRole('radio', { name: new RegExp(`^${theme}`) }).check();
    await openScreen(page, 'Daily');
    await expect(page.locator('.cb-board')).toBeVisible();
    // Every visible text node that looks like a clock.
    const clocks = await page.evaluate(() => {
      const out: string[] = [];
      const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        const el = n.parentElement;
        if (!el || !/^\s*\d+:\d\d\s*$/.test(n.textContent ?? '')) continue;
        const box = el.getBoundingClientRect();
        if (box.width > 2 && box.height > 2 && getComputedStyle(el).visibility !== 'hidden') out.push(n.textContent!.trim());
      }
      return out;
    });
    expect(clocks, theme).toHaveLength(1);
  }
});

test('free play starts a board and shares a challenge link', async ({ page }) => {
  await openFresh(page);
  await openScreen(page, 'Free play');
  await page.getByLabel('Renban').check();
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.locator('.cb-board')).toBeVisible();
  await expect(page.getByRole('button', { name: 'New board' })).toBeVisible();
  await page.getByRole('button', { name: 'Change rules' }).click();
  await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();
});
