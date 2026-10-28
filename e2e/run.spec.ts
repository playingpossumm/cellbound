import { expect, test, type Page } from '@playwright/test';
import { openFresh, openScreen, shot } from './helpers';

// Run: antes of boards scored by technique, the ante screen with its targets, the tally, the
// reward pick, the shop and the summary. Saved runs are seeded under cellbound:run:v2 where a test
// needs a particular state.

type Hook = {
  actions: { select(i: number | null): void; input(d: number): void };
  getGame(): { status: string; values: number[]; fog?: { cleared: boolean[] }; puzzle: { givens: number[]; solution: number[] } } | null;
  candidates(p: unknown, grid: number[]): number[];
};

/**
 * Plays the board in view to its end, as a player would: a cell that logic proves when there is
 * one (one candidate left), any open cell otherwise.
 */
async function solve(page: Page) {
  await page.evaluate(async () => {
    const { actions, getGame, candidates } = (window as unknown as { __cellbound: Hook }).__cellbound;
    for (let guard = 0; guard < 200; guard++) {
      const g = getGame();
      if (!g || g.status !== 'playing') return;
      const grid = g.puzzle.givens.map((d, i) => d || (g.values[i] === g.puzzle.solution[i] ? g.values[i] : 0));
      const open = (i: number) => !grid[i] && (!g.fog || g.fog.cleared[i]);
      const cands = candidates(g.puzzle, grid);
      let pick = grid.findIndex((_, i) => open(i) && cands[i] && (cands[i] & (cands[i] - 1)) === 0);
      if (pick < 0) pick = grid.findIndex((_, i) => open(i));
      if (pick < 0) return;
      actions.select(pick);
      actions.input(g.puzzle.solution[pick]);
      await new Promise((r) => setTimeout(r, 5));
    }
  });
}

/** A saved run under cellbound:run:v2, in the shape the app saves. */
function savedRun(over: Record<string, unknown> = {}) {
  return {
    v: 2,
    seed: 'free:e2erun01',
    daily: null,
    createdAt: 1761500000000,
    phase: 'select',
    slot: 0,
    hearts: 3,
    maxHearts: 3,
    shield: 0,
    coins: 4,
    hintPool: 0,
    lenses: [],
    items: [],
    perks: {},
    levels: [0, 0, 0, 0, 0, 0, 0, 0, 0],
    bosses: ['fog', 'mute', 'clock'],
    targets: [null, null, null, null, null, null, null, null, null],
    next: {},
    pending: null,
    secondWindUsed: false,
    results: [],
    score: 0,
    bonus: 0,
    live: null,
    offer: null,
    shop: null,
    lastCats: [],
    hintsLast: 0,
    outcome: null,
    recorded: false,
    ...over,
  };
}

/** Opens the app with saved data for the Run (and optionally the first Run), then the Run home. */
async function openRunWith(page: Page, saved: unknown, legacy?: unknown) {
  await page.addInitScript(
    ([s, l]) => {
      if (sessionStorage.getItem('cb-e2e-run')) return;
      sessionStorage.setItem('cb-e2e-run', '1');
      localStorage.clear();
      if (s) localStorage.setItem('cellbound:run:v2', JSON.stringify(s));
      if (l) localStorage.setItem('cellbound:run:v1', l as string);
    },
    [saved, legacy ?? null] as const,
  );
  await page.goto('/');
  await expect(page.locator('.cb-board')).toBeVisible();
  await openScreen(page, 'Run');
  await expect(page.locator('.cb-run-title')).toHaveText('Run');
}

const play = (page: Page) => page.getByRole('button', { name: 'Play', exact: true });

async function playWhenReady(page: Page) {
  await expect(play(page)).toBeEnabled({ timeout: 30_000 });
  await play(page).click();
  await expect(page.locator('.cb-board[data-size="9"]')).toBeVisible();
  await expect(page.locator('.cb-run-band')).toBeVisible();
}

