import { expect, test, type Page } from '@playwright/test';

// Screenshots go to SCREENS_DIR when it is set (outside the repo), else test-results.
const shots = process.env.SCREENS_DIR ?? 'test-results/screens';

export async function shot(page: Page, name: string) {
  const project = test.info().project.name;
  await page.screenshot({ path: `${shots}/app-${project}-${name}.png`, fullPage: true });
}

/**
 * Clears storage before the app's first script runs (once per test), optionally
 * seeding the game store, then opens the app.
 */
export async function openFresh(page: Page, seed?: unknown, path = '/') {
  await page.addInitScript((saved) => {
    if (sessionStorage.getItem('cb-e2e-seeded')) return;
    sessionStorage.setItem('cb-e2e-seeded', '1');
    localStorage.clear();
    if (saved) localStorage.setItem('cellbound:v1', JSON.stringify(saved));
  }, seed ?? null);
  await page.goto(path);
  // Every path the tests open starts on a board. The Loading page also uses .cb-page,
  // so waiting for the board avoids typing before the game is there.
  await expect(page.locator('.cb-board')).toBeVisible();
}

export async function openScreen(page: Page, name: string) {
  await page.getByRole('button', { name: 'Menu' }).first().click();
  const menu = page.locator('dialog.cb-menu');
  await expect(menu).toBeVisible();
  await menu.getByRole('button', { name: new RegExp(`^${name}`) }).click();
  await expect(menu).toBeHidden();
}

/** A 9x9 board that shows one clue of every kind (for drawing checks only). */
export function nineByNine() {
  const solution: number[] = [];
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) solution.push((((r % 3) * 3 + Math.floor(r / 3) + c) % 9) + 1);
  const givens = solution.map((d, i) => (i % 5 === 0 || i % 7 === 3 ? d : 0));
  const puzzle = {
    id: 'e2e-nine',
    seed: 'e2e-nine',
    size: 9,
    boxW: 3,
    boxH: 3,
    givens,
    solution,
    clues: [
      { kind: 'thermo', cells: [72, 63, 54, 55] },
      { kind: 'arrow', circle: 10, path: [11, 12, 21] },
      { kind: 'cage', cells: [6, 7, 15, 16, 25], sum: 23 },
      { kind: 'renban', cells: [30, 31, 32] },
      { kind: 'whisper', cells: [40, 49, 58, 59], minDiff: 5 },
      { kind: 'kropki', a: 1, b: 2, color: 'white' },
      { kind: 'kropki', a: 9, b: 18, color: 'black' },
      { kind: 'xv', a: 43, b: 44, sum: 10 },
      { kind: 'xv', a: 70, b: 71, sum: 5 },
      { kind: 'diagonal' },
      { kind: 'antiKnight' },
    ],
    difficulty: 3,
    score: 0,
    name: 'Test',
  };
  const n = 81;
  const notes = new Array(n).fill(0);
  notes[3] = (1 << 2) | (1 << 5) | (1 << 9);
  notes[13] = (1 << 1) | (1 << 4) | (1 << 7) | (1 << 8);
  const game = {
    key: 'free:e2e-nine',
    mode: 'free',
    puzzle,
    values: new Array(n).fill(0),
    notes,
    selected: null,
    notesMode: false,
    undo: [],
    redo: [],
    mistakes: 0,
    hintsUsed: 0,
    elapsedMs: 83000,
    status: 'playing',
    doneBoxes: [],
    hinted: new Array(n).fill(false),
  };
  return { state: { games: { [game.key]: game }, touched: { [game.key]: 1 }, lastKey: { free: game.key } }, version: 1 };
}
