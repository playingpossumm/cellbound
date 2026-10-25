import { describe, expect, it } from 'vitest';
import { dailyDate, dailyRunSeed } from '../../engine';
import { CARDS, cardPool } from './cards';
import { OFFER_SIZE, offerFor } from './offers';

const starter = cardPool(new Set(), true);
const everything = cardPool(new Set(['first-run', 'board-3', 'full-hearts', 'cursed-board', 'daily-3']), false);
const ids = (cs: { id: string }[]) => cs.map((c) => c.id);

describe('offers', () => {
  it('give three distinct cards from three different families', () => {
    for (let s = 0; s < 60; s++) {
      for (let n = 1; n <= 4; n++) {
        const o = offerFor('t:' + s, n, starter);
        expect(o.length).toBe(OFFER_SIZE);
        expect(new Set(ids(o)).size).toBe(OFFER_SIZE);
        expect(new Set(o.map((c) => c.family)).size).toBe(OFFER_SIZE);
      }
    }
  });

  it('always include a boon and a card with a price', () => {
    for (let s = 0; s < 60; s++) {
      const o = offerFor('t:' + s, 1, everything);
      expect(o.some((c) => c.kind === 'boon')).toBe(true);
      expect(o.some((c) => c.kind !== 'boon')).toBe(true);
    }
  });

  it('are the same for the same seed and board, whatever the order of the pool', () => {
    const a = offerFor('run:2026-10-23', 2, starter);
    const b = offerFor('run:2026-10-23', 2, starter);
    const c = offerFor('run:2026-10-23', 2, starter.slice().reverse());
    expect(ids(a)).toEqual(ids(b));
    expect(ids(a)).toEqual(ids(c));
  });

  it('are the same for every player on a daily run, because the pool is starter only', () => {
    const date = dailyDate(new Date(2026, 9, 23));
    const seed = dailyRunSeed(date);
    const fresh = cardPool(new Set(), true);
    const veteran = cardPool(new Set(['first-run', 'board-3', 'full-hearts', 'cursed-board', 'daily-3']), true);
    for (let n = 1; n <= 4; n++) expect(ids(offerFor(seed, n, fresh))).toEqual(ids(offerFor(seed, n, veteran)));
  });

  it('differ between boards and between days', () => {
    const seen = new Set<string>();
    for (let d = 1; d <= 28; d++) {
      const seed = dailyRunSeed(`2026-10-${String(d).padStart(2, '0')}`);
      seen.add(ids(offerFor(seed, 1, starter)).join());
    }
    expect(seen.size).toBeGreaterThan(8);
    const boards = new Set([1, 2, 3, 4].map((n) => ids(offerFor('run:2026-10-23', n, starter)).join()));
    expect(boards.size).toBeGreaterThan(1);
  });

  it('can offer Hard turn for the final board too, now that every board has a time window', () => {
    let seen = 0;
    for (let s = 0; s < 120; s++) if (offerFor('t:' + s, 4, everything).some((c) => c.id === 'hard-turn')) seen++;
    expect(seen).toBeGreaterThan(0);
  });

  it('only offer cards from the pool they are given', () => {
    const o = offerFor('t:pool', 3, starter);
    for (const c of o) expect(starter).toContain(c);
    expect(CARDS.length).toBeGreaterThan(starter.length);
  });

  it('shows rare cards less often than common ones', () => {
    let rare = 0;
    let common = 0;
    for (let s = 0; s < 400; s++) {
      for (const c of offerFor('w:' + s, 2, everything)) {
        if (c.rarity === 'rare') rare++;
        if (c.rarity === 'common') common++;
      }
    }
    expect(common).toBeGreaterThan(rare * 2);
  });
});
