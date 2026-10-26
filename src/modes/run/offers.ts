// Reward offers after a board. Seeded by the run seed and the board, so a run in the same state
// is offered the same cards on every device. The draw leans on the run's state (heart cards when
// hearts are low, hint cards after hints were used), never shows a card twice, spreads the cards
// over the categories and favours a category the last offer left out, so every one comes round.
import { makeRng } from '../../engine';
import { maxHeartsOf } from './lenses';
import type { Category, Offer, OfferKind, RunState } from './model';
import { placedTiers, relevance } from './placed';
import { canOffer, isBargain, type RewardDef } from './rewards';
import { OFFERS } from './tuning';

export const CATEGORIES: readonly Category[] = ['hearts', 'hints', 'mult', 'score'];

export function offerSize(kind: OfferKind): number {
  return kind === 'boss' ? OFFERS.bossSize : kind === 'tag' ? OFFERS.tagSize : OFFERS.size;
}

/** How much a category weighs for this run right now. */
export function categoryWeight(cat: Category, run: RunState): number {
  let w = 1;
  if (cat === 'hearts') w += OFFERS.perMissingHeart * Math.max(0, maxHeartsOf(run) - run.hearts);
  if (cat === 'hints') w += OFFERS.perHintUsed * Math.min(3, Math.max(0, run.hintsLast));
  if (run.lastCats.length && !run.lastCats.includes(cat)) w *= OFFERS.unseen;
  return w;
}

/** The cards that can be offered: open, usable now, and for a tag only commons. */
export function eligible(run: RunState, kind: OfferKind, pool: readonly RewardDef[]): RewardDef[] {
  return pool
    .filter((c) => canOffer(c, run, kind) && (kind !== 'tag' || c.rarity === 'common'))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function makeOffer(run: RunState, kind: OfferKind, pool: readonly RewardDef[]): Offer {
  const rng = makeRng(`${run.seed}:offer:${kind}:${run.slot}`);
  const cards = eligible(run, kind, pool);
  const chosen: RewardDef[] = [];
  const placed = placedTiers(run);
  const weight = (c: RewardDef) =>
    OFFERS.rarity[c.rarity] *
    categoryWeight(c.category, run) *
    relevance(c.tiers, placed) *
    (isBargain(c) ? OFFERS.bargain : 1) *
    (chosen.some((x) => x.category === c.category) ? OFFERS.repeat : 1);
  const draw = (list: RewardDef[]): RewardDef | undefined => {
    if (!list.length) return undefined;
    const total = list.reduce((s, c) => s + weight(c), 0);
    let r = rng() * total;
    for (const c of list) {
      r -= weight(c);
      if (r < 0) return c;
    }
    return list[list.length - 1];
  };
  // After a boss, one place is a rare.
  if (kind === 'boss') {
    const rare = draw(cards.filter((c) => c.rarity === 'rare'));
    if (rare) chosen.push(rare);
  }
  const size = offerSize(kind);
  while (chosen.length < size) {
    const next = draw(cards.filter((c) => !chosen.includes(c)));
    if (!next) break;
    chosen.push(next);
  }
  // Fisher-Yates with the same stream, so the rare is not always first.
  for (let i = chosen.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [chosen[i], chosen[j]] = [chosen[j], chosen[i]];
  }
  return { kind, slot: run.slot, cards: chosen.map((c) => c.id) };
}
