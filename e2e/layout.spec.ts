import { expect, test, type Page } from '@playwright/test';
import { nineByNine, openFresh, openScreen } from './helpers';

const THEMES = ['Star atlas', 'Paper and ink', 'Washi and sumi', 'Swiss poster', 'Prism', 'Letters in space'];

async function useTheme(page: Page, theme: string) {
  await openScreen(page, 'Settings');
  await page.getByRole('radio', { name: new RegExp(`^${theme}`) }).check();
}

test('a tap on the middle of a narrow rule chip lights its rule instead of opening the lesson', async ({ page }) => {
  await openFresh(page, nineByNine());
  await openScreen(page, 'Free play');
  await expect(page.locator('.cb-chip')).toHaveCount(9);
  // Short names make the narrowest chips; the New mark's touch area must stay off their middle.
  for (const name of ['Cage', 'Dots', 'XV', 'Arrow']) {
    const chip = page.locator('.cb-chip', { hasText: new RegExp(`^${name}$`) });
    await chip.click();
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.cb-learn-title')).toHaveCount(0);
    await chip.click();
    await expect(chip).toHaveAttribute('aria-pressed', 'false');
  }
});

test('the New mark still opens its lesson from the mark itself', async ({ page }) => {
  await openFresh(page, nineByNine());
  await openScreen(page, 'Free play');
  const mark = page.locator('.cb-chip-new').first();
  const box = (await mark.boundingBox())!;
  // The visible mark is 24 px high; its touch area reaches 44 px, mostly upwards. The chips can
  // still move when a font arrives, so the click waits for the mark to hold still and takes its
  // position from the mark as it is then.
  await mark.click({ position: { x: box.width / 2, y: -6 } });
  await expect(page.locator('.cb-learn-title')).toBeVisible();
});

test('Paper names every mode like a newspaper', async ({ page }) => {
  // Stacking the line under the masthead must not raise a ResizeObserver loop error.
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

test('the Paper line under the masthead never ends a line on a bar', async ({ page }) => {
  await page.setViewportSize({ width: 340, height: 700 });
  // Sunday 18 October is the longest line: the date, the size and Triangulum Australe.
  await openFresh(page, undefined, '/?daily=2026-10-18');
  await useTheme(page, 'Paper and ink');
  await page.goto('/?daily=2026-10-18');
  await expect(page.locator('.pp-meta')).toBeVisible();
  // The text is first laid out in a fallback font. Wait for the real one, then for the line to settle.
  await page.evaluate(() => document.fonts.load('500 12px "Newsreader Variable"', 'Sunday 18 October Nine by nine Triangulum Australe'));
  // Either everything sits on one line with its bars, or it stacks with no bars at all.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const meta = document.querySelector('.pp-meta')!;
        const shown = [...meta.children].filter((k) => getComputedStyle(k).display !== 'none') as HTMLElement[];
        const centres = shown.map((k) => k.getBoundingClientRect()).map((r) => (r.top + r.bottom) / 2).sort((a, b) => a - b);
        let count = 1;
        for (let i = 1; i < centres.length; i++) if (centres[i] - centres[i - 1] > 6) count++;
        const bars = shown.filter((k) => k.classList.contains('pp-sep')).length;
        return meta.classList.contains('is-stacked') ? bars === 0 && count === shown.length : count === 1;
      }),
    )
    .toBe(true);
});

test('the Daily fits an upright tablet without scrolling, in every look', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await openFresh(page);
  for (const theme of THEMES) {
    await useTheme(page, theme);
    await openScreen(page, 'Daily');
    await expect(page.locator('.cb-board')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight), { message: theme })
      .toBeLessThanOrEqual(0);
  }
});

test('the text in a look\'s band never overlaps itself or leaves the band', async ({ page }) => {
  await openFresh(page, undefined, '/?daily=2026-10-18');
  for (const theme of THEMES) {
    await useTheme(page, theme);
    // Sunday 18 October has the longest name, Triangulum Australe.
    await page.goto('/?daily=2026-10-18');
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
  const m = await page.evaluate(() => {
    const board = document.querySelector('.cb-board-wrap')!.getBoundingClientRect();
    const pad = document.querySelector('.cb-pad')!.getBoundingClientRect();
    const de = document.documentElement;
    return { boardRight: board.right, padLeft: pad.left, sideways: de.scrollWidth > de.clientWidth, extra: de.scrollHeight - window.innerHeight, cell: board.width / 6 };
  });
  expect(m.sideways).toBe(false);
  expect(m.boardRight).toBeLessThan(m.padLeft);
  // Stacked, this page is more than 1000 px tall; beside each other it needs one small scroll.
  expect(m.extra).toBeLessThan(140);
  expect(m.cell).toBeGreaterThanOrEqual(44);
});
