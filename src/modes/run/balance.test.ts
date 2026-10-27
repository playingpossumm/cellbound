// The buys against each other. No lens or Spectrum level may be worth a run on its own, and the
// families a player can lean on (the common placements, the clues, the digits) stay within a band
// of each other, so a build is a choice and not a rule. A small sample of real boards played by a
// typical player (notes in every cell), scored through the real scoring with each build held; npm
// run balance:run prints the whole table. Retune LENS, SPECTRA_CHIPS and REWARD in tuning.ts when
// this fails.
import { beforeAll, describe, expect, it } from 'vitest';
import { generate } from '../../engine';
import { classifyPlacement, hardestPlacement } from '../../engine/techniques';
import { optionsFor, slotOf } from './boards';
import { levelsOf, recordAs, REFERENCE_BUILDS, scoreMoves, type Build, type Move } from './calibrate';
import { ITEMS } from './items';
import { LENSES } from './lenses';
import { REWARD } from './tuning';

const SEEDS = ['free:bal-a', 'free:bal-b'];
const SLOTS = [slotOf(1, 'small'), slotOf(2, 'big'), slotOf(3, 'boss')];

const sample: { moves: Move[]; base: number }[] = [];

/** What a build multiplies the score of these boards by, on average. */
function times(build: Build): number {
  return sample.reduce((s, b) => s + scoreMoves(b.moves, build) / b.base, 0) / sample.length;
}

describe('the buys against each other (npm run balance:run)', () => {
  beforeAll(() => {
    for (const seed of SEEDS) {
      for (const slot of SLOTS) {
        const { moves } = recordAs(generate(optionsFor(seed, slot)), 'typical', seed, classifyPlacement, hardestPlacement);
        sample.push({ moves, base: scoreMoves(moves) });
      }
    }
  }, 120_000);

  it('makes no lens or level of a Spectrum worth more than half a run by itself', () => {
    const worth: [string, number][] = [];
    for (const l of LENSES) {
      // Mirror copies a neighbour, and the risk lenses pay for their power with hearts.
      if (l.id === 'mirror' || l.id === 'clutch' || l.id === 'glassCannon') continue;
      worth.push([l.name, times({ lenses: [{ id: l.id }] })]);
    }
    for (const it of ITEMS) if (it.kind === 'spectra') worth.push([it.name, times({ levels: levelsOf(it.tier!, 1) })]);
    const over = worth.filter(([, x]) => x > 1.5).map(([name, x]) => `${name} x${x.toFixed(2)}`);
    expect(over).toEqual([]);
  });

  it('keeps the cards that bend a rule in their bands: Hot Streak worth a lens, Daredevil double, Microscope a rare that doubles a board', () => {
    const hot = times({ perks: { hotStreak: 1 } });
    expect(hot).toBeGreaterThan(1.15);
    expect(hot).toBeLessThan(1.4);
    expect(times({ perks: { daredevil: 1 } })).toBeCloseTo(REWARD.daredevil, 1);
    const micro = times({ perks: { microscope: 1 } });
    expect(micro).toBeGreaterThan(1.5);
    expect(micro).toBeLessThan(3);
  });

  it('keeps the families of build within a band: the common placements no longer outrun the clues and the digits', () => {
    const named = (start: string) => times(REFERENCE_BUILDS.find((b) => b.name.startsWith(start))!.build);
    const singles = named('Singles:');
    const clues = named('Clues:');
    const digits = named('Digits:');
    expect(singles).toBeLessThan(3.6);
    expect(clues).toBeGreaterThan(1.4);
    expect(digits).toBeGreaterThan(1.4);
    expect(singles / Math.min(clues, digits)).toBeLessThan(2.4);
  });
});
