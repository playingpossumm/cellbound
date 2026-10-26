// The shop after each boss: two lenses and two consumables, a reroll that costs a coin more each
// time, and lenses sold back for half their price. Stock is seeded by the run seed, the ante and
// the reroll count, so a daily run's shop holds the same stock for everyone in the same state.
import { makeRng } from '../../engine';
import { anteOf } from './boards';
import { ITEMS, type ItemDef } from './items';
import { lensById, maxHeartsOf, sellPrice, type LensDef } from './lenses';
import type { ItemId, LensId, RunState, ShopState } from './model';
import { OFFERS, SHOP, SLOTS } from './tuning';

/** How often each consumable turns up: low-tier Spectra most, then the inks, then high tiers. */
function itemWeight(def: ItemDef): number {
  if (def.kind === 'ink') return 2;
  const t = def.tier ?? 1;
  return t <= 3 ? 3 : t <= 5 ? 2 : 1;
}

function drawDistinct<T>(rng: () => number, list: readonly T[], weight: (x: T) => number, count: number): T[] {
  const left = list.slice();
  const out: T[] = [];
  while (out.length < count && left.length) {
    const total = left.reduce((s, x) => s + weight(x), 0);
    let r = rng() * total;
    let k = left.length - 1;
    for (let i = 0; i < left.length; i++) {
      r -= weight(left[i]);
      if (r < 0) {
        k = i;
        break;
      }
    }
    out.push(left.splice(k, 1)[0]);
  }
  return out;
}

/** The stock for a shop visit and reroll count. Lenses already held are never on sale. */
export function stockFor(run: RunState, ante: number, rerolls: number, pool: readonly LensDef[]): Pick<ShopState, 'lenses' | 'items'> {
  const rng = makeRng(`${run.seed}:shop:${ante}:${rerolls}`);
  const held = new Set(run.lenses.map((l) => l.id));
  const lenses = pool.filter((l) => !held.has(l.id)).sort((a, b) => (a.id < b.id ? -1 : 1));
  const pickedLenses = drawDistinct(rng, lenses, (l) => OFFERS.rarity[l.rarity], SHOP.lenses).map((l) => l.id);
  const items = drawDistinct(rng, ITEMS, itemWeight, SHOP.items).map((i) => i.id);
  return { lenses: pickedLenses, items };
}

export function openShop(run: RunState, pool: readonly LensDef[]): RunState {
  const ante = anteOf(run.slot);
  return { ...run, phase: 'shop', offer: null, shop: { ante, rerolls: 0, ...stockFor(run, ante, 0, pool) } };
}

export function rerollCost(rerolls: number): number {
  return SHOP.rerollBase + SHOP.rerollStep * rerolls;
}

export function reroll(run: RunState, pool: readonly LensDef[]): RunState {
  const shop = run.shop;
  if (run.phase !== 'shop' || !shop) return run;
  const cost = rerollCost(shop.rerolls);
  if (run.coins < cost) return run;
  const rerolls = shop.rerolls + 1;
  return { ...run, coins: run.coins - cost, shop: { ...shop, rerolls, ...stockFor(run, shop.ante, rerolls, pool) } };
}

export function priceOfItem(id: ItemId): number {
  return ITEMS.find((i) => i.id === id)?.price ?? 0;
}

export function canBuyLens(run: RunState, k: number): boolean {
  const id = run.shop?.lenses[k];
  const def = id ? lensById(id) : undefined;
  return !!def && run.coins >= def.price && run.lenses.length < SLOTS.lenses;
}

export function canBuyItem(run: RunState, k: number): boolean {
  const id = run.shop?.items[k];
  return !!id && run.coins >= priceOfItem(id) && run.items.length < SLOTS.consumables;
}

export function buyLens(run: RunState, k: number): RunState {
  if (run.phase !== 'shop' || !run.shop || !canBuyLens(run, k)) return run;
  const id = run.shop.lenses[k] as LensId;
  const def = lensById(id)!;
  const lenses = [...run.lenses, { id }];
  const next: RunState = {
    ...run,
    coins: run.coins - def.price,
    lenses,
    shop: { ...run.shop, lenses: run.shop.lenses.map((x, i) => (i === k ? null : x)) },
  };
  // A lens that caps the hearts (Glass Cannon) takes the extra ones at once.
  return { ...next, hearts: Math.min(next.hearts, maxHeartsOf(next)) };
}

export function buyItem(run: RunState, k: number): RunState {
  if (run.phase !== 'shop' || !run.shop || !canBuyItem(run, k)) return run;
  const id = run.shop.items[k] as ItemId;
  return {
    ...run,
    coins: run.coins - priceOfItem(id),
    items: [...run.items, id],
    shop: { ...run.shop, items: run.shop.items.map((x, i) => (i === k ? null : x)) },
  };
}

/** What the lens in a slot sells for. */
export function sellValue(run: RunState, slot: number): number {
  const def = run.lenses[slot] ? lensById(run.lenses[slot].id) : undefined;
  return def ? sellPrice(def, SHOP.sellShare) : 0;
}

/** Sells a lens for half its price. Hearts lost to a cap stay lost. */
export function sellLens(run: RunState, slot: number): RunState {
  if (run.phase !== 'shop' || !run.lenses[slot]) return run;
  return { ...run, coins: run.coins + sellValue(run, slot), lenses: run.lenses.filter((_, i) => i !== slot) };
}

/** Moves a lens to another slot: lenses fire in slot order. */
export function moveLens(run: RunState, from: number, to: number): RunState {
  if (from === to || !run.lenses[from] || to < 0 || to >= run.lenses.length) return run;
  const lenses = run.lenses.slice();
  const [l] = lenses.splice(from, 1);
  lenses.splice(to, 0, l);
  return { ...run, lenses };
}
