# AGENTS.md

Notes for coding agents working on Cellbound, a local-first variant sudoku web app.

## Commands

- `npm install`, then `npm run dev` for the dev server.
- `npm test` runs the unit tests (Vitest), `npm run typecheck` checks the types, and `npm run build` type-checks and builds `dist/` with the service worker.
- `npm run e2e` runs the Playwright suite: Edge by default (`PW_CHANNEL=chromium` switches to Chromium), plus WebKit, Firefox and an offline production project. The Edge phone projects emulate a phone (`isMobile`), so scrollbars float as they do on a real phone.
- `npm run gen:daily -- <from> <to>` regenerates the stored Dailies for a range of months (`YYYY-MM`). `npm run gen:practice` regenerates the Learn practice puzzles.
- `npm run calibrate:run [-- <seeds>]` prints Run scores against targets, board by board, for three styles of play. `npm run balance:run [-- <seeds>]` prints what every lens, Spectrum and card adds to a run, and the builds a player might lean on; `balance.test.ts` keeps them within a band.
- In development, `window.__cellbound` offers the game store's `actions` and `getGame` and the engine's `candidates`, so an e2e test can play the cells that logic proves.

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
- `hardestPlacement` is the Run's Microscope: the hardest technique up to tier 7 that also proves the placement, never below `classifyPlacement`. It judges on the board where the simplest proof was found (closed one tier below it); a cell that singles prove is judged on the candidates the placed digits leave, where only a hidden single or a clue can stand in, since patterns wait for the singles as they do on the ladder. A technique counts when one deduction of it leaves the cell with only its digit, or the digit with only that cell in one of its houses (the last open cell of a house stays a full house). The detectors take an optional `Accept` callback for this, and without one they behave as before.
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

## Play

- A placed digit clears itself from the notes of every cell that must hold a different digit (the engine's `peers`: row, column and box or region, plus the diagonals, knight moves, cages, renbans and thermometers a board's rules add), in the same undo step as the placement. A digit the board already shows to be wrong keeps the notes: one that repeats a digit it must differ from, or a wrong one where the game checks the solution (`checksSolution`). Without that check the board cannot tell, so a wrong digit clears notes like a right one; comparing with the solution there would give the answer away.
- The keys live in GameView's key handler. Each tool carries `data-key` and `aria-keyshortcuts`, and its key shows in its corner once a key has done something (`data-keys` on the root), so a touch screen never shows them. Settings lists every key on a device with a keyboard (`KeyList` in `src/app/keys.tsx`), and `GameView.test.tsx` presses each listed key, so keep the handler, the list, the tools and the README in step.

## Motion

- There is one level of motion, the Motion Lab's Lively, with no setting of its own. Reduced motion, from the device or from Settings (`data-reduced-motion` on the root), turns all of it off: the stylesheets through the rule at the end of `base.css`, and script motion through `moves()` in `src/app/motion.ts`, which is also false where the browser has no `element.animate`, as in the unit tests. The e2e suite runs with reduced motion, and `e2e/motion.spec.ts` plays a Daily and a Run board with it on.
- Nothing waits for motion: a digit, a score or a card is in the store before anything moves, and the motion only shows the change. A key typed on the keyboard moves nothing; the pad keys and the tools take `PRESS` from `motion.ts`, which answers pointer presses only.
- The board's motion belongs to Prism (`theme.css`). A placed digit lands on a spring (`--pr-land`, the spring sampled into `linear()`, with a plain ease-out where `linear()` is missing) and a wrong one shakes, moving `translate` while the landing moves `scale`. A pencil mark that goes shrinks away, for which Board keeps a cell's empty grid until the next change of notes. A finished unit lights each cell in its digit's colour (`data-digit` on the cell), 45 ms apart outward from the digit that finished it.
- In a Run, the store keeps a placement's points in `fx.air` while they fly to the score, and the band shows the score less what is in the air; `landPoints` counts them in, and every flight lands within `AIR_MS` whatever happens. Most placements fly from their popup. One of `SHOW_TIER` or harder plays the whole show in the band (`planOf` in `show.ts`, from the steps `scorePlacement` keeps) and flies from there, and a newer placement cuts a show short and lands its points at once. The flying copy is `.cb-fly`, so the popup checks never count it.
- The tally plays row by row (`PanelShow` in `ui/Board.tsx`), and a tap on the panel skips to its end while its button works all along. Reward cards deal, sway, lean and fly up when taken (`Reward.tsx`, which takes the card once the flight lands); the shop's stock deals in when it opens and on a reroll; a bought lens or ink flies into the loadout (`sendToLoadout` and the tiles' arrival in `parts.tsx`). A won run's summary opens on the band's prism, which bursts once when the run was won in view (`won` in the store).

