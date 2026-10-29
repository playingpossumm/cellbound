# Cellbound

Cellbound is a variant sudoku game that runs in the browser and installs as an app on phones and laptops. It opens straight into the day's puzzle, and every board is made or stored on your device. Progress stays in the browser's local storage, there is no advertising, and after the first visit the whole app works offline. A leaderboard is there for anyone who wants it. Logging in takes only a username and a 4-digit PIN, with no email or password, and nothing leaves your device until you do.

Play it at [cellbound-sudoku.vercel.app](https://cellbound-sudoku.vercel.app).

![The Daily on a phone in Prism, dark and light](docs/prism.png)

## Modes

The Daily is one 9x9 puzzle a day, the same for everyone. It climbs from a gentle Monday with one rule to a hard Saturday, and Sunday brings a longer board with three rules. Each Daily is named after a constellation, and solving it on its own day keeps your streak going.

Run is a roguelite in which how you solve is the score. A run is three antes of three 9x9 boards, a Small, a Big and a Boss, from gentle boards to a hard final. Every correct digit scores by the technique that proves it at that moment: marks from the technique's tier (half for a full house, the last open cell of a row, column or box), times a mult that grows when the digit finishes a row, column, box or clue, climbs with an unbroken streak, and multiplies when a unit is finished clean, with no notes, hints or mistakes in it. So a hard deduction pays only while it is still hard. Each board shows its target before it starts. Finishing under it costs one of your hearts, and finishing over it pays coins and a pick of three cards, from hearts, hints, multipliers, score and bargains with a cost. Some cards bend a rule: Microscope scores a digit that more than one technique proves as the hardest of them for the price of a heart slot, Daredevil doubles every score but makes mistakes cost twice the hearts, Hot Streak builds the streak multiplier faster and higher, and Insurance pays for a mistake in coins. A Small or Big board can be skipped for a smaller pick, which also skips its coins and its shop. Every boss board has a rule, such as fog, no notes, a clock, hidden givens, glass that breaks on a mistake, or a fish market that pays for X-Wings. The rule shows from the start of its ante, and the cards and shops before the boss lean toward what answers it, such as a Shield before glass, Clear Ink before fog, Pencil Ink before no notes and Time Ink before a clock. After every board you play comes a shop of lenses, which fire on every placement in the order they sit, Spectra, which raise a technique's marks for the run, and one-shot inks. There is a daily run with the same boards for everyone, free runs that are new every time, and lenses and cards to unlock, with a codex of every technique you have placed. A free run can be Easy, Normal or Hard. Easy keeps to gentle boards of one or two rules, gives its bosses longer clocks and starts with five hearts, and its targets are lower and climb more slowly. Hard has harder boards, higher targets and two hearts. A new player starts on Easy, a win on Easy opens Normal and a win on Normal opens Hard. The daily run is open to everyone and always Normal, and winning it counts as a win on Normal.

Free play opens on a 9x9, with 6x6 a tap away, and lets you pick any mix of rules and a difficulty from 1 to 5, with or without fog, then plays an endless stream of boards. Fog hides most of the board, and a correct digit clears the cells around it and shows the givens and clues underneath, while a wrong digit clears nothing. Sharing a result shares a link to that exact board.

Learn has a short lesson for the basics and for each rule, and every lesson ends with a small practice puzzle. Until you have done a rule's lesson, its chip on the board shows a dot, and tapping the chip offers the lesson.

## Rules

Every board keeps the classic rule that each row, column and box holds each digit once, then adds one or more of these.

| Rule | What it asks |
| --- | --- |
| Thermo | Digits rise from the round bulb to the far end of the line. |
| Arrow | Digits along the arrow add up to the digit in its circle. |
| Cage | Digits in the cage add up to its small total and never repeat. |
| Renban | The line holds a run of consecutive digits, in any order. |
| Whisper | Neighbours on the line differ by at least 3 on a 6x6 board and 5 on a 9x9. |
| Dots | A white dot joins digits one apart, a black dot a digit and its double. |
| XV | An X joins digits that sum to 10, a V digits that sum to 5. |
| Diagonal | Each diagonal holds every digit once. |
| Anti-knight | Equal digits are never a knight's move apart. |

## Playing

Tap or click a cell, then a number. On a keyboard, type the digit, move with the arrow keys or WASD, and erase with E, Backspace, Delete or 0. N switches to notes and Shift with a digit writes a single note, Z undoes and Y redoes (Ctrl+Z and Ctrl+Y work too), H asks for a hint, P pauses and Escape clears the selection. Once you use the keyboard, each tool shows its key, and Settings lists them all.

A digit you place clears itself from the notes of every cell that must hold a different digit: its row, column and box, and any cage, thermometer, renban, diagonal or knight's move the rules add. Undo brings the notes back. A digit the board already marks as wrong, because it repeats a digit or fails the check against the solution, leaves the notes alone.

A hint comes in three steps for the same deduction. The first shows where to look, the second names the rule that does the work, and the third places the digit and explains why. Mistake checking can be off, can show only digits that break a rule, or can mark every digit that differs from the solution. Fog boards and Run always check against the solution, because clearing fog and losing hearts depend on it. A Run board allows a set number of hints, shown on the hint key, and a digit a hint gives scores nothing; pointing at a wrong digit costs no hint.

![A Daily on a laptop](docs/laptop.png)

## Leaderboard

Tap Log in at the top of the menu and choose a username and a 4-digit PIN. There is no email, password or sign-up, and a new username is yours straight away. Four boards rank everyone who has logged in: today's Daily by time (a Daily counts on its own day), today's daily run by score, the best run anyone has played on Normal or Hard, and the longest Daily streak. Your own row is lit, and players level on a board share a place.

Your stats go with your username. Log in with the same username and PIN on another phone or laptop, and from then on each device adds its games to the others': the streak, the Stats screen, the daily run you already played and the Run's unlocks all count every device. A board you are halfway through stays on the device you started it on. Log out in Settings to take a device off your username; your scores stay.

## Badges

The Stats screen holds twenty-one badges with three levels each, drawn as cut glass gems whose rim lights a third more of the spectrum at each level. They count the Dailies (a streak, how many, the fastest and the clean ones), the techniques placed in runs, the best run score and the biggest single placement, bosses and boss rules beaten, runs won on each difficulty, Run boards finished clean, Fiendish boards, fog boards, the rules played and the lessons finished. Tap a gem to see what it counts and how far its next level is.

A new level shows on the result card of the game that earned it, or on the Run's summary, and one earned out of sight puts a dot by Stats in the menu until you see it. Badges read the stats the app already keeps, from every device for a player who is logged in, so whatever was played before them counts.

## Look

Cellbound has one look, Prism, in a light and a dark version. Digits sit on glass cells in a single ink, so the board reads at a glance, under a band where a beam of white light splits into one ray per digit. Each digit owns the colour of its ray, which also marks its key on the pad. Select a cell with a digit and every cell holding that digit lights up in its colour, along with the matching pencil marks. On Auto the light or dark version follows your device, and Settings can keep either one.

The board moves a little. A key squashes under your finger and springs back, a placed digit lands on a spring, a wrong one shakes, a pencil mark that a digit clears shrinks away, and a finished row, column or box lights up cell by cell in its digits' colours. A Run moves more: each placement's points fly from the cell to the score, and a pair or a harder technique first builds its marks times mult lens by lens. The board's tally ticks in row by row and stamps Cleared, reward cards deal in and lean toward the pointer, and a won run bursts out of the prism. None of it holds up the next tap.

With reduced motion, from the device or from Settings, all of it stays still.

Every digit also plays its own note, so a solve plays back as a tune, a digit the board marks as wrong buzzes low, and a Run's big moments climb the scale. The Sound switch in Settings turns it off, and on an iPhone the ring switch silences it too. A wrong digit only buzzes when the board already shows it as wrong, so the sound never gives an answer away.

## Run it

You need Node.js 22.12 or newer.

```sh
npm install
npm run dev
```

Then open the address Vite prints. The dev server also runs the leaderboard, on a store in memory that lasts until it stops. `npm run build` makes a production build in `dist/` with a service worker, and `npm run preview` serves it without the leaderboard.

## Scripts

- `npm run dev` starts the dev server.
- `npm run build` type-checks and builds to `dist/`, and bundles the leaderboard's server into `api/` (`npm run build:api` does that part alone).
- `npm run preview` serves the production build.
- `npm test` runs the unit tests once, and `npm run test:watch` keeps them running.
- `npm run typecheck` checks the types.
- `npm run e2e` runs the browser tests in Edge, in WebKit (the engine of Safari) as an iPhone and an iPad, and in Firefox. They start a dev server and a production preview on their own. Run `npx playwright install webkit firefox` once first. Edge is the installed Microsoft Edge unless `PW_CHANNEL=chromium` is set.
- `npm run e2e:edge` runs the Edge projects only, which is the quick check.
- `npm run gen:daily` regenerates the stored Daily puzzles. Pass a range of months to choose them, for example `npm run gen:daily -- 2028-01 2028-12`.
- `npm run gen:practice` regenerates the Learn practice puzzles.
- `npm run calibrate:run` plays sample Run boards three ways and prints their scores against their targets, for tuning `src/modes/run/tuning.ts`. Pass a number of seeds to sample more, for example `npm run calibrate:run -- 12`, and a difficulty after it to see Easy or Hard, as in `npm run calibrate:run -- 6 hard`.
- `npm run balance:run` plays sample Run boards once with notes and once without, and prints what every lens, Spectrum and card adds to the score, and the builds a player might lean on, so the buys can be set against each other in `src/modes/run/tuning.ts`.

## How it is built

The app uses React 19 and TypeScript 7, built with Vite 8. Game state lives in zustand stores saved to local storage, and vite-plugin-pwa provides the service worker and the web manifest. The font comes from a Fontsource package, so nothing is fetched from a font service.

The puzzle engine in `src/engine` is plain TypeScript. It has a solver that proves each puzzle has one solution, a generator that grades difficulty by the techniques a logical solver needs, an estimate of how long a board takes an experienced player, the hint explainer built on that solver, and the fog layouts. Daily and Run boards are cut to that estimate. Boards for Free play and Run are made in a Web Worker, so the screen stays responsive while they are built. Dailies up to the end of 2027 are stored in `src/data/daily` and load a month at a time. Later dates are generated on the device from the same seed, so they still come out the same for everyone.

| Folder | What it holds |
| --- | --- |
| `src/engine` | Solver, generator, hints, Dailies and fog |
| `src/game` | The game store, settings and stats |
| `src/app` | The shell, the play screen and the other screens |
| `src/board` | The board and its layers |
| `src/themes` | The look, Prism |
| `src/modes` | Run and Learn |
| `scripts` | Puzzle generation for Dailies and lessons, and Run calibration |
| `e2e` | Browser tests |

Unit tests use Vitest and browser tests use Playwright. The app's name is set once in `src/app/brand.ts`.

## Licence

MIT. See [LICENSE](LICENSE).
