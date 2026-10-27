// Calibration: plays a board the way three kinds of player would and scores it through the real
// scoring (live.ts), with no lenses or cards unless a build is given, so the targets can be set
// against what play earns and the lenses against each other.
// scripts/calibrate-run.ts prints the table of targets; scripts/balance-run.ts prints what each
// lens, Spectrum and card adds. calibrate.test.ts keeps a small sample honest.
//   typical: takes the easiest deduction it finds (a single), writes notes, so no unit is clean.
//   clean:   plays like typical but writes no notes, so every unit it finishes is clean.
//   expert:  takes the hardest deduction on the board while it is still hard, and writes no notes.
import { makeRng } from '../../engine';
import { classifyPlacement, type PlacementClass } from '../../engine/techniques';
import type { Puzzle } from '../../engine/types';
import { completedClues, completedUnits, fullGrid } from '../../game/logic';
import { applyPlaced, newLive, type Placed } from './live';
import type { LensId, LensSlot, RunState } from './model';
import { newRun } from './state';

export type Style = 'typical' | 'clean' | 'expert';

export interface Played {
  score: number;
  /** Placements per tier, 0 to 8. */
  tiers: number[];
}

/** What a run brings to a board: the lenses, Spectra levels, cards and hearts it holds. */
export interface Build {
  lenses?: LensSlot[];
  /** Spectra level per tier, 0 to 8. */
  levels?: number[];
  perks?: RunState['perks'];
  hearts?: number;
}

/** One placement as a player made it: what the Run hears, and what the engine found. */
export interface Move {
  placed: Placed;
  cls: PlacementClass;
  /** The hardest technique that proves it, for a build with Microscope, when it was asked for. */
  hard?: PlacementClass;
}

type Classify = (p: Puzzle, values: number[], cell: number, digit: number) => PlacementClass;

/**
 * Plays a board to its end as a style of player would, keeping every placement. Classifies once, so
 * builds are cheap to compare; with `hardest`, each placement also keeps its hardest technique.
 */
export function recordAs(p: Puzzle, style: Style, seed: string, classify: Classify = classifyPlacement, hardest?: Classify): { moves: Move[]; tiers: number[] } {
  const n = p.size * p.size;
  const rng = makeRng(`calibrate:${seed}:${style}`);
  const values = new Array<number>(n).fill(0);
  const noted = new Array<boolean>(n).fill(style === 'typical');
  const clear = new Array<boolean>(n).fill(false);
  const tiers = new Array<number>(9).fill(0);
  const moves: Move[] = [];
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
      const better = !cls || (style === 'expert' ? k.tier > cls.tier : k.tier > 0 && (cls.tier === 0 || k.tier < cls.tier));
      if (better) {
        cls = k;
        pick = c;
      }
      // The typical and clean players take the first single they see.
      if (style !== 'expert' && k.tier >= 1 && k.tier <= 2) break;
    }
    const hard = hardest?.(p, grid, pick, p.solution[pick]);
    values[pick] = p.solution[pick];
    const after = fullGrid(p, values);
    tiers[cls!.tier]++;
    moves.push({
      cls: cls!,
      ...(hard ? { hard } : {}),
      placed: {
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
    });
  }
  return { moves, tiers };
}

/** What a run holding `build` scores for these placements, through the real scoring. */
export function scoreMoves(moves: readonly Move[], build: Build = {}): number {
  let run = newRun('calibrate:build', null, 0);
  run = { ...run, lenses: build.lenses ?? [], levels: build.levels ?? run.levels, perks: build.perks ?? {}, hearts: build.hearts ?? run.hearts };
  run = { ...run, phase: 'board', live: newLive(run, { key: 'c', slot: 0, target: 1, rule: null, stolen: [], fog: false, mods: {} }) };
  const hardest = !!build.perks?.microscope;
  for (const m of moves) run = applyPlaced(run, m.placed, (hardest && m.hard) || m.cls).run;
  return run.live!.score;
}

export function playAs(p: Puzzle, style: Style, seed: string, classify: Classify = classifyPlacement, build: Build = {}): Played {
  const { moves, tiers } = recordAs(p, style, seed, classify);
  return { score: scoreMoves(moves, build), tiers };
}

const slots = (...ids: LensId[]): LensSlot[] => ids.map((id) => ({ id }));
/** Levels of one tier's Spectrum, none anywhere else. */
export const levelsOf = (tier: number, level: number): number[] => Array.from({ length: 9 }, (_, t) => (t === tier ? level : 0));

/**
 * What a player might lean on, to compare the families of buy with each other: the flow and the
 * common placements, the clues, the digits, a plain pile of Prism Shards, a bit of everything.
 * `only` names the one style a build is meant for (clean units only pay a player who writes no notes).
 */
export const REFERENCE_BUILDS: { name: string; build: Build; only?: Style }[] = [
  { name: 'Prism Shards x3', build: { perks: { prismShard: 3 } } },
  { name: 'Singles: Loupe, Riptide, Undertow, Blue Shift, Singles Spectrum x3', build: { lenses: slots('loupe', 'riptide', 'undertow', 'blueShift'), levels: levelsOf(1, 3) } },
  { name: 'Singles, light: Loupe, Riptide, Singles Spectrum x2', build: { lenses: slots('loupe', 'riptide'), levels: levelsOf(1, 2) } },
  { name: 'Clues: Monocle, Cage, Thermo, Arrow, Dot, Clues Spectrum x3', build: { lenses: slots('monocle', 'cage', 'thermo', 'arrow', 'dot'), levels: levelsOf(3, 3) } },
  { name: 'Digits: Red Shift, Blue Shift, Hidden singles Spectrum x3', build: { lenses: slots('redShift', 'blueShift'), levels: levelsOf(2, 3) } },
  { name: 'Mixed: Loupe, Monocle, Red Shift, Singles Spectrum, Prism Shard', build: { lenses: slots('loupe', 'monocle', 'redShift'), levels: levelsOf(1, 1), perks: { prismShard: 1 } } },
  { name: 'Clean: Clear Glass, Clean Sweep', build: { lenses: slots('clearGlass'), perks: { cleanSweep: 1 } }, only: 'clean' },
  { name: 'Risk: Glass Cannon, Clutch, one heart', build: { lenses: slots('glassCannon', 'clutch'), hearts: 1 } },
  { name: 'Techniques: Microscope, Fishbowl, Monocle, Spyglass, Fisheye', build: { lenses: slots('monocle', 'spyglass', 'fisheye'), perks: { microscope: 1, fishbowl: 1 } } },
];
