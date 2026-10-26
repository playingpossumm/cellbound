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
| `src/themes` | Prism, the one look. It is a `ThemeDef` (`src/themes/types.ts`) plus a stylesheet scoped by `data-theme` and `data-night`, listed in the registry in `src/themes/index.ts`. |
| `src/modes` | Run and Learn. |
| `src/data` | Stored Daily puzzles, one module per month. |
| `scripts` | Puzzle generation for Dailies and lessons. |
| `e2e` | Browser tests. |

## Technique ladder

- `classifyPlacement` (`src/engine/techniques.ts`, built in `ladder.ts` and `patterns.ts`) closes the board before a placement at tier 1, then 2 and so on up to 7, and reports the first tier that leaves the cell with only that digit, with the last deduction of that tier as the technique. Tiers 1 to 3 run as a cascade (singles, hidden singles, one clue at a time); tiers 4 to 7 apply one pattern at a time, cheapest first. Tier 8 must prove the cell itself, with nothing cascading after it: one chain (at most 9 links) leaves the cell with only its digit, or one forcing chain does (a cell with two or three candidates, each of which within 5 rounds of propagation breaks a rule or puts the digit there); the limits are `TIER8`. Anything else is a guess, tier 0. `tierProfile` plays the board with the same ladder. The UI calls the async forms, which run on their own worker.
- Run scores and targets follow it: changing a detector, the order they are tried or the `TIER8` limits changes how placements score, so keep `techniques.test.ts` and its fixtures passing (they check that logical play never needs a guess and that proven cells stay proven). It reads boards only and never changes Dailies or generation.

## Rules

- Avoid unnecessary secondary labels and descriptions. Let the layout do the explaining.
- Copy is plain English, with no em dashes anywhere.
- Accessibility: text contrast at least 4.5:1 (3:1 from 24 px), touch targets at least 44 px, visible focus, an accessible name on every icon-only control, and reduced motion honoured from the device and from `data-reduced-motion`.
- Themes style the board through the `--cb-*` custom properties and the board's class names, so a change to the board's markup must keep Prism working in light and in dark.
- The contract types in `src/engine/types.ts`, `src/game/types.ts`, `src/themes/types.ts` and `src/modes/types.ts` change additively only.
- Never rename the `cellbound:*` localStorage keys; players would lose their saves.
- Dailies are deterministic: a date gives the same puzzle on every device. Change their generation only behind a date cut-over, so past Dailies keep their boards.
- Never assume a board's size, least of all a Daily's: read `puzzle.size` in code and `.cb-board[data-size]` in tests. The 9x9 is the main board and must be the best one on a 390x844 phone and a 1366x660 laptop window.
- Never commit personal names, email addresses, usernames or absolute paths.
- Group work into a few meaningful commits rather than many tiny ones.

## The screen says only what the moment needs

- No taglines, helper lines, kicker labels, counts or size labels. A rule's text shows only while its chip is on, and hints and notices show in the same panel, laid over the band (`.cb-msg`); nothing else on the play screen is prose.
- State is shown, not written: a finished digit's key looks spent (`.cb-key.spent`), Notes is a pressed toggle, a new rule's chip has a dot (`.cb-chip.is-new`), the Run track draws the boards, Learn rows tick when done.
- Icon-only buttons carry `aria-label` and a `title` tooltip. A description a sighted player no longer reads (a mode's blurb in the menu) stays for screen readers through `aria-describedby`.
- When a screen would not make sense without a label, change the layout rather than add the label back.

## Look

- Prism is the only look, in a light and a dark version. Settings offers Auto, Light and Dark and has no look picker, because there is nothing to pick. Auto follows the device, and Prism's `defaultNight` decides when the device has no preference.
- The registry (`themes` in `src/themes/index.ts`) and the `ThemeDef` contract stay, so another look would be one more entry, one more `ThemeId` and its own stylesheet, with a picker back in Settings.
- `ThemeDef` holds only what Prism uses, which is its band, its clue layer, its fonts, `defaultNight` and `bandShowsTitle`. A new look that needs another slot adds it.
- Saved settings that name any other look load as Prism, and so does a player who never picked a look. Loading an older save writes the setting back as Prism (`sanitizeSettings`, settings version 3, under the same `cellbound:v1:settings` key).
- A band must look complete with an empty `subtitle`, since only a Daily from an earlier day passes its date. A band that sets the title large declares `bandShowsTitle`, so the top bar keeps its copy for screen readers only.
- Cells, digit slots and fog cells carry `edge-l`, `edge-r`, `edge-t` and `edge-b` on the sides that face another box.
- `src/themes/contrast.test.ts` checks Prism's digit hues per board size for contrast and for a clear difference between any two (0.1 in OKLab), and its notes for contrast on every cell state.

## Layout

- The play screen is one grid (`.cb-play` in `src/styles/base.css`): stacked on a phone, with the band at the top and the board, pad and tools centred in the rest; in two columns from 900 px wide (and on a phone held sideways), with the board the full height on the left. `useBoardSide` in `GameView.tsx` sizes the board; keep its media queries in step with the CSS.
- On a short phone (under 800 px high) the band is drawn at 60 percent and the keys are shorter, so a 9x9 and its pad still fit.
- Every game starts on a 9x9: the app opens on today's 9x9 Daily, Fog and Free play default to 9x9 (6x6 a tap away), and every Run board is a 9x9. Learn keeps its small practice boards. A save resumes only on the same board (`startGame`), so a 6x6 kept under today's Daily key opens as today's 9x9.
- Run boards are crafted like 9x9 Dailies to a time window, `BoardSpec.minutes` in `src/modes/run/boards.ts`, in minutes of the engine's effort estimate (`GenerateOptions.minutes`, `src/engine/craft.ts`): gentle, easy, easy, easy, then a medium final, about 6 to 12 minutes a board and 45 a run (`pace.test.ts`). Par is the middle of the window, the Tight clock a minute more and the base 30 points a minute (`src/modes/run/scale.ts`). Easy road and Hard turn move a board one level and about a fifth in time. A card whose text names a board's number gives `textFor(board)`.
