import { describe, expect, it } from 'vitest';
import { LYRA } from '../../engine/fixtures';
import { SLOT_COUNT, isBoss, kindOf } from './boards';
import { BOSS_RULES } from './bosses';
import { LENSES, lensPool } from './lenses';
import type { RunState } from './model';
import { canOffer, REWARDS, rewardById, rewardPool } from './rewards';
import {
  advance,
  bossShown,
  canSkip,
  cashOut,
  emptiestBox,
  endBoard,
  hintsAfter,
  leaveShop,
  leaveTally,
  modsFor,
  newRun,
  passReward,
  playBoard,
  ruleOf,
  shareText,
  skip,
  takeReward,
  useSpectra,
  type BoardEnd,
} from './state';
import { COINS, HEARTS } from './tuning';

const rewards = rewardPool(new Set(), true);
const lenses = lensPool(new Set(), true);
const clean: BoardEnd = { mistakes: 0, hintsUsed: 0, elapsedMs: 60_000, timedOut: false };

/** Plays the board on the select screen to a final score. */
function play(run: RunState, score: number, target = 1000, end: Partial<BoardEnd> = {}, live: Partial<NonNullable<RunState['live']>> = {}): RunState {
  const r = playBoard(run, { key: `k${run.slot}`, target, stolen: [], fog: false, mods: {} });
  return endBoard({ ...r, live: { ...r.live!, score, ...live } }, { ...clean, ...end });
}

/** Takes the first card that is not a bargain and does not end anything. */
function takeFirst(run: RunState): RunState {
  const id = run.offer!.cards.find((c) => !rewardById(c)!.cost) ?? run.offer!.cards[0];
  return takeReward(run, id, lenses);
}

describe('a new run', () => {
  it('starts on the first Small board with 3 of 3 hearts and 4 coins', () => {
    const run = newRun('t:new', null, 5);
    expect(run).toMatchObject({ v: 2, phase: 'select', slot: 0, hearts: 3, maxHearts: 3, coins: COINS.start, shield: 0, score: 0 });
    expect(run.targets).toEqual(new Array(9).fill(null));
    expect(run.levels).toEqual(new Array(9).fill(0));
  });

  it('draws three different boss rules, with Fish Market only on the last boss', () => {
    const seen = new Set<string>();
    for (let k = 0; k < 300; k++) {
      const b = newRun(`t:boss${k}`, null, 1).bosses;
      expect(new Set(b).size).toBe(3);
      expect(b.slice(0, 2)).not.toContain('fish');
      b.forEach((r) => seen.add(r));
    }
    expect([...seen].sort()).toEqual([...BOSS_RULES].sort());
  });
});

