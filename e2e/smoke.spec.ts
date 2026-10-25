import { expect, test, type Page } from '@playwright/test';
import { boardSize, openFresh, shot } from './helpers';

async function emptyCell(page: Page) {
  const cells = page.locator('.cb-cell:not(.is-given)');
  return cells.first();
}

test('opens into the Daily', async ({ page }) => {
  await openFresh(page);
  await expect(page.locator('.cb-top-title')).toHaveText('Daily');
  const n = await boardSize(page);
  expect([6, 9]).toContain(n);
  await expect(page.locator('.cb-cell')).toHaveCount(n * n);
  await expect(page.locator('.cb-key')).toHaveCount(n);
  await expect(page.locator('.cb-chip').first()).toBeVisible();
  // Today's Daily carries no date, and the play screen no rule line or helper text.
  await expect(page.locator('.cb-band-wrap')).not.toContainText(/day \d{1,2} [A-Z]/);
  await expect(page.locator('body')).not.toContainText(/Tap a rule|Each row, column and box|\d left/);
  await shot(page, 'daily');
});

test('select a cell and type a digit, then undo', async ({ page }) => {
  await openFresh(page);
  const cell = await emptyCell(page);
  const index = Number(await cell.getAttribute('data-cell'));
  await cell.click();
  await expect(cell).toHaveClass(/is-sel/);
  await page.keyboard.press('4');
  const slot = page.locator('.cb-slot').nth(index);
  await expect(slot.locator('.cb-digit')).toHaveText('4');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(slot.locator('.cb-digit')).toHaveCount(0);
  await page.getByRole('button', { name: /^Enter 2/ }).click();
  await expect(slot.locator('.cb-digit')).toHaveText('2');
  await page.keyboard.press('z');
  await expect(slot.locator('.cb-digit')).toHaveCount(0);
  await page.keyboard.press('y');
  await expect(slot.locator('.cb-digit')).toHaveText('2');
});

test('notes toggle', async ({ page }) => {
  await openFresh(page);
  const cell = await emptyCell(page);
  const index = Number(await cell.getAttribute('data-cell'));
  await cell.click();
  const notes = page.getByRole('button', { name: 'Notes', exact: true });
  await notes.click();
  await expect(notes).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('1');
  await page.keyboard.press('3');
  const slot = page.locator('.cb-slot').nth(index);
  await expect(slot.locator('.cb-note.on')).toHaveCount(2);
  await page.keyboard.press('n');
  await expect(notes).toHaveAttribute('aria-pressed', 'false');
  await shot(page, 'notes');
});

test('hint ladder and rule chips', async ({ page }) => {
  await openFresh(page);
  await page.locator('.cb-chip').first().click();
  await expect(page.locator('.cb-clue.is-lit').first()).toBeAttached();
  await page.getByRole('button', { name: 'Hint', exact: true }).click();
  // A hint step takes the band's place, over the band, so nothing below it moves.
  await expect(page.locator('.cb-msg.is-hint')).toBeVisible();
  await page.getByRole('button', { name: 'Hint', exact: true }).click();
  await page.getByRole('button', { name: 'Hint', exact: true }).click();
  await expect(page.locator('.cb-digit.is-hint')).toHaveCount(1);
  await shot(page, 'hint');
});

test('pause blurs the board and stops play', async ({ page }) => {
  await openFresh(page);
  await page.keyboard.press('p');
  await expect(page.locator('.cb-pause')).toBeVisible();
  await shot(page, 'paused');
  await page.getByRole('button', { name: 'Resume' }).first().click();
  await expect(page.locator('.cb-pause')).toHaveCount(0);
});

const screens: [string, RegExp][] = [
  ['Fog', /Fog/],
  ['Free play', /Free play/],
  ['Stats', /Stats/],
  ['Settings', /Settings/],
  ['About', /About/],
  ['Daily', /Daily/],
];

test('each menu screen opens', async ({ page }) => {
  await openFresh(page);
  for (const [name, title] of screens) {
    await page.getByRole('button', { name: 'Menu' }).first().click();
    const menu = page.locator('dialog.cb-menu');
    await expect(menu).toBeVisible();
    if (name === 'Daily') await shot(page, 'menu');
    await menu.getByRole('button', { name: new RegExp(`^${name}`) }).click();
    await expect(menu).toBeHidden();
    await expect(page.locator('.cb-top-title')).toHaveText(title);
    if (name === 'Fog' || name === 'Free play') {
      await expect(page.locator('.cb-board, .cb-form').first()).toBeVisible();
    }
    await shot(page, name.toLowerCase().replace(' ', '-'));
  }
});

test('board and pad fit a laptop window without scrolling', async ({ page }, info) => {
  test.skip(info.project.metadata.form !== 'laptop');
  await page.setViewportSize({ width: 1366, height: 660 });
  await openFresh(page);
  // Measured once the look's font has loaded, as the layout tests do: before that, the side
  // column is set in a fallback face that can run a few pixels taller.
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBeLessThanOrEqual(1);
  await shot(page, 'daily-660');
});

for (const [w, h] of [
  [360, 640],
  [800, 1000],
]) {
  test(`no sideways scroll at ${w}x${h}`, async ({ page }, info) => {
    test.skip(info.project.metadata.form !== 'phone');
    await page.setViewportSize({ width: w, height: h });
    await openFresh(page);
    const sideways = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(sideways).toBe(false);
    // The cell's share of the board: some looks inset each cell's tile inside it.
    const board = await page.locator('.cb-board-wrap').boundingBox();
    const n = await boardSize(page);
    // A 9x9 on a small 360x640 phone gives up a little width so its pad fits, and keeps 34 px cells.
    expect(board!.width / n).toBeGreaterThanOrEqual(n === 9 ? (w < 390 ? 34 : 40) : w < 390 ? 50 : 52);
    await shot(page, `daily-${w}`);
  });
}

test('challenge link opens that day', async ({ page }) => {
  await openFresh(page, undefined, '/?daily=2026-10-18');
  await expect(page.locator('.cb-board')).toBeVisible();
  await expect(page.locator('.cb-band-wrap')).toContainText('Sunday 18 October');
});
