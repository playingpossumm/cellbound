import { expect, test, type Page } from '@playwright/test';
import { openFresh, openScreen, shot } from './helpers';

// Motion on, unlike the rest of the suite, which runs with reduced motion: the moves must show the
// game's changes without holding them up. A Daily's digit lands and a wrong one shakes; a Run
// board's points land on the score, its tally plays out and a card taken reaches the shop.
test.use({ reducedMotion: 'no-preference' });

type Hook = {
  actions: { select(i: number | null): void; input(d: number): void };
  getGame(): { status: string; values: number[]; fog?: { cleared: boolean[] }; puzzle: { size: number; givens: number[]; solution: number[] } } | null;
  candidates(p: unknown, grid: number[]): number[];
};

/** Places digits as a player would, a cell that logic proves when there is one, `count` of them or to the end. */
async function play(page: Page, count = 200) {
  await page.evaluate(async (count) => {
    const { actions, getGame, candidates } = (window as unknown as { __cellbound: Hook }).__cellbound;
    for (let k = 0; k < count; k++) {
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
      await new Promise((r) => setTimeout(r, 30));
    }
  }, count);
}

test('a placed digit lands on a spring, and a wrong one shakes', async ({ page }) => {
  await openFresh(page);
  const seen = await page.evaluate(async () => {
    const { actions, getGame } = (window as unknown as { __cellbound: Hook }).__cellbound;
    const frame = () => new Promise((r) => requestAnimationFrame(() => r(null)));
    const names = (sel: string) => [...document.querySelectorAll(sel)].flatMap((e) => e.getAnimations().map((a) => (a as CSSAnimation).animationName));
    const g = getGame()!;
    const n = g.puzzle.size;
    const right = g.puzzle.givens.findIndex((d, i) => !d && !g.values[i]);
    actions.select(right);
    actions.input(g.puzzle.solution[right]);
    await frame();
    await frame();
    const landed = names('.cb-digit.place-a, .cb-digit.place-b');
    // A digit its row already holds: the board marks it at once.
    const grid = g.puzzle.givens.map((d, i) => d || g.values[i]);
    let wrong = -1;
    let digit = 0;
    for (let i = 0; i < n * n && wrong < 0; i++) {
      if (grid[i] || i === right) continue;
      const row = Math.floor(i / n);
      const d = g.puzzle.givens.slice(row * n, row * n + n).find((x) => x && x !== g.puzzle.solution[i]);
      if (d) [wrong, digit] = [i, d];
    }
    actions.select(wrong);
    actions.input(digit);
    await frame();
    await frame();
    return { landed, shook: names('.cb-digit.is-wrong') };
  });
  expect(seen.landed.some((x) => /^pr-land-[ab]$/.test(x))).toBe(true);
  expect(seen.shook.some((x) => /^pr-shake-[ab]$/.test(x))).toBe(true);
});

test('a Run board with motion: the points land on the score, the tally plays out, and a card taken reaches the shop', async ({ page }) => {
  test.slow();
  await openFresh(page);
  await openScreen(page, 'Run');
  await page.getByRole('button', { name: 'Start Run' }).click();
  const go = page.getByRole('button', { name: 'Play', exact: true });
  await expect(go).toBeEnabled({ timeout: 30_000 });
  await go.click();
  await expect(page.locator('.cb-run-band')).toBeVisible();
  await play(page, 4);
  // Once the points have flown, the score on show is the score the run holds.
  const band = page.locator('.cb-run-band-score');
  await expect
    .poll(async () => {
      const label = (await band.getAttribute('aria-label')) ?? '';
      return label.startsWith(`Score ${await band.textContent()} `) && !label.startsWith('Score 0 ');
    }, { timeout: 15_000 })
    .toBe(true);
  await play(page);
  const title = page.locator('.cb-run-panel-title');
  await expect(title).toHaveText(/^(Cleared|Missed)$/, { timeout: 30_000 });
  // The coins come in last.
  await expect(page.locator('.cb-run-panel-foot')).not.toHaveClass(/is-wait/, { timeout: 15_000 });
  await shot(page, 'motion-tally');
  const cleared = (await title.textContent()) === 'Cleared';
  await page.locator('.cb-run-panel').getByRole('button', { name: cleared ? 'Pick a card' : 'Shop' }).click();
  if (cleared) {
    // The cards deal in first: a click while one is still rising lands on whatever is under it.
    await page.locator('.cb-run-offers').evaluate((list) =>
      Promise.all(
        list
          .getAnimations({ subtree: true })
          .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
          .map((a) => a.finished.catch(() => undefined)),
      ),
    );
    // The cards sway while the player decides, so they never hold still for a plain click.
    await page.locator('.cb-run-offers .cb-run-card').first().click({ force: true });
    await page.getByRole('button', { name: /^Take / }).click();
  }
  await expect(page.locator('.cb-run-title')).toHaveText('Shop');
});
