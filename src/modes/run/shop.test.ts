import { describe, expect, it } from 'vitest';
import { lensById, lensPool, maxHeartsOf } from './lenses';
import type { BoardResult, RunState } from './model';
import { buyItem, buyLens, canBuyLens, moveLens, openShop, priceOfItem, reroll, rerollCost, sellLens, sellValue, stockFor } from './shop';
import { newRun } from './state';
import { SHOP, SLOTS } from './tuning';

const pool = lensPool(new Set(), true);
const shopOf = (over: Partial<RunState> = {}) => openShop({ ...newRun('t:shop', null, 1), slot: 2, coins: 40, ...over }, pool);

describe('the shop after a boss', () => {
  it('stocks two lenses and two consumables, the same for the same run, ante and rerolls', () => {
    const s = shopOf();
    expect(s.phase).toBe('shop');
    expect(s.shop!.lenses).toHaveLength(SHOP.lenses);
    expect(s.shop!.items).toHaveLength(SHOP.items);
    expect(new Set(s.shop!.lenses).size).toBe(2);
    expect(new Set(s.shop!.items).size).toBe(2);
    expect(shopOf().shop).toEqual(s.shop);
    const other = stockFor(s, 2, 0, pool);
    expect(other).not.toEqual(stockFor(s, 1, 0, pool));
  });

  it('never stocks a lens already held, nor one still locked', () => {
    for (let k = 0; k < 100; k++) {
      const run = { ...newRun(`t:held${k}`, null, 1), lenses: [{ id: 'loupe' as const }, { id: 'cage' as const }] };
      const stock = stockFor(run, 1, k, pool);
      expect(stock.lenses).not.toContain('loupe');
      expect(stock.lenses).not.toContain('cage');
      expect(stock.lenses.every((id) => !lensById(id!)!.unlock)).toBe(true);
    }
  });

  it('leans on what the run has placed: Spyglass and the Pairs Spectrum turn up far more often once a pair was placed', () => {
    const placed = (tech: BoardResult['tech']): RunState['results'] => [
      { slot: 0, status: 'cleared', score: 1, target: 1, coins: null, heartsLost: 0, heartsAfter: 3, mistakes: 0, hintsUsed: 0, elapsedMs: 1, tech, best: null, clean: 0, rule: null },
    ];
    const count = (results: RunState['results']) => {
      let spyglass = 0;
      let pairs = 0;
      let loupe = 0;
      for (let k = 0; k < 600; k++) {
        const stock = stockFor({ ...newRun(`t:lean${k}`, null, 1), results }, 1, 0, pool);
        if (stock.lenses.includes('spyglass')) spyglass++;
        if (stock.items.includes('spectra5')) pairs++;
        if (stock.lenses.includes('loupe')) loupe++;
      }
      return { spyglass, pairs, loupe };
    };
    const singles = count(placed({ nakedSingle: { n: 40, points: 800, top: 40 }, hiddenSingle: { n: 5, points: 150, top: 40 } }));
    const withPair = count(placed({ nakedSingle: { n: 40, points: 800, top: 40 }, nakedPair: { n: 2, points: 150, top: 90 } }));
    expect(withPair.spyglass).toBeGreaterThan(singles.spyglass * 2);
    expect(withPair.pairs).toBeGreaterThan(singles.pairs * 2);
    // What reads singles is in full either way.
    expect(Math.abs(withPair.loupe - singles.loupe)).toBeLessThan(120);
    expect(singles.spyglass).toBeGreaterThan(0);
  });

  it('rerolls for 2 coins, then one more each time, into new stock', () => {
    expect([0, 1, 2].map(rerollCost)).toEqual([2, 3, 4]);
    const s = shopOf();
    const once = reroll(s, pool);
    expect(once.coins).toBe(38);
    expect(once.shop!.rerolls).toBe(1);
    const twice = reroll(once, pool);
    expect(twice.coins).toBe(35);
    expect(reroll({ ...twice, coins: 3 }, pool).coins).toBe(3);
  });

  it('buys a lens into a free slot when the coins are there, and sells it back for half', () => {
    let s = shopOf();
    const id = s.shop!.lenses[0]!;
    const price = lensById(id)!.price;
    s = buyLens(s, 0);
    expect(s.lenses).toEqual([{ id }]);
    expect(s.coins).toBe(40 - price);
    expect(s.shop!.lenses[0]).toBeNull();
    expect(buyLens(s, 0)).toBe(s);
    expect(sellValue(s, 0)).toBe(Math.floor(price / 2));
    const sold = sellLens(s, 0);
    expect(sold.lenses).toEqual([]);
    expect(sold.coins).toBe(40 - price + Math.floor(price / 2));
  });

  it('holds five lenses and two consumables at most', () => {
    const fiveHeld = shopOf({ lenses: ['loupe', 'cage', 'dot', 'redShift', 'blueShift'].map((id) => ({ id })) as RunState['lenses'], coins: 99 });
    const k = fiveHeld.shop!.lenses.findIndex((x) => x !== null);
    expect(fiveHeld.lenses).toHaveLength(SLOTS.lenses);
    expect(canBuyLens(fiveHeld, k)).toBe(false);
    expect(buyLens(fiveHeld, k)).toBe(fiveHeld);
    let s = shopOf({ coins: 99 });
    s = buyItem(buyItem(s, 0), 1);
    expect(s.items).toHaveLength(2);
    expect(s.coins).toBe(99 - priceOfItem(s.items[0]) - priceOfItem(s.items[1]));
    const third = reroll(s, pool);
    expect(buyItem(third, 0)).toBe(third);
  });

  it('takes the extra hearts at once when a lens caps them, and keeps them lost after selling it', () => {
    const run = { ...newRun('t:cannon', null, 1), hearts: 3, lenses: [{ id: 'glassCannon' as const }] };
    expect(maxHeartsOf(run)).toBe(1);
    const s = { ...shopOf({ hearts: 3 }), shop: { ante: 1, rerolls: 0, lenses: ['glassCannon' as const, null], items: [null, null] } };
    const bought = buyLens(s, 0);
    expect(bought.hearts).toBe(1);
    const sold = sellLens(bought, 0);
    expect(sold.hearts).toBe(1);
    expect(maxHeartsOf(sold)).toBe(3);
  });

  it('moves lenses between slots, since they fire in slot order', () => {
    const run = { ...newRun('t:move', null, 1), lenses: [{ id: 'loupe' as const }, { id: 'spyglass' as const }, { id: 'mirror' as const }] };
    expect(moveLens(run, 2, 0).lenses.map((l) => l.id)).toEqual(['mirror', 'loupe', 'spyglass']);
    expect(moveLens(run, 0, 1).lenses.map((l) => l.id)).toEqual(['spyglass', 'loupe', 'mirror']);
    expect(moveLens(run, 0, 5)).toBe(run);
  });
});
