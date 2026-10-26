// What a run has placed so far, by tier, so that what it is offered can lean on it. A lens or a card
// that reads pairs is worth little to a run that has never placed one, and an offer or a shop made of
// such buys is a choice between duds: pairs and harder are a handful of placements in a whole run.
import { TECHNIQUES } from '../../engine/techniques';
import type { RunState, TechTally } from './model';
import { OFFERS } from './tuning';

/** Placements per tier (0 to 8) in the boards played so far and the one in play. */
export function placedTiers(run: Pick<RunState, 'results' | 'live'>): number[] {
  const out = new Array<number>(9).fill(0);
  const add = (tech: TechTally) => {
    for (const [id, t] of Object.entries(tech)) {
      const known = (TECHNIQUES as Record<string, { tier: number } | undefined>)[id];
      if (known && t) out[known.tier] += t.n;
    }
  };
  for (const r of run.results) add(r.tech);
  if (run.live) add(run.live.tech);
  return out;
}

/** How much a buy that reads `tiers` weighs: in full once the run has placed one of them, a share of that before. */
export function relevance(tiers: readonly number[] | undefined, placed: readonly number[]): number {
  return !tiers || tiers.some((t) => placed[t] > 0) ? 1 : OFFERS.unplaced;
}
