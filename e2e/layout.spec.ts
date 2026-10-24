import { expect, test, type Page } from '@playwright/test';
import { boardSize, nineByNine, openFresh, openScreen, shot } from './helpers';

const THEMES = ['Prism', 'Letters in space', 'Star atlas', 'Paper and ink', 'Washi and sumi', 'Swiss poster'];

/** A Daily from before every Daily was 9x9 (a 6x6 Friday), and a 9x9 one (a Sunday). Past Dailies never change. */
const SIX = '/?daily=2026-10-23';
const NINE = '/?daily=2026-10-18';

async function useTheme(page: Page, theme: string) {
  await openScreen(page, 'Settings');
  await page.getByRole('radio', { name: new RegExp(`^${theme}`) }).check();
}

/** How far the page runs past the bottom of the window, once fonts have settled. */
async function overflow(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  return page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
}

test('a tap on a rule chip lights its rule and shows its text, and a second tap puts both away', async ({ page }) => {
  await openFresh(page, nineByNine());
  await openScreen(page, 'Free play');
  await expect(page.locator('.cb-chip')).toHaveCount(9);
  for (const name of ['Cage', 'Dots', 'XV', 'Arrow']) {
    const chip = page.locator('.cb-chip', { hasText: new RegExp(`^${name}$`) });
    await chip.click();
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.cb-msg-text')).toBeVisible();
    await expect(page.locator('.cb-learn-title')).toHaveCount(0);
    await chip.click();
    await expect(chip).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('.cb-msg')).toHaveCount(0);
  }
});

test('a rule with no lesson done carries a dot, and its text opens the lesson', async ({ page }) => {
  await openFresh(page, nineByNine());
  await openScreen(page, 'Free play');
  const chip = page.locator('.cb-chip', { hasText: /^Thermo$/ });
  await expect(chip).toHaveClass(/is-new/);
  await chip.click();
  await page.getByRole('button', { name: 'Open the Thermo lesson' }).click();
  await expect(page.locator('.cb-learn-title')).toHaveText('Thermo');
});

test('Paper names every mode like a newspaper', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openFresh(page);
  await useTheme(page, 'Paper and ink');
  await openScreen(page, 'Daily');
  await expect(page.locator('.pp-title')).toHaveText('The Daily Puzzle');
  await openScreen(page, 'Fog');
  await expect(page.locator('.pp-title')).toHaveText('The Fog Report');
  await openScreen(page, 'Free play');
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.locator('.pp-title')).toHaveText('The Free Play Edition');
  await openScreen(page, 'Run');
  await page.getByRole('button', { name: 'Start free run' }).click();
  await expect(page.locator('.pp-title')).toHaveText('The Run Gazette');
  await openScreen(page, 'Learn');
  await page.locator('.cb-learn-row').first().click();
  await page.getByRole('button', { name: 'Skip to practice' }).click();
  await expect(page.locator('.pp-title')).toHaveText('The Learning Column');
  expect(errors).toEqual([]);
});

test('every band shows a date only on a Daily from an earlier day', async ({ page }) => {
  await openFresh(page);
  const dated = /(Sun|Mon|Tues|Wednes|Thurs|Fri|Satur)day \d{1,2} [A-Z]/i;
  for (const theme of THEMES) {
    await useTheme(page, theme);
    await openScreen(page, 'Daily');
    await expect(page.locator('.cb-board')).toBeVisible();
    await expect(page.locator('.cb-band-wrap'), theme).not.toContainText(dated);
  }
  await page.goto(NINE);
  await expect(page.locator('.cb-band-wrap')).toContainText(/Sunday 18 October/i);
});

test('the Daily fits an upright tablet without scrolling, in every look', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await openFresh(page);
  for (const theme of THEMES) {
    await useTheme(page, theme);
    await openScreen(page, 'Daily');
    await expect(page.locator('.cb-board')).toBeVisible();
    await expect.poll(() => overflow(page), { message: theme }).toBeLessThanOrEqual(0);
  }
});

