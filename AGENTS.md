# AGENTS.md

Notes for coding agents working on Cellbound, a local-first variant sudoku web app.

## Commands

- `npm install`, then `npm run dev` for the dev server.
- `npm test` runs the unit tests (Vitest), `npm run typecheck` checks the types, and `npm run build` type-checks and builds `dist/` with the service worker.
- `npm run e2e` runs the Playwright suite: Edge by default (`PW_CHANNEL=chromium` switches to Chromium), plus WebKit, Firefox and an offline production project. The Edge phone projects emulate a phone (`isMobile`), so scrollbars float as they do on a real phone.
- `npm run gen:daily -- <from> <to>` regenerates the stored Dailies for a range of months (`YYYY-MM`). `npm run gen:practice` regenerates the Learn practice puzzles.

Run the unit tests, typecheck, build and e2e before calling a change done.

## Where things live

| Folder | What it holds |
| --- | --- |
| `src/engine` | Pure TypeScript, no React: solver, generator, grading, hints, Dailies and fog. Heavy work goes through the worker in `client.ts`. |
| `src/game` | The zustand stores for the game, settings and stats. |
| `src/app` | The shell, the play screen (`GameView`) and the other screens. The app name lives only in `src/app/brand.ts`. |
| `src/board` | The board and its layers. Themes style its class names. |
| `src/themes` | The six looks. Each is a `ThemeDef` (`src/themes/types.ts`) plus a stylesheet scoped by `data-theme` and `data-night`. |
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
- Never assume a board's size, least of all a Daily's: read `puzzle.size` in code and `.cb-board[data-size]` in tests. The 9x9 is the main board and must be the best one on a 390x844 phone and a 1366x660 laptop window.
- Never commit personal names, email addresses, usernames or absolute paths.
- Group work into a few meaningful commits rather than many tiny ones.

## The screen says only what the moment needs

- No taglines, helper lines, kicker labels, counts or size labels. A rule's text shows only while its chip is on, and hints and notices show in the same panel, laid over the band (`.cb-msg`); nothing else on the play screen is prose.
- State is shown, not written: a finished digit's key looks spent (`.cb-key.spent`), Notes is a pressed toggle, a new rule's chip has a dot (`.cb-chip.is-new`), the Run track draws the boards, Learn rows tick when done.
- Icon-only buttons carry `aria-label` and a `title` tooltip. A description a sighted player no longer reads (a look's or a mode's blurb) stays for screen readers through `aria-describedby`.
- When a screen would not make sense without a label, change the layout rather than add the label back.

## Looks

- Prism is the default for a new player, and the picker lists Prism and Letters in space first (`themes` in `src/themes/index.ts`). A player with saves from before, and no saved settings, keeps `LEGACY_DEFAULT_THEME` (`src/game/settings.ts`).
- A band must look complete with an empty `subtitle`: only a Daily from an earlier day passes its date. A band that sets the title large declares `bandShowsTitle`, so the top bar keeps its copy for screen readers only.
- The picker draws each look with the real `Board` inside a shadow root (`src/app/LookPreview.tsx`). It works for any look whose rules all key on `[data-theme]`; keep them that way.
- Cells, digit slots and fog cells carry `edge-l`, `edge-r`, `edge-t` and `edge-b` on the sides that face another box. A clue layer receives the full grid as `values`, to let its marks recede where digits stand.
- Prism's digit hues per board size are checked by `src/themes/contrast.test.ts` for contrast and for a clear difference between any two (0.1 in OKLab).

## Layout

- The play screen is one grid (`.cb-play` in `src/styles/base.css`): stacked on a phone, with the band at the top and the board, pad and tools centred in the rest; in two columns from 900 px wide (and on a phone held sideways), with the board the full height on the left. `useBoardSide` in `GameView.tsx` sizes the board; keep its media queries in step with the CSS.
- On a short phone (under 800 px high) the band is drawn at 60 percent and the keys are shorter, so a 9x9 and its pad still fit.
- Run boards 1 to 4 are 6x6 and the final board is a 9x9. A board's par, base score and Tight clock scale with its cell count (`src/modes/run/scale.ts`); a card whose text names such a number gives `textFor(size)`.