test('a run shows each target before its board, scores the board and moves on', async ({ page }) => {
  await openFresh(page);
  await openScreen(page, 'Run');
  // The shape of a run: three antes of three boards, a boss in each.
  await expect(page.locator('.cb-run-shape .cb-run-pip')).toHaveCount(9);
  await expect(page.locator('.cb-run-shape .cb-run-pip.is-boss')).toHaveCount(3);
  await page.getByRole('button', { name: 'Start Run' }).click();
  // A new player starts on Easy.
  await expect(page.locator('.cb-run-title')).toHaveText('Ante 1 Easy');
  await expect(page.locator('.cb-run-board')).toHaveCount(3);
  await expect(page.locator('.cb-run-board.is-now .cb-run-board-target')).toHaveText(/\d/, { timeout: 30_000 });
  await shot(page, 'run-ante');
  await playWhenReady(page);
  await expect(page.locator('.cb-top-title')).toHaveText('Ante 1, Small');
  await expect(page.locator('.cb-key')).toHaveCount(9);
  await expect(page.getByRole('button', { name: 'Hint, 1 left' })).toBeVisible();
  await solve(page);
  const title = page.locator('.cb-run-panel-title');
  await expect(title).toHaveText(/^(Cleared|Missed)$/, { timeout: 30_000 });
  await shot(page, 'run-tally');
  const cleared = (await title.textContent()) === 'Cleared';
  await page.locator('.cb-run-panel').getByRole('button', { name: cleared ? 'Pick a card' : 'Shop' }).click();
  if (cleared) {
    await expect(page.locator('.cb-run-offers .cb-run-card')).toHaveCount(3);
    await page.locator('.cb-run-offers .cb-run-card').first().click();
    await page.getByRole('button', { name: /^Take / }).click();
  }
  // Every board played is followed by the shop.
  await expect(page.locator('.cb-run-title')).toHaveText('Shop');
  await page.getByRole('button', { name: 'Next board' }).click();
  await expect(page.locator('.cb-run-board.is-now .cb-run-board-kind')).toHaveText('Big');
});

test('a Small board can be skipped for a pick of two cards and no shop, and the menu returns to the Run home', async ({ page }) => {
  await openFresh(page);
  await openScreen(page, 'Run');
  await page.getByRole('button', { name: 'Start Run' }).click();
  await page.getByRole('button', { name: 'Skip for a card' }).click();
  await expect(page.locator('.cb-run-offers .cb-run-card')).toHaveCount(2);
  await page.locator('.cb-run-offers .cb-run-card').last().click();
  await page.getByRole('button', { name: /^Take / }).click();
  await expect(page.locator('.cb-run-board.is-now .cb-run-board-kind')).toHaveText('Big');
  await openScreen(page, 'Run');
  await expect(page.getByRole('button', { name: 'Resume run' })).toBeVisible();
  await page.getByRole('button', { name: 'Resume run' }).click();
  await expect(page.locator('.cb-run-board.is-now .cb-run-board-kind')).toHaveText('Big');
});

test('a board left mid-way resumes where it was', async ({ page }) => {
  await openFresh(page);
  await openScreen(page, 'Run');
  await page.getByRole('button', { name: 'Start Run' }).click();
  await playWhenReady(page);
  const placed = await page.evaluate(() => {
    const { actions, getGame } = (window as unknown as { __cellbound: Hook }).__cellbound;
    const g = getGame()!;
    const i = g.puzzle.givens.findIndex((d) => !d);
    actions.select(i);
    actions.input(g.puzzle.solution[i]);
    return i;
  });
  await page.getByRole('button', { name: 'Leave this board' }).click();
  await expect(page.getByRole('button', { name: 'Resume run' })).toBeVisible();
  await page.reload();
  await openScreen(page, 'Run');
  await page.getByRole('button', { name: 'Resume run' }).click();
  await expect(page.locator('.cb-board')).toBeVisible();
  const kept = await page.evaluate((i) => {
    const g = (window as unknown as { __cellbound: Hook }).__cellbound.getGame()!;
    return g.values[i] === g.puzzle.solution[i];
  }, placed);
  expect(kept).toBe(true);
});