describe('the ladder of boards', () => {
  it('skips a Small or Big board for a tag of two commons, and never a boss', () => {
    const run = newRun('t:skip', null, 1);
    expect(canSkip(run)).toBe(true);
    const tagged = skip(run, rewards);
    expect(tagged.phase).toBe('reward');
    expect(tagged.offer).toMatchObject({ kind: 'tag', slot: 0 });
    expect(tagged.offer!.cards).toHaveLength(2);
    expect(tagged.offer!.cards.every((c) => rewardById(c)!.rarity === 'common')).toBe(true);
    expect(tagged.results[0]).toMatchObject({ status: 'skipped', score: 0, coins: null });
    expect(tagged.coins).toBe(run.coins);
    const next = takeFirst(tagged);
    expect(next).toMatchObject({ phase: 'select', slot: 1 });
    const boss = { ...run, slot: 2 };
    expect(canSkip(boss)).toBe(false);
    expect(skip(boss, rewards)).toBe(boss);
  });

  it('pays a cleared board its coins, the overflow and interest, then offers a pick of three', () => {
    const run = { ...newRun('t:clear', null, 1), coins: 12 };
    const done = play(run, 1350, 1000);
    expect(done.phase).toBe('tally');
    const r = done.results[0];
    expect(r.status).toBe('cleared');
    // 3 for a Small board, 3 for 35 percent over, 2 interest on 12 coins.
    expect(r.coins).toEqual({ board: 3, overflow: 3, interest: 2, lenses: 0, total: 8 });
    expect(done.coins).toBe(20);
    expect(done.score).toBe(1350);
    const picking = leaveTally(done, rewards, lenses);
    expect(picking.phase).toBe('reward');
    expect(picking.offer!.cards).toHaveLength(3);
    expect(new Set(picking.offer!.cards).size).toBe(3);
  });

  it('caps the overflow at 5 and the interest at 5', () => {
    const run = { ...newRun('t:cap', null, 1), coins: 80 };
    expect(play(run, 5000, 1000).results[0].coins).toEqual({ board: 3, overflow: 5, interest: 5, lenses: 0, total: 13 });
  });

  it('costs a heart for a board under its target, pays no coins at all and offers no pick', () => {
    const run = { ...newRun('t:miss', null, 1), coins: 10, lenses: [{ id: 'coinPrism' as const }] };
    const done = play(run, 900, 1000);
    expect(done.results[0]).toMatchObject({ status: 'missed', heartsLost: 1, heartsAfter: 2 });
    // Not the interest on 10 coins, and not what a held lens pays: only a cleared board is cashed out.
    expect(done.results[0].coins).toEqual({ board: 0, overflow: 0, interest: 0, lenses: 0, total: 0 });
    expect(done.coins).toBe(10);
    expect(done.hearts).toBe(2);
    const next = leaveTally(done, rewards, lenses);
    expect(next).toMatchObject({ phase: 'select', slot: 1 });
  });

  it('offers four cards with a rare after a boss, then the shop, then the next ante', () => {
    const run = { ...newRun('t:boss', null, 1), slot: 2 };
    const done = play(run, 2000, 1000);
    const pick = leaveTally(done, rewards, lenses);
    expect(pick.offer!.kind).toBe('boss');
    expect(pick.offer!.cards).toHaveLength(4);
    expect(pick.offer!.cards.some((c) => rewardById(c)!.rarity === 'rare')).toBe(true);
    const shop = takeFirst(pick);
    expect(shop.phase).toBe('shop');
    expect(shop.shop).toMatchObject({ ante: 1, rerolls: 0 });
    const next = leaveShop(shop);
    expect(next).toMatchObject({ phase: 'select', slot: 3, shop: null });
  });

  it('opens the shop after a missed boss too, with no pick', () => {
    const done = play({ ...newRun('t:bossmiss', null, 1), slot: 5 }, 100, 1000);
    expect(leaveTally(done, rewards, lenses).phase).toBe('shop');
  });

  it('breaks a Glass board for two hearts and no coins or pick', () => {
    const run = { ...newRun('t:glass', null, 1), slot: 2 };
    const r = playBoard(run, { key: 'k', target: 1000, stolen: [], fog: false, mods: {} });
    const broken = endBoard({ ...r, live: { ...r.live!, broken: true, hearts: 1, heartsLost: 2, score: 5000 } }, { ...clean, mistakes: 1 });
    expect(broken.results[0]).toMatchObject({ status: 'broken', coins: null, heartsAfter: 1 });
    expect(broken.coins).toBe(run.coins);
    expect(leaveTally(broken, rewards, lenses).phase).toBe('shop');
  });

  it('ends the run lost when the hearts run out, and the summary follows the tally', () => {
    const run = { ...newRun('t:lost', null, 1), hearts: 1 };
    const done = play(run, 10, 1000);
    expect(done.outcome).toBe('lost');
    expect(done.hearts).toBe(0);
    expect(leaveTally(done, rewards, lenses).phase).toBe('done');
  });

  it('keeps the run going with Second Wind when a miss would take the last heart', () => {
    const run = { ...newRun('t:wind', null, 1), hearts: 1, perks: { secondWind: 1 } };
    const done = play(run, 10, 1000);
    expect(done.outcome).toBeNull();
    expect(done.hearts).toBe(1);
    expect(done.secondWindUsed).toBe(true);
  });

  it('wins on clearing the last boss, and loses on missing it even with hearts left', () => {
    const last = { ...newRun('t:end', null, 1), slot: SLOT_COUNT - 1 };
    expect(play(last, 2000, 1000).outcome).toBe('won');
    const missed = play(last, 900, 1000);
    expect(missed.outcome).toBe('lost');
    expect(missed.hearts).toBe(2);
  });

  it('plays all nine boards in order, kinds and bosses where they belong', () => {
    let run = newRun('t:all', null, 1);
    const seen: string[] = [];
    while (!run.outcome) {
      seen.push(kindOf(run.slot));
      run = play(run, 5000, 1000);
      if (run.outcome) break;
      run = leaveTally(run, rewards, lenses);
      if (run.phase === 'reward') run = takeFirst(run);
      if (run.phase === 'shop') run = leaveShop(run);
    }
    expect(seen).toEqual(['small', 'big', 'boss', 'small', 'big', 'boss', 'small', 'big', 'boss']);
    expect(run.outcome).toBe('won');
    expect(run.results).toHaveLength(9);
    expect(run.score).toBeGreaterThanOrEqual(45_000);
  });
});