## Sound

- `src/app/sound.ts` makes short notes with Web Audio, the Motion Lab's: each digit plays its own note on a pentatonic scale (1 the lowest), a digit the board marks as wrong buzzes low instead, a finished unit runs up the scale with its wave, and a Run's whole show, its tally, its cards and a won run climb a note at a time. The Sound switch in Settings (`sound`, on by default) silences all of it, and an iPhone's ring switch does too.
- A wrong digit buzzes only where the board already shows it as wrong (`shownWrong`, the same test as GameView's): where the game does not check the solution, a wrong digit that breaks no rule sounds like any other, so the sound never gives the answer away. `sound.test.ts` holds this.
- Browsers start sound suspended, so a touch, a click or a key wakes it; a key or a tool ticks on the pointer press, never on a typed key.

## Look

- Prism is the only look, in a light and a dark version. Settings offers Auto, Light and Dark and has no look picker, because there is nothing to pick. Auto follows the device, and Prism's `defaultNight` decides when the device has no preference.
- The registry (`themes` in `src/themes/index.ts`) and the `ThemeDef` contract stay, so another look would be one more entry, one more `ThemeId` and its own stylesheet, with a picker back in Settings.
- `ThemeDef` holds only what Prism uses, which is its band, its clue layer, its fonts, `defaultNight` and `bandShowsTitle`. A new look that needs another slot adds it.
- Saved settings that name any other look load as Prism, and so does a player who never picked a look. Loading an older save writes the setting back as Prism (`sanitizeSettings`, settings version 3, under the same `cellbound:v1:settings` key).
- A band must look complete with an empty `subtitle`, since only a Daily from an earlier day passes its date. A band that sets the title large declares `bandShowsTitle`, so the top bar keeps its copy for screen readers only.
- Cells, digit slots and fog cells carry `edge-l`, `edge-r`, `edge-t` and `edge-b` on the sides that face another box.
- Digits share one ink, so colour on the board means the picked digit. Selecting a cell with a digit sets `data-same` on `.cb-board` and `is-same` on every cell, digit slot and pencil mark holding that digit, the selected cell included and a wrong digit left out. Prism turns those cells and pencil marks into solid tiles of the digit's hue with the digit in `--pr-lit-ink`, and frames the selected one in the ink. A faint tint was tried first and read as no change at all on a phone.
- `src/themes/contrast.test.ts` checks Prism's ink on every cell state, its digit hues per board size on glass and for a clear difference between any two (0.1 in OKLab), the lit ink on every hue and how far a lit tile stands from plain glass, and its notes for contrast.

## Layout

- The play screen is one grid (`.cb-play` in `src/styles/base.css`): stacked on a phone, with the band at the top and the board, pad and tools centred in the rest; in two columns from 900 px wide (and on a phone held sideways), with the board the full height on the left. `useBoardSide` in `GameView.tsx` sizes the board; keep its media queries in step with the CSS.
- On a short phone (under 800 px high) the band is drawn at 60 percent and the keys are shorter, so a 9x9 and its pad still fit. A Run's band follows: smaller type on a short phone, 60 percent on a phone held sideways, and a larger band on a laptop at 560 px high or more.
- A Run board on a short phone has the most to fit, and an iPhone 13 mini in Safari (375 by 629) is the screen to check (`notes/measure-mini.cjs`, local). The rule chips share the line of lenses when they fit (`chipsBeside`), that line takes the screen's width rather than the board's (a board shrinking to fit would otherwise push the chips onto a line of their own and shrink again), the tiles are 37 px, and a 9x9 may come down to 30 px cells (`MIN_CELL_SHORT` in GameView) before the page scrolls. The tools stay on the screen.
- Every game starts on a 9x9: the app opens on today's 9x9 Daily, Fog and Free play default to 9x9 (6x6 a tap away), and every Run board is a 9x9. Learn keeps its small practice boards. A save resumes only on the same board (`startGame`), so a 6x6 kept under today's Daily key opens as today's 9x9.

## Run

- A run is nine 9x9 boards, three antes of a Small, a Big and a Boss (`SLOT_SPECS` in `src/modes/run/boards.ts`), each crafted like a Daily to a window of the engine's effort estimate (`GenerateOptions.minutes`): gentle, gentle, easy; easy, easy, medium; medium, medium, hard. That is about 6 to 15 minutes a board (`pace.test.ts`).
- Every number that tunes a run lives in `src/modes/run/tuning.ts`: marks per tier, Spectra, flow, clean units, targets, hearts, coins, offers, the shop, bosses, cards and lenses. A full house earns half a single's marks and finishing a unit adds 0.5 mult (`FULL_HOUSE_MARKS`, `FINISH_MULT`), so the technique a digit needs, not the last cell of a unit, carries the score. A target is the typical marks of the engine's `tierProfile` (from `tierProfileAsync`, off the main thread; placements above tier 5 count at tier 5) times the board's kind and ante. `src/modes/run/calibrate.ts` plays a board three ways through the real scoring; `npm run calibrate:run` prints the table and `calibrate.test.ts` holds the shape (a typical player clears the first board unaided and needs a build by the last boss). Recalibrate there whenever the technique detector changes, and read `npm run balance:run` after any change to a lens, a Spectrum or a card: most placements are tier 1 or 2, so whatever reads those (a flow that stays full, singles, the digit 1) is worth far more than a lens on a rarer technique, and its value there sets the pace of the whole shop.
- Scoring is pure (`scoring.ts`, `live.ts`). The game store reports each placement through `onPlacement` before it saves the move, with the units and clues it finished, and Run boards keep each cell's history (`noted`, `missed`, `helped`) for clean units. The Run store classifies a correct digit with `classifyPlacementAsync` a macrotask after the tap, on the board before it with wrong digits taken out, and applies placements in order, so scoring never delays input. Build against the exports of `src/engine/techniques.ts`, never its internals.
- The Run owns its hearts, shields and hint charges: a Run board passes `mods.hints` and `mods.quickHints` rather than `mods.hearts`, and ends a board with `actions.failGame()`. A hint asked for while a wrong digit is on a board with a set number of hints points at the digit and costs nothing. GameView takes a mode's `band`, `chipsLead`, `chipsBeside`, `boardOverlay`, `note` and `quietClock` (a Run board with no time limit shows no clock, since time never scores); without them every other mode looks and plays as before.
- Every board played leads to the shop, after the reward pick when it was cleared (`leaveTally`, `afterPick`, `openShop`), as in Balatro; a skipped board's pick skips its coins and its shop. Shop stock is seeded by the board (`stockFor`), so each shop of an ante draws its own.
- Content is data plus pure functions: lenses (`lenses.ts`), reward cards (`rewards.ts`), Spectra and inks (`items.ts`) and boss rules (`bosses.ts`). A card that bends a rule is a perk the scoring reads: Hot Streak (the flow builds twice as fast and its cap rises by `FLOW.hotRise`, on top of any lens), Microscope (a bargain that costs a heart slot; the store asks the engine for `hardestPlacementAsync` instead of `classifyPlacementAsync`, and the calibration keeps each move's hardest technique as `Move.hard`), Daredevil (all scoring times `REWARD.daredevil`, and a mistake's hearts times `REWARD.daredevilHurt`, Glass included) and Insurance (a mistake costs `REWARD.insurance` coins for each heart while the coins last; a shield still comes first, and a Glass board still breaks). Thief hides givens the simulated typical and expert players still solve by logic (`pickThiefCells`), so a boss rule makes a board harder to read but never forces a guess. Only a cleared board is cashed out: a missed or broken one pays no coins, interest or lens coins. Offers and shop stock are seeded by the run seed and read the run's state, including which tiers it has placed (`placed.ts`: a lens, Spectrum or card that reads a tier the run has never placed weighs a third, because pairs and harder are a handful of placements in a whole run); a daily run offers starter content only, so everyone in the same state sees the same cards.
- Saves live under `cellbound:run:v2` (`storage.ts`). `cellbound:run:v1` is read for its run count and never written, and its run in progress is not resumed.
- Run motion follows the Motion section below: the show grows with the technique, and the loud moments (the tally, the cards, a won run) come once a board or once a run.
- Colours that carry meaning (marks blue, mult red, coins amber, the four reward categories, the eight tiers from plain white to gold) are tokens in `run.css`, checked for contrast by `colors.test.ts`. Rarity shows as glow strength, never as a word.
- A placement's popup takes its place once, when it shows (`popups.ts`, in pixels of the board): the nearest free spot that covers the fewest digits, never another popup showing and never the digit just placed, so quick placements read one by one. A placement that finished a clean unit adds a line with the multiplier it paid, the one place the rule shows during play. The loadout on the ante and shop screens shows the lenses, the items and, as pills with their names, every card the run keeps; a picked tile is remembered by what it is, not by its slot (so it follows a move and drops on a sale or a use), and its words and buttons scroll into view; a bet that rides on a board (Double or Nothing) is a chip on its card and on the board. A shield, Second Wind, Insurance or Daredevil that changes what a mistake costs says so in a popup at the cell, and Thief's hidden givens show as a question mark in their cells until they return.