test('the shop buys and sells lenses, rerolls, and leads to the next board', async ({ page }, info) => {
  // A short phone, where the shop is taller than the screen.
  if (info.project.metadata.form === 'phone') await page.setViewportSize({ width: 390, height: 640 });
  const shop = { ante: 1, rerolls: 0, lenses: ['loupe', 'spyglass'], items: ['spectra1', 'inkHint'] };
  await openRunWith(page, { v: 2, current: savedRun({ phase: 'shop', slot: 2, coins: 20, shop, perks: { secondWind: 1, sharpEye: 1 } }), last: null, stats: {} });
  await page.getByRole('button', { name: 'Resume run' }).click();
  await expect(page.locator('.cb-run-title')).toHaveText('Shop');
  await page.getByRole('button', { name: 'Buy Loupe for 4 coins' }).click();
  await expect(page.locator('.cb-run-loadout .cb-run-lens')).toHaveCount(1);
  await expect(page.locator('.cb-run-bigcoins')).toContainText('16');
  await page.getByRole('button', { name: 'Buy Singles Spectrum for 3 coins' }).click();
  await page.locator('.cb-run-loadout .cb-run-lens').first().click();
  await expect(page.locator('.cb-run-detail')).toContainText('Loupe');
  // The shop can be taller than the screen: the words and the Sell button come into view.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const r = document.querySelector('.cb-run-detail')!.getBoundingClientRect();
        return r.top >= 0 && r.bottom <= window.innerHeight + 1;
      }),
    )
    .toBe(true);
  await shot(page, 'run-shop');
  await page.getByRole('button', { name: 'Sell for 2 coins' }).click();
  await expect(page.locator('.cb-run-loadout .cb-run-lens')).toHaveCount(0);
  await page.getByRole('button', { name: 'Reroll for 2 coins' }).click();
  await expect(page.locator('.cb-run-bigcoins')).toContainText('13');
  await page.getByRole('button', { name: 'Next board' }).click();
  await expect(page.locator('.cb-run-title')).toHaveText('Ante 2');
  // The Spectra bought in the shop is used from the ante screen.
  await page.locator('.cb-run-loadout .cb-run-item').first().click();
  await page.getByRole('button', { name: 'Use', exact: true }).click();
  await expect(page.locator('.cb-run-loadout .cb-run-item')).toHaveCount(0);
});

test('a strong build clears the last boss, and the summary shows the win', async ({ page }) => {
  test.setTimeout(120_000);
  const strong = savedRun({ slot: 8, score: 30000, perks: { prismShard: 5, glassHeart: 2 }, results: [] });
  await openRunWith(page, { v: 2, current: strong, last: null, stats: {} });
  await page.getByRole('button', { name: 'Resume run' }).click();
  await expect(page.locator('.cb-run-board.is-now .cb-run-board-kind')).toHaveText('Boss');
  await expect(page.locator('.cb-run-board.is-now')).toContainText('Clock');
  await playWhenReady(page);
  await expect(page.locator('.cb-run-bosschip')).toHaveText(/Clock/);
  await solve(page);
  await expect(page.locator('.cb-run-panel-title')).toHaveText('Cleared', { timeout: 60_000 });
  await page.locator('.cb-run-panel').getByRole('button', { name: 'See summary' }).click();
  await expect(page.locator('.cb-run-title')).toHaveText('Run won');
  await shot(page, 'run-summary');
  await page.getByRole('button', { name: 'Run home' }).click();
  await expect(page.locator('.cb-run-stats')).toContainText('1 won');
  await expect(page.getByRole('button', { name: /^Last run/ })).toBeVisible();
});

test('the board, its band and its lenses fit the screen without scrolling', async ({ page }, info) => {
  test.skip(info.project.metadata.form === 'tablet');
  if (info.project.metadata.form === 'laptop') await page.setViewportSize({ width: 1366, height: 660 });
  const loaded = savedRun({ lenses: [{ id: 'loupe' }, { id: 'monocle' }, { id: 'riptide' }, { id: 'redShift' }, { id: 'mirror' }], items: ['spectra1', 'inkHint'] });
  await openRunWith(page, { v: 2, current: loaded, last: null, stats: {} });
  await page.getByRole('button', { name: 'Resume run' }).click();
  await playWhenReady(page);
  await expect(page.locator('.cb-run-tiles.is-board .cb-run-lens')).toHaveCount(5);
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  const key = (await page.locator('.cb-key').first().boundingBox())!;
  expect(key.height).toBeGreaterThanOrEqual(44);
  const lens = (await page.locator('.cb-run-tiles.is-board .cb-run-lens').first().boundingBox())!;
  expect(lens.width).toBeGreaterThanOrEqual(44);
  await shot(page, 'run-board');
});

test('a phone held sideways draws the Run band at 60 percent beside the board, as the plain band is', async ({ page }, info) => {
  test.skip(info.project.metadata.form !== 'phone');
  await page.setViewportSize({ width: 844, height: 390 });
  await openRunWith(page, { v: 2, current: savedRun(), last: null, stats: {} });
  await page.getByRole('button', { name: 'Resume run' }).click();
  await playWhenReady(page);
  await page.evaluate(() => document.fonts.ready);
  // The band is 104 px high at full size and about 62 px at 60 percent.
  const band = (await page.locator('.cb-band-wrap').boundingBox())!;
  expect(band.height).toBeLessThanOrEqual(70);
  const board = (await page.locator('.cb-board').boundingBox())!;
  const pad = (await page.locator('.cb-pad').boundingBox())!;
  expect(pad.x).toBeGreaterThan(board.x + board.width);
  expect(pad.y + pad.height).toBeLessThanOrEqual(390);
});

