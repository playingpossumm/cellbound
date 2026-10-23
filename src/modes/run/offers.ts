// Card offers between boards. Pure and seeded: the same run seed and board give the
// same three cards on every device, whatever the player did before.
import { makeRng } from '../../engine';
import { BOARD_COUNT } from './boards';
import type { Card, Rarity } from './cards';

export const OFFER_SIZE = 3;

const WEIGHT: Record<Rarity, number> = { common: 6, uncommon: 3, rare: 1 };

function pickWeighted(rng: () => number, list: Card[]): Card | undefined {
  if (!list.length) return undefined;
  const total = list.reduce((s, c) => s + WEIGHT[c.rarity], 0);
  let r = rng() * total;
  for (const c of list) {
    r -= WEIGHT[c.rarity];
    if (r < 0) return c;
  }
  return list[list.length - 1];
}

/**
 * Three cards for the board about to start (index 1 to 4). The first is always a
 * boon, so a safe pick exists; the second is a curse or a bargain; the third is
 * anything. No two cards share a family. The order on screen is shuffled.
 */
export function offerFor(runSeed: string, nextIndex: number, pool: Card[]): Card[] {
  const rng = makeRng(`${runSeed}:offer:${nextIndex}`);
  const final = nextIndex >= BOARD_COUNT - 1;
  // Sort by id so the result does not depend on the order of the pool.
  const usable = pool.filter((c) => !(final && c.skipOnFinal)).sort((a, b) => (a.id < b.id ? -1 : 1));
  const chosen: Card[] = [];
  const free = () => usable.filter((c) => !chosen.some((x) => x.id === c.id || x.family === c.family));

  const boon = pickWeighted(
    rng,
    free().filter((c) => c.kind === 'boon'),
  );
  if (boon) chosen.push(boon);
  const risk = pickWeighted(
    rng,
    free().filter((c) => c.kind !== 'boon'),
  );
  if (risk) chosen.push(risk);
  while (chosen.length < OFFER_SIZE) {
    const next = pickWeighted(rng, free());
    if (!next) break;
    chosen.push(next);
  }
  // Fisher-Yates with the same stream.
  for (let i = chosen.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [chosen[i], chosen[j]] = [chosen[j], chosen[i]];
  }
  return chosen;
}