test('the text in a look\'s band never overlaps itself or leaves the band', async ({ page }) => {
  await openFresh(page, undefined, NINE);
  for (const theme of THEMES) {
    await useTheme(page, theme);
    // A past Sunday: the longest band, with the date and the longest name, Triangulum Australe.
    await page.goto(NINE);
    await expect(page.locator('.cb-band-wrap')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    const problems = await page.evaluate(() => {
      const band = document.querySelector('.cb-band-wrap')!;
      const b = band.getBoundingClientRect();
      const items: { t: string; l: number; top: number; r: number; bottom: number }[] = [];
      const walker = document.createTreeWalker(band, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const text = (n.textContent ?? '').trim();
        const el = n.parentElement;
        // The Letters figure is a cloud of single letters that overlap by design.
        if (!text || !el || el.closest('.lt-fig')) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        const r = range.getBoundingClientRect();
        if (r.width >= 1) items.push({ t: text.slice(0, 24), l: r.left, top: r.top, r: r.right, bottom: r.bottom });
      }
      const out: string[] = [];
      items.forEach((a, i) => {
        if (a.r > b.right + 1 || a.l < b.left - 4) out.push(`${a.t} leaves the band`);
        if (a.bottom > b.bottom + 3) out.push(`${a.t} runs below the band`);
        for (const c of items.slice(i + 1)) {
          if (Math.min(a.r, c.r) - Math.max(a.l, c.l) > 2 && Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top) > 3) out.push(`${a.t} overlaps ${c.t}`);
        }
      });
      return out;
    });
    expect(problems, theme).toEqual([]);
  }
});

test('a phone held sideways puts the board beside the pad instead of stacking them', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await openFresh(page);
  await page.evaluate(() => document.fonts.ready);
  const n = await boardSize(page);
  const m = await page.evaluate(() => {
    const board = document.querySelector('.cb-board-wrap')!.getBoundingClientRect();
    const pad = document.querySelector('.cb-pad')!.getBoundingClientRect();
    const de = document.documentElement;
    return { boardRight: board.right, padLeft: pad.left, sideways: de.scrollWidth > de.clientWidth, extra: de.scrollHeight - window.innerHeight, board: board.width };
  });
  expect(m.sideways).toBe(false);
  expect(m.boardRight).toBeLessThan(m.padLeft);
  // Stacked, this page is more than 1000 px tall; beside each other it needs one small scroll.
  expect(m.extra).toBeLessThan(140);
  // The board takes the whole height under the top bar.
  expect(m.board).toBeGreaterThanOrEqual(300);
  expect(m.board / n).toBeGreaterThanOrEqual(n === 9 ? 33 : 44);
});

// A 9x9 is the main board: on a phone it takes the full width with the pad and tools in view,
// and on a laptop it takes the full height, all without scrolling.
test('a 9x9 board fills a phone\'s width and the whole Daily fits the screen', async ({ page }, info) => {
  test.skip(info.project.metadata.form !== 'phone');
  await openFresh(page, undefined, NINE);
  for (const theme of THEMES) {
    await useTheme(page, theme);
    await page.goto(NINE);
    await expect(page.locator('.cb-board[data-size="9"]')).toBeVisible();
    await expect.poll(() => overflow(page), { message: theme }).toBeLessThanOrEqual(0);
    const board = (await page.locator('.cb-board-wrap').boundingBox())!;
    const tools = (await page.locator('.cb-tools').boundingBox())!;
    const vw = page.viewportSize()!;
    // The board leaves only a small gutter on each side.
    expect(board.width, theme).toBeGreaterThanOrEqual(vw.width - 14);
    expect(tools.y + tools.height, theme).toBeLessThanOrEqual(vw.height);
    const key = (await page.locator('.cb-key').first().boundingBox())!;
    expect(key.width).toBeGreaterThanOrEqual(44);
    expect(key.height).toBeGreaterThanOrEqual(44);
    if (theme === 'Prism' || theme === 'Letters in space') await shot(page, `nine-${theme.split(' ')[0].toLowerCase()}`);
  }
});

test('a 9x9 board takes a laptop window\'s height, with the controls beside it', async ({ page }, info) => {
  test.skip(info.project.metadata.form !== 'laptop');
  await page.setViewportSize({ width: 1366, height: 660 });
  await openFresh(page, undefined, NINE);
  await expect(page.locator('.cb-board[data-size="9"]')).toBeVisible();
  await expect.poll(() => overflow(page)).toBeLessThanOrEqual(0);
  const board = (await page.locator('.cb-board-wrap').boundingBox())!;
  const pad = (await page.locator('.cb-pad').boundingBox())!;
  expect(board.height).toBeGreaterThanOrEqual(560);
  expect(board.x + board.width).toBeLessThan(pad.x);
  await shot(page, 'nine-laptop-660');
});

test('a 6x6 Daily from before the change still opens as a 6x6', async ({ page }) => {
  await openFresh(page, undefined, SIX);
  await expect(page.locator('.cb-board[data-size="6"]')).toBeVisible();
  await expect(page.locator('.cb-cell')).toHaveCount(36);
  await expect(page.locator('.cb-key')).toHaveCount(6);
  await expect.poll(() => overflow(page)).toBeLessThanOrEqual(0);
});