test('placements made close together get popups that never print over each other, and the board needs no clock', async ({ page }) => {
  await openRunWith(page, { v: 2, current: savedRun(), last: null, stats: {} });
  await page.getByRole('button', { name: 'Resume run' }).click();
  await playWhenReady(page);
  // No time limit, and a Run's score ignores time: no clock in the bar.
  await expect(page.locator('.cb-timer')).toHaveCount(0);
  // Six digits that logic proves, a few milliseconds apart, as a quick player would make them.
  await page.evaluate(async () => {
    const { actions, getGame, candidates } = (window as unknown as { __cellbound: Hook }).__cellbound;
    for (let k = 0; k < 6; k++) {
      const g = getGame()!;
      const grid = g.puzzle.givens.map((d, i) => d || (g.values[i] === g.puzzle.solution[i] ? g.values[i] : 0));
      const cands = candidates(g.puzzle, grid);
      const pick = grid.findIndex((_, i) => !grid[i] && cands[i] && (cands[i] & (cands[i] - 1)) === 0);
      if (pick < 0) return;
      actions.select(pick);
      actions.input(g.puzzle.solution[pick]);
      await new Promise((r) => setTimeout(r, 25));
    }
  });
  await expect.poll(() => page.locator('.cb-run-pop').count(), { timeout: 15_000 }).toBeGreaterThanOrEqual(3);
  const boxes = await page.evaluate(() => {
    const board = document.querySelector('.cb-board-wrap')!.getBoundingClientRect();
    const rect = (e: Element) => {
      const r = e.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    };
    return { board: { x: board.left, y: board.top, w: board.width, h: board.height }, pops: [...document.querySelectorAll('.cb-run-pop')].map(rect) };
  });
  const over = (a: { x: number; y: number; w: number; h: number }, b: typeof a) => a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1;
  boxes.pops.forEach((a, i) => {
    // On the board, and clear of every other popup showing.
    expect(a.x).toBeGreaterThanOrEqual(boxes.board.x - 1);
    expect(a.y).toBeGreaterThanOrEqual(boxes.board.y - 1);
    expect(a.x + a.w).toBeLessThanOrEqual(boxes.board.x + boxes.board.w + 1);
    expect(a.y + a.h).toBeLessThanOrEqual(boxes.board.y + boxes.board.h + 1);
    boxes.pops.slice(i + 1).forEach((b) => expect(over(a, b), JSON.stringify([a, b, boxes.board])).toBe(false));
  });
  await shot(page, 'run-popups');
});

test('the cards a run holds show by name, with their counts, and say what they do when picked', async ({ page }) => {
  const held = savedRun({ perks: { prismShard: 2, peek: 1, lifeLink: 1 } });
  await openRunWith(page, { v: 2, current: held, last: null, stats: {} });
  await page.getByRole('button', { name: 'Resume run' }).click();
  const pills = page.locator('.cb-run-perk');
  await expect(pills).toHaveCount(3);
  await expect(pills.nth(2)).toHaveText('Prism Shard×2');
  expect((await pills.first().boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await pills.nth(2).click();
  await expect(page.locator('.cb-run-detail')).toContainText('on all scoring');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  await shot(page, 'run-cards');
});

test('a run of the first Run is not resumed, its save is left alone, and its runs still count', async ({ page }) => {
  const v1 = JSON.stringify({ v: 1, current: { v: 1, seed: 'run:2026-10-20', index: 2, phase: 'board' }, last: null, stats: { started: 4, finished: 1 } });
  await openRunWith(page, null, v1);
  await expect(page.getByRole('button', { name: 'Resume run' })).toHaveCount(0);
  await expect(page.locator('.cb-run-stats')).toContainText('Runs4');
  await page.getByRole('button', { name: 'Start Run' }).click();
  await expect(page.locator('.cb-run-title')).toHaveText('Ante 1 Easy');
  expect(await page.evaluate(() => localStorage.getItem('cellbound:run:v1'))).toBe(v1);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('cellbound:run:v2') ?? '{}').current?.v)).toBe(2);
});

test('the Collection lists the lenses with how to open them, and the codex', async ({ page }) => {
  await openFresh(page);
  await openScreen(page, 'Run');
  await page.getByRole('button', { name: 'Collection' }).click();
  await expect(page.locator('.cb-run-grid > li')).toHaveCount(20);
  await expect(page.locator('.cb-run-grid > li.is-locked')).toHaveCount(8);
  await page.getByRole('tab', { name: 'Codex' }).click();
  await expect(page.locator('.cb-run-codex')).toContainText('X-Wing');
  await shot(page, 'run-codex');
});
