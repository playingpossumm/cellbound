import { describe, expect, it } from 'vitest';
import type { Category, OfferKind, RunState } from './model';
import { CATEGORIES, categoryWeight, eligible, makeOffer } from './offers';
import { rewardById, rewardPool } from './rewards';
import { newRun } from './state';

const starter = rewardPool(new Set(), true);
const everything = rewardPool(new Set(['boss', 'ante3', 'win', 'xwing', 'chain', 'clean', 'daily3']), false);
const run = (seed: string, over: Partial<RunState> = {}): RunState => ({ ...newRun(seed, null, 1), ...over });
const cats = (r: RunState, kind: OfferKind = 'reward') => makeOffer(r, kind, starter).cards.map((c) => rewardById(c)!.category);

describe('reward offers', () => {
  it('are the same for the same run and state, on every call', () => {
    for (let k = 0; k < 20; k++) {
      const r = run(`seed${k}`, { slot: k % 9 });
      expect(makeOffer(r, 'reward', starter)).toEqual(makeOffer({ ...r }, 'reward', [...starter].reverse()));
    }
  });

  it('never show one card twice, and hold three, four after a boss with a rare, or two commons for a tag', () => {
    for (let k = 0; k < 200; k++) {
      const r = run(`dup${k}`, { slot: k % 9 });
      for (const [kind, size] of [['reward', 3], ['boss', 4], ['tag', 2]] as [OfferKind, number][]) {
        const o = makeOffer(r, kind, everything);
        expect(o.cards).toHaveLength(size);
        expect(new Set(o.cards).size).toBe(size);
        if (kind === 'boss') expect(o.cards.some((c) => rewardById(c)!.rarity === 'rare')).toBe(true);
        if (kind === 'tag') expect(o.cards.every((c) => rewardById(c)!.rarity === 'common')).toBe(true);
      }
    }
  });

  it('change with the board and the seed', () => {
    const a = makeOffer(run('x', { slot: 1 }), 'reward', starter).cards;
    const b = makeOffer(run('x', { slot: 4 }), 'reward', starter).cards;
    const c = makeOffer(run('y', { slot: 1 }), 'reward', starter).cards;
    expect(a.join() === b.join() && a.join() === c.join()).toBe(false);
  });

  it('spread over the categories: one card of each at most, most of the time', () => {
    let spread = 0;
    for (let k = 0; k < 300; k++) if (new Set(cats(run(`spread${k}`, { slot: k % 9 }))).size === 3) spread++;
    expect(spread / 300).toBeGreaterThan(0.8);
  });

  it('show every category regularly, and favour one the last offer left out', () => {
    const count: Record<Category, number> = { hearts: 0, hints: 0, mult: 0, score: 0 };
    let r = run('rotate', { hearts: 3 });
    for (let k = 0; k < 400; k++) {
      const c = cats({ ...r, seed: `rotate${k}`, slot: k % 9 });
      c.forEach((x) => count[x]++);
      r = { ...r, lastCats: c };
    }
    const total = Object.values(count).reduce((a, b) => a + b, 0);
    for (const cat of CATEGORIES) expect(count[cat] / total, cat).toBeGreaterThan(0.12);
    expect(categoryWeight('hearts', run('w', { lastCats: ['hints', 'mult', 'score'] }))).toBeGreaterThan(categoryWeight('hints', run('w', { lastCats: ['hints', 'mult', 'score'] })));
  });

  it('lean on what was placed: Fishbowl and Expert Pay wait until the run has placed a technique they read', () => {
    const board = (tech: Record<string, { n: number; points: number; top: number }>) =>
      [{ slot: 0, status: 'cleared', score: 1, target: 1, coins: null, heartsLost: 0, heartsAfter: 3, mistakes: 0, hintsUsed: 0, elapsedMs: 1, tech, best: null, clean: 0, rule: null }] as unknown as RunState['results'];
    const share = (results: RunState['results']) => {
      let hard = 0;
      for (let k = 0; k < 800; k++) {
        const o = makeOffer({ ...run(`lean${k}`, { slot: k % 9 }), results }, 'boss', everything);
        if (o.cards.some((c) => c === 'fishbowl' || c === 'expertPay')) hard++;
      }
      return hard;
    };
    const plain = share(board({ nakedSingle: { n: 40, points: 900, top: 40 } }));
    const withWing = share(board({ nakedSingle: { n: 40, points: 900, top: 40 }, xWing: { n: 1, points: 900, top: 900 }, nakedPair: { n: 1, points: 90, top: 90 } }));
    expect(withWing).toBeGreaterThan(plain * 1.6);
    expect(plain).toBeGreaterThan(0);
  });

  it('lean on the state: more heart cards when hearts are low, more hint cards after hints were used', () => {
    const share = (over: Partial<RunState>, cat: Category) => {
      let n = 0;
      for (let k = 0; k < 400; k++) n += cats(run(`lean${k}`, { slot: k % 9, ...over })).filter((c) => c === cat).length;
      return n / 1200;
    };
    expect(share({ hearts: 1 }, 'hearts')).toBeGreaterThan(share({ hearts: 3 }, 'hearts') + 0.05);
    expect(share({ hintsLast: 3 }, 'hints')).toBeGreaterThan(share({ hintsLast: 0 }, 'hints') + 0.05);
  });

  it('leave out cards that could do nothing, cards held to their limit and cards not open yet', () => {
    const full = run('full', { hearts: 3, maxHearts: 3, shield: 3, perks: { scout: 1, sharpEye: 1, cascade: 1 } });
    const ids = eligible(full, 'reward', starter).map((c) => c.id);
    expect(ids).not.toContain('mend');
    expect(ids).not.toContain('shield');
    expect(ids).not.toContain('scout');
    expect(ids).not.toContain('cascade');
    expect(ids).toContain('bigHeart');
    expect(eligible(full, 'reward', starter).map((c) => c.id)).not.toContain('fishbowl');
    expect(eligible(full, 'reward', everything).map((c) => c.id)).toContain('fishbowl');
    expect(eligible(run('tag'), 'tag', starter).map((c) => c.id)).not.toContain('doubleOrNothing');
  });
});
