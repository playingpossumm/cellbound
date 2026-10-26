// Calibration: plays a board the way three kinds of player would and scores it through the real
// scoring (live.ts), with no lenses or cards, so the targets can be set against what play earns.
// scripts/calibrate-run.ts prints the table; calibrate.test.ts keeps a small sample honest.
//   typical: takes the easiest deduction it finds (a single), writes notes, so no unit is clean.
//   clean:   plays like typical but writes no notes, so every unit it finishes is clean.
//   expert:  takes the hardest deduction on the board while it is still hard, and writes no notes.
import { makeRng } from '../../engine';
import { classifyPlacement, type PlacementClass } from '../../engine/techniques';
import type { Puzzle } from '../../engine/types';
import { completedClues, completedUnits, fullGrid } from '../../game/logic';
import { applyPlaced, newLive } from './live';
import { newRun } from './state';

export type Style = 'typical' | 'clean' | 'expert';

export interface Played {
  score: number;
  /** Placements per tier, 0 to 8. */
  tiers: number[];
}

type Classify = (p: Puzzle, values: number[], cell: number, digit: number) => PlacementClass;

export function playAs(p: Puzzle, style: Style, seed: string, classify: Classify = classifyPlacement): Played {
  const n = p.size * p.size;
  const rng = makeRng(`calibrate:${seed}:${style}`);
  const values = new Array<number>(n).fill(0);
  let run = newRun(`calibrate:${seed}`, null, 0);
  run = { ...run, phase: 'board', live: newLive(run, { key: 'c', slot: 0, target: 1, rule: null, stolen: [], fog: false, mods: {} }) };
  const noted = new Array<boolean>(n).fill(style === 'typical');
  const clear = new Array<boolean>(n).fill(false);
  const tiers = new Array<number>(9).fill(0);
  for (;;) {
    const grid = fullGrid(p, values);
    const open = grid.map((d, i) => (d ? -1 : i)).filter((i) => i >= 0);
    if (!open.length) break;
    for (let i = open.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [open[i], open[j]] = [open[j], open[i]];
    }
    let pick = open[0];
    let cls: PlacementClass | null = null;
    for (const c of open) {
      const k = classify(p, grid, c, p.solution[c]);
      const better =
        !cls ||
        (style === 'expert' ? k.tier > cls.tier : (k.tier > 0 && (cls.tier === 0 || k.tier < cls.tier)));
      if (better) {
        cls = k;
        pick = c;
      }
      // The typical and clean players take the first single they see.
      if (style !== 'expert' && k.tier >= 1 && k.tier <= 2) break;
    }
    values[pick] = p.solution[pick];
    const after = fullGrid(p, values);
    tiers[cls!.tier]++;
    run = applyPlaced(
      run,
      {
        key: 'c',
        cell: pick,
        digit: p.solution[pick],
        correct: true,
        source: 'player',
        assisted: false,
        units: completedUnits(p, after, pick),
        clues: completedClues(p, after, pick),
        puzzle: p,
        noted,
        missed: clear,
        helped: clear,
      },
      cls,
    ).run;
  }
  return { score: run.live!.score, tiers };
}