describe('cards on the run', () => {
  it('applies every reward card without breaking the run', () => {
    for (const def of REWARDS) {
      const base = { ...newRun('t:cards', null, 1), hearts: 2, results: [] };
      const next = def.apply(base);
      expect(next.hearts, def.id).toBeGreaterThanOrEqual(1);
      expect(next.hearts, def.id).toBeLessThanOrEqual(HEARTS.max);
      expect(next.maxHearts, def.id).toBeGreaterThanOrEqual(1);
    }
  });

  it('heals, raises the heart slots, shields and pays as the cards say', () => {
    const run = { ...newRun('t:c', null, 1), hearts: 2 };
    expect(rewardById('mend')!.apply(run).hearts).toBe(3);
    expect(rewardById('bigHeart')!.apply(run)).toMatchObject({ maxHearts: 4, hearts: 3 });
    expect(rewardById('shield')!.apply(run).shield).toBe(1);
    expect(rewardById('lantern')!.apply(run).hintPool).toBe(2);
    expect(rewardById('bounty')!.apply(run)).toMatchObject({ score: 500, bonus: 500 });
    expect(rewardById('glassHeart')!.apply(run)).toMatchObject({ maxHearts: 2, hearts: 2, perks: { glassHeart: 1 } });
    expect(rewardById('fogLamp')!.apply(run)).toMatchObject({ hintPool: 3, next: { fog: true } });
    expect(rewardById('bloodMoney')!.apply(run)).toMatchObject({ hearts: 1, coins: 12 });
    expect(rewardById('overtime')!.apply(run).next).toEqual({ clock: true, coinTimes: 2 });
    for (const id of ['microscope', 'daredevil', 'insurance'] as const) {
      const held = rewardById(id)!.apply(run);
      expect(held.perks, id).toEqual({ [id]: 1 });
      expect(held, id).toMatchObject({ hearts: 2, maxHearts: run.maxHearts, coins: run.coins });
      // Each is held once.
      expect(canOffer(rewardById(id)!, held, 'reward'), id).toBe(false);
    }
  });

  it('settles Double or Nothing on the next board played: doubled without mistakes, lost with one', () => {
    let run = play(newRun('t:don', null, 1), 1500, 1000);
    run = leaveTally(run, rewards, lenses);
    run = { ...run, offer: { ...run.offer!, cards: ['doubleOrNothing', ...run.offer!.cards.slice(1)] } };
    const bet = takeReward(run, 'doubleOrNothing', lenses);
    expect(bet.pending).toEqual({ slot: 0, score: 1500 });
    const won = play(bet, 1200, 1000);
    expect(won.pending).toBeNull();
    expect(won.score).toBe(1500 + 1200 + 1500);
    const lost = play(bet, 1200, 1000, { mistakes: 1 });
    expect(lost.score).toBe(1500 + 1200 - 1500);
  });

  it('uses the board hint first, then the pool, with Sharp Eye free', () => {
    const run = { ...newRun('t:hints', null, 1), hintPool: 3, perks: { sharpEye: 1 } };
    const r = playBoard(run, { key: 'k', target: 10, stolen: [], fog: false, mods: {} });
    expect(r.live!.hints).toEqual({ board: 1, pool: 3, quick: 1, extra: 0 });
    expect(hintsAfter(r.live!, 1)).toEqual({ pool: 3, left: 4 });
    expect(hintsAfter(r.live!, 2)).toEqual({ pool: 3, left: 3 });
    expect(hintsAfter(r.live!, 4)).toEqual({ pool: 1, left: 1 });
    expect(endBoard(r, { ...clean, hintsUsed: 4 }).hintPool).toBe(1);
  });

  it('pays Coin Prism for hints left and Mint for clean boxes', () => {
    const run = { ...newRun('t:coin', null, 1), coins: 0, lenses: [{ id: 'coinPrism' as const }, { id: 'mint' as const }] };
    const r = playBoard(run, { key: 'k', target: 100, stolen: [], fog: false, mods: {} });
    const live = { ...r.live!, score: 100, cleanBoxes: 7 };
    expect(cashOut(run, live, true, 2).lenses).toBe(2 + 3);
  });

  it('levels a tier with a Spectra and takes it from its slot', () => {
    const run = { ...newRun('t:spec', null, 1), items: ['spectra5' as const, 'inkHint' as const] };
    const next = useSpectra(run, 0);
    expect(next.levels[5]).toBe(1);
    expect(next.items).toEqual(['inkHint']);
    expect(useSpectra(next, 0)).toBe(next);
  });

  it('moves on from an empty offer', () => {
    const run = { ...newRun('t:empty', null, 1), phase: 'reward' as const, offer: { kind: 'reward' as const, slot: 0, cards: [] } };
    expect(passReward(run, lenses)).toMatchObject({ phase: 'select', slot: 1 });
  });
});

