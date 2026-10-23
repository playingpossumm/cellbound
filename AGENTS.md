# AGENTS.md

Notes for coding agents working on Cellbound, a local-first variant sudoku web app.

## Commands

- `npm install`, then `npm run dev` for the dev server.
- `npm test` runs the unit tests (Vitest), `npm run typecheck` checks the types, and `npm run build` type-checks and builds `dist/` with the service worker.
- `npm run e2e` runs the Playwright suite: Edge by default (`PW_CHANNEL=chromium` switches to Chromium), plus WebKit, Firefox and an offline production project.
- `npm run gen:daily -- <from> <to>` regenerates the stored Dailies for a range of months (`YYYY-MM`). `npm run gen:practice` regenerates the Learn practice puzzles.

Run the unit tests, typecheck, build and e2e before calling a change done.

## Where things live

| Folder | What it holds |
| --- | --- |
| `src/engine` | Pure TypeScript, no React: solver, generator, grading, hints, Dailies and fog. Heavy work goes through the worker in `client.ts`. |
| `src/game` | The zustand stores for the game, settings and stats. |
| `src/app` | The shell, the play screen (`GameView`) and the other screens. The app name lives only in `src/app/brand.ts`. |
| `src/board` | The board and its layers. Themes style its class names. |
| `src/themes` | The six looks. Each is a `ThemeDef` (`src/themes/types.ts`) plus a stylesheet scoped by `data-theme` and `data-night` on `<html>`. |
| `src/modes` | Run and Learn. |
| `src/data` | Stored Daily puzzles, one module per month. |
| `scripts` | Puzzle generation for Dailies and lessons. |
| `e2e` | Browser tests. |

## Rules

- Avoid unnecessary secondary labels and descriptions. Let the layout do the explaining.
- Copy is plain English, with no em dashes anywhere.
- Accessibility: text contrast at least 4.5:1 (3:1 from 24 px), touch targets at least 44 px, visible focus, an accessible name on every icon-only control, and reduced motion honoured from the device and from `data-reduced-motion`.
- Themes style the board through the `--cb-*` custom properties and the board's class names, so a change to the board's markup must keep all six themes working.
- The contract types in `src/engine/types.ts`, `src/game/types.ts`, `src/themes/types.ts` and `src/modes/types.ts` change additively only.
- Never rename the `cellbound:*` localStorage keys; players would lose their saves.
- Dailies are deterministic: a date gives the same puzzle on every device. Change their generation only behind a date cut-over, so past Dailies keep their boards.
- Never commit personal names, email addresses, usernames or absolute paths.
- Group work into a few meaningful commits rather than many tiny ones.
