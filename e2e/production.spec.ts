import { expect, test } from '@playwright/test';

// The production build: no development hooks, puzzles from the Web Worker, and every
// screen working offline once the service worker has cached the app.

test('the production build carries no development hooks', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.cb-board')).toBeVisible();
  expect(await page.evaluate(() => 'undefined' !== typeof (window as unknown as { __cellbound?: unknown }).__cellbound)).toBe(false);
});

test('works offline after the first visit', async ({ page, context }) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  const workers: string[] = [];
  page.on('worker', (w) => workers.push(w.url()));
  await page.goto('/');
  await expect(page.locator('.cb-board')).toBeVisible();
  // Wait until the service worker has installed, cached the app and taken control.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }));
    }
  });
  const cached = await page.evaluate(async () => {
    let n = 0;
    for (const name of await caches.keys()) n += (await (await caches.open(name)).keys()).length;
    return n;
  });
  expect(cached).toBeGreaterThan(30);

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.cb-board')).toBeVisible();
  await expect(page.locator('.cb-top-title')).toHaveText('Daily');
  // The look is Prism, and its font comes from the cache.
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'prism');
  await page.evaluate(() => document.fonts.ready);
  await expect
    .poll(() => page.evaluate(() => [...document.fonts].some((f) => /Sora/.test(f.family) && f.status === 'loaded')))
    .toBe(true);

  // New boards from the worker: Fog opens on a 9x9, and makes another on request.
  await page.getByRole('button', { name: 'Menu' }).first().click();
  await page.locator('dialog.cb-menu').getByRole('button', { name: /^Fog/ }).click();
  await expect(page.locator('.cb-board[data-size="9"]')).toBeVisible();
  await page.getByRole('button', { name: 'New board' }).click();
  await expect(page.locator('.cb-board[data-size="9"]')).toBeVisible();
  expect(workers.some((u) => /worker/.test(u))).toBe(true);

  // Run and Learn load their code on first use, from the cache.
  await page.getByRole('button', { name: 'Menu' }).first().click();
  await page.locator('dialog.cb-menu').getByRole('button', { name: /^Run/ }).click();
  await page.getByRole('button', { name: 'Start Run' }).click();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.locator('.cb-board[data-size="9"]')).toBeVisible();
  await expect(page.locator('.cb-run-band')).toBeVisible();
  await page.getByRole('button', { name: 'Menu' }).first().click();
  await page.locator('dialog.cb-menu').getByRole('button', { name: /^Learn/ }).click();
  await expect(page.locator('.cb-learn-list')).toBeVisible();

  // A shared link still opens.
  await page.goto('/?daily=2026-10-18');
  await expect(page.locator('.cb-board[data-size="9"]')).toBeVisible();
  await expect(page.locator('.cb-band-wrap')).toContainText('Sunday 18 October');
  expect(errors).toEqual([]);
});