describe('a board as it starts', () => {
  it('takes its rule and the cards meant for it', () => {
    const run = { ...newRun('t:mods', null, 1), bosses: ['mute', 'clock', 'fog'] as RunState['bosses'], perks: { peek: 2, sharpEye: 1, candidateGlass: 1 }, hintPool: 2 };
    const small = modsFor(run, 0, LYRA);
    expect(small).toEqual({ reveal: 2, hints: 4, quickHints: 1, notesIn: emptiestBox(LYRA) });
    const mute = modsFor(run, 2, LYRA);
    expect(mute.noNotes).toBe(true);
    expect(mute.notesIn).toBeUndefined();
    expect(modsFor(run, 5, LYRA).timeLimitMs).toBe(16 * 60_000);
    expect(modsFor({ ...run, next: { clock: true } }, 0, LYRA).timeLimitMs).toBe(9 * 60_000);
    expect(ruleOf(run, 8)).toBe('fog');
    expect(ruleOf(run, 7)).toBeNull();
  });

  it('uses the cards meant for the next board when it starts', () => {
    const run = { ...newRun('t:next', null, 1), next: { fog: true, clock: true, coinTimes: 2 } };
    const r = playBoard(run, { key: 'k', target: 10, stolen: [], fog: true, mods: {} });
    expect(r.next).toEqual({});
    expect(r.live!.coinTimes).toBe(2);
    expect(r.targets[0]).toBe(10);
  });

  it('shows the boss rule on the boss, or from the start of the ante with Scout', () => {
    const run = newRun('t:scout', null, 1);
    expect(bossShown(run)).toBe(false);
    expect(bossShown({ ...run, slot: 2 })).toBe(true);
    expect(bossShown({ ...run, perks: { scout: 1 } })).toBe(true);
  });

  it('finds the emptiest box', () => {
    const cells = emptiestBox(LYRA);
    expect(cells.length).toBeGreaterThan(0);
    expect(cells.every((i) => !LYRA.givens[i])).toBe(true);
  });
});

describe('the words of a run', () => {
  it('writes a share text with the antes and the best placement', () => {
    let run = newRun('t:share', '2026-10-26', 1);
    run = play(run, 1500, 1000, {}, { best: { technique: 'xWing', points: 900 } });
    run = advance(leaveTally(run, rewards, lenses));
    const text = shareText(run);
    expect(text).toContain('Monday 26 October');
    expect(text).toContain('Ante 1: 1,500');
    expect(text).toContain('Best placement: X-Wing, 900');
  });

  it('counts the lenses as about twenty', () => {
    expect(LENSES.length).toBe(20);
    expect(isBoss(2) && isBoss(5) && isBoss(8)).toBe(true);
  });
});
