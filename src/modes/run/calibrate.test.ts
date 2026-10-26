// The curve the targets are tuned to, on real boards scored through the real scoring. A typical
// player (notes, the easiest deduction first, no mistakes) clears ante 1 without help but not
// idly, needs the first shop's buys for the ante 2 boss, and needs a build of lenses and Spectra
// for the last boss, as does a player who writes no notes. When a change to the engine's technique
// detector breaks this, run `npm run calibrate:run` and retune TARGET in tuning.ts.
import { describe, expect, it } from 'vitest';
import { generate } from '../../engine';
import { tierProfile } from '../../engine/techniques';
import { optionsFor, slotOf } from './boards';
import { playAs, type Style } from './calibrate';
import { targetFor } from './targets';

const SEED = 'free:cal-a';

function ratio(slot: number, style: Style): number {
  const p = generate(optionsFor(SEED, slot));
  return playAs(p, style, SEED).score / targetFor(slot, tierProfile(p));
}

describe('the targets against play (recalibrate with npm run calibrate:run)', () => {
  it('make the first board clear for a typical player, but not idle', () => {
    const r = ratio(slotOf(1, 'small'), 'typical');
    expect(r).toBeGreaterThan(1.5);
    expect(r).toBeLessThan(3);
  });

  it('let a typical player clear the first boss unaided', () => {
    expect(ratio(slotOf(1, 'boss'), 'typical')).toBeGreaterThan(1.1);
  });

  it('ask for the first shop by the second boss', () => {
    expect(ratio(slotOf(2, 'boss'), 'typical')).toBeLessThan(1);
  });

  it('ask for a build by the last boss, even from a player who writes no notes', () => {
    expect(ratio(slotOf(3, 'boss'), 'typical')).toBeLessThan(0.75);
    expect(ratio(slotOf(3, 'boss'), 'clean')).toBeLessThan(0.95);
  });

  it('pay clean play more than noted play', () => {
    expect(ratio(slotOf(1, 'small'), 'clean')).toBeGreaterThan(ratio(slotOf(1, 'small'), 'typical'));
  });
});
