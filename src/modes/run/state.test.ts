import { describe, expect, it } from 'vitest';
import { APP_NAME } from '../../app/brand';
import { BAD_COPY } from '../../test/copy';
import { BOARD_COUNT, BOARD_SPECS, PAR_MS, parFor } from './boards';
import { cardPool, cardById, START_HEARTS } from './cards';
import {
  abandon,
  advance,
  boardsCleared,
  choose,
  finishBoard,
  liveHearts,
  liveShield,
  newRun,
  shareText,
  type BoardEnd,
  type RunState,
} from './state';

const pool = cardPool(new Set(), true);
const clean: BoardEnd = { status: 'solved', mistakes: 0, hintsUsed: 0, elapsedMs: 60_000 };

/** Plays one board, then moves on to the card choice, taking the offered card at slot `slot`. */
function playOn(run: RunState, end: BoardEnd = clean, slot = 0): RunState {
  let r = finishBoard(run, end);
  r = advance(r, pool);
  if (r.phase === 'choose') r = choose(r, r.offer[slot]);
  return r;
}

describe('a new run', () => {
  it('starts on board 1 with 3 hearts and no shield', () => {
    const r = newRun('t:new', null, 1);
    expect(r).toMatchObject({ phase: 'board', index: 0, hearts: START_HEARTS, shield: 0, score: 0, outcome: null });
    expect(r.setup.options.seed).toBe('t:new:0');
    expect(r.setup.options.size).toBe(6);
    expect(r.setup.options.difficulty).toBe(1);
    expect(r.setup.mods).toMatchObject({ hearts: 3, shield: 0 });
  });

  it('is plain data, so it survives a JSON round trip', () => {
    const r = newRun('t:json', '2026-10-23', 5);
    expect(JSON.parse(JSON.stringify(r))).toEqual(r);
  });

  it('builds the same boards for the same seed', () => {
    const a = newRun('run:2026-10-23', '2026-10-23', 1);
    const b = newRun('run:2026-10-23', '2026-10-23', 99);
    expect(a.setup).toEqual(b.setup);
  });
});

describe('the board ladder', () => {
  it('rises from difficulty 1 to 3 over boards 1 to 4, all 6x6 for pace', () => {
    const ds = BOARD_SPECS.slice(0, 4).map((s) => s.difficulty);
    expect(ds[0]).toBe(1);
    expect(ds[3]).toBe(3);
    expect([...ds].sort()).toEqual(ds);
    BOARD_SPECS.slice(0, 4).forEach((s) => expect(s.size).toBe(6));
  });

  it('ends on a 9x9 at difficulty 2 with three kinds', () => {
    expect(BOARD_SPECS[BOARD_COUNT - 1]).toMatchObject({ size: 9, difficulty: 2, kinds: 3 });
  });

  it('gives the final 9x9 a par for its size, and scores it for its size', () => {
    let r = newRun('t:final', null, 1);
    for (let i = 0; i < BOARD_COUNT - 1; i++) r = playOn(r);
    expect(r.setup.options.size).toBe(9);
    expect(r.setup.parMs).toBe(parFor(9, r.setup.options.difficulty));
    const done = finishBoard(r, { ...clean, elapsedMs: r.setup.parMs });
    const last = done.results[BOARD_COUNT - 1];
    expect(last.size).toBe(9);
    // The base follows the slot (a 9x9 at difficulty 2): the 6x6 base of 160 times 2.25.
    expect(last.score.base).toBe(360);
    expect(last.score.base).toBeGreaterThan(done.results[3].score.base);
  });

  it('seeds board k as runSeed:k', () => {
    let r = newRun('t:ladder', null, 1);
    for (let i = 0; i < BOARD_COUNT - 1; i++) {
      expect(r.setup.options.seed).toBe('t:ladder:' + i);
      r = playOn(r);
    }
    expect(r.setup.options.seed).toBe('t:ladder:' + (BOARD_COUNT - 1));
  });
});

describe('finishing a board', () => {
  it('scores a clean solve and moves to the result', () => {
    const r = finishBoard(newRun('t:a', null, 1), clean);
    expect(r.phase).toBe('result');
    expect(r.outcome).toBeNull();
    expect(r.results).toHaveLength(1);
    expect(r.results[0].status).toBe('solved');
    expect(r.score).toBe(r.results[0].score.total);
    expect(r.score).toBeGreaterThan(0);
    expect(r.hearts).toBe(3);
  });

  it('keeps the par time a board was measured against', () => {
    const r = finishBoard(newRun('t:par', null, 1), clean);
    expect(r.results[0].parMs).toBe(PAR_MS[1]);
  });

  it('charges a heart per mistake', () => {
    const r = finishBoard(newRun('t:b', null, 1), { ...clean, mistakes: 2 });
    expect(r.hearts).toBe(1);
    expect(r.results[0].heartsLost).toBe(2);
  });

  it('lets a shield absorb a mistake first and keeps the rest of it', () => {
    let r = newRun('t:c', null, 1);
    r = { ...r, setup: { ...r.setup, mods: { ...r.setup.mods, shield: 2 } } };
    expect(liveHearts(r.setup, 1)).toBe(3);
    expect(liveShield(r.setup, 1)).toBe(1);
    expect(liveHearts(r.setup, 3)).toBe(2);
    expect(liveShield(r.setup, 3)).toBe(0);
    const done = finishBoard(r, { ...clean, mistakes: 1 });
    expect(done.hearts).toBe(3);
    expect(done.shield).toBe(1);
    expect(done.results[0].heartsLost).toBe(0);
  });

  it('ends the run when the hearts run out', () => {
    const r = finishBoard(newRun('t:d', null, 1), { status: 'failed', mistakes: 3, hintsUsed: 0, elapsedMs: 50_000 });
    expect(r.outcome).toBe('failed');
    expect(r.hearts).toBe(0);
    expect(r.results[0]).toMatchObject({ status: 'failed', reason: 'hearts' });
    expect(r.results[0].score.total).toBe(0);
    expect(advance(r, pool).phase).toBe('done');
  });

  it('ends the run on a time out and says so', () => {
    let r = advance(finishBoard(newRun('t:e', null, 1), clean), pool);
    r = choose({ ...r, offer: ['tight-clock'] }, 'tight-clock');
    expect(r.setup.mods.timeLimitMs).toBe(240_000);
    const out = finishBoard(r, { status: 'failed', mistakes: 1, hintsUsed: 0, elapsedMs: 240_000 });
    expect(out.outcome).toBe('failed');
    expect(out.results[1].reason).toBe('time');
    expect(out.hearts).toBe(2);
  });

  it('calls a failure without a clock out of hearts, whatever the store counted', () => {
    const r = finishBoard(newRun('t:e2', null, 1), { status: 'failed', mistakes: 1, hintsUsed: 0, elapsedMs: 240_000 });
    expect(r.results[0].reason).toBe('hearts');
    expect(r.hearts).toBe(0);
  });

  it('treats a solve with no hearts left as a failure', () => {
    const r = finishBoard(newRun('t:f', null, 1), { ...clean, mistakes: 3 });
    expect(r.outcome).toBe('failed');
  });

  it('ignores a second finish for the same board', () => {
    const once = finishBoard(newRun('t:g', null, 1), clean);
    expect(finishBoard(once, clean)).toBe(once);
  });
});

describe('between boards', () => {
  it('offers three cards, then starts the next board with the pick', () => {
    let r = finishBoard(newRun('t:h', null, 1), clean);
    r = advance(r, pool);
    expect(r.phase).toBe('choose');
    expect(r.offer).toHaveLength(3);
    const pick = r.offer[0];
    r = choose(r, pick);
    expect(r.phase).toBe('board');
    expect(r.index).toBe(1);
    expect(r.setup.cardIds).toContain(pick);
    expect(r.setup.options.seed).toBe('t:h:1');
  });

  it('refuses a card that was not offered', () => {
    let r = advance(finishBoard(newRun('t:i', null, 1), clean), pool);
    const notOffered = pool.find((c) => !r.offer.includes(c.id))!;
    expect(choose(r, notOffered.id)).toBe(r);
  });

  it('refuses a pick outside the choose phase', () => {
    const r = newRun('t:j', null, 1);
    expect(choose(r, 'shield')).toBe(r);
  });

  it('puts a curse pick into the multiplier and marks the board cursed', () => {
    let r = advance(finishBoard(newRun('t:k', null, 1), clean), pool);
    r = { ...r, offer: ['fog', 'lantern', 'shield'] };
    r = choose(r, 'fog');
    expect(r.setup.options.fog).toBe(true);
    expect(r.setup.mult).toBe(1.5);
    const done = finishBoard(r, clean);
    expect(done.results[1].cursed).toBe(true);
    expect(done.results[1].score.mult).toBe(1.5);
    expect(done.results[1].score.total).toBe(Math.round(done.results[1].score.subtotal * 1.5));
  });

  it('scores the base of the board slot, so an easier or harder board does not change it', () => {
    const base = (card: string) => {
      let r = advance(finishBoard(newRun('t:slot', null, 1), clean), pool);
      r = choose({ ...r, offer: [card] }, card);
      return finishBoard(r, clean).results[1].score.base;
    };
    expect(base('easy-road')).toBe(base('lantern'));
    expect(base('hard-turn')).toBe(base('lantern'));
  });

  it('carries a heart from Second wind into the next board and the run', () => {
    let r = advance(finishBoard(newRun('t:l', null, 1), clean), pool);
    r = choose({ ...r, offer: ['second-wind'] }, 'second-wind');
    expect(r.setup.mods.hearts).toBe(4);
    const done = finishBoard(r, { ...clean, mistakes: 1 });
    expect(done.hearts).toBe(3);
  });

  it('keeps an unused shield for later boards', () => {
    let r = advance(finishBoard(newRun('t:m', null, 1), clean), pool);
    r = choose({ ...r, offer: ['shield'] }, 'shield');
    expect(r.setup.mods.shield).toBe(1);
    r = advance(finishBoard(r, clean), pool);
    expect(r.shield).toBe(1);
    r = choose({ ...r, offer: ['lantern'] }, 'lantern');
    expect(r.setup.mods.shield).toBe(1);
  });

  it('keeps a run card in force on every later board', () => {
    let r = advance(finishBoard(newRun('t:n', null, 1), clean), pool);
    r = choose({ ...r, offer: ['steady-hand'] }, 'steady-hand');
    expect(r.perks).toEqual(['steady-hand']);
    expect(r.setup.mods.shield).toBe(1);
    r = advance(finishBoard(r, clean), pool);
    r = choose({ ...r, offer: ['lantern'] }, 'lantern');
    expect(r.setup.cardIds).toEqual(['lantern', 'steady-hand']);
    expect(r.setup.mods.shield).toBe(1);
    expect(r.setup.mods.reveal).toBe(3);
    // A board card does not stay.
    r = advance(finishBoard(r, clean), pool);
    r = choose({ ...r, offer: ['shield'] }, 'shield');
    expect(r.setup.mods.reveal).toBeUndefined();
  });

  it('lets Clear sight beat a later Dim', () => {
    let r = advance(finishBoard(newRun('t:o', null, 1), clean), pool);
    r = choose({ ...r, offer: ['clear-sight'] }, 'clear-sight');
    r = advance(finishBoard(r, clean), pool);
    r = choose({ ...r, offer: ['dim'] }, 'dim');
    expect(r.setup.mods.noHighlights).toBe(false);
    expect(r.setup.mult).toBe(1.3);
  });
});

describe('a whole run', () => {
  it('finishes after five clean boards with the hearts bonus', () => {
    let r = newRun('t:full', null, 1);
    for (let i = 0; i < BOARD_COUNT - 1; i++) r = playOn(r);
    expect(r.index).toBe(BOARD_COUNT - 1);
    r = finishBoard(r, clean);
    expect(r.outcome).toBe('finished');
    expect(r.phase).toBe('result');
    expect(r.endBonus).toBeGreaterThanOrEqual(3 * 150);
    const boards = r.results.reduce((s, x) => s + x.score.total, 0);
    expect(r.score).toBe(boards + r.endBonus);
    expect(boardsCleared(r)).toBe(5);
    expect(advance(r, pool).phase).toBe('done');
  });

  it('pays less when hearts are lost on the way', () => {
    const play = (mistakes: number) => {
      let r = newRun('t:hearts', null, 1);
      for (let i = 0; i < BOARD_COUNT - 1; i++) r = playOn(r, i === 0 ? { ...clean, mistakes } : clean);
      return finishBoard(r, clean);
    };
    expect(play(0).score).toBeGreaterThan(play(2).score);
  });

  it('is deterministic: two replays of the same choices give the same state', () => {
    const go = () => {
      let r = newRun('run:2026-10-23', '2026-10-23', 1);
      for (let i = 0; i < BOARD_COUNT - 1; i++) r = playOn(r, clean, 1);
      return finishBoard(r, clean);
    };
    expect(go()).toEqual(go());
  });

  it('can be abandoned and keeps the score so far', () => {
    let r = finishBoard(newRun('t:ab', null, 1), clean);
    r = abandon(advance(r, pool));
    expect(r.outcome).toBe('abandoned');
    expect(r.phase).toBe('done');
    expect(r.score).toBeGreaterThan(0);
    expect(abandon(r)).toBe(r);
  });
});

describe('share text', () => {
  it('names the run, the result and every board, without emoji or em dashes', () => {
    let r = newRun('run:2026-10-23', '2026-10-23', 1);
    r = advance(finishBoard(r, clean), pool);
    r = choose({ ...r, offer: ['fog'] }, 'fog');
    r = finishBoard(r, { status: 'failed', mistakes: 3, hintsUsed: 0, elapsedMs: 90_000 });
    const t = shareText(r);
    expect(t).toContain(`${APP_NAME} Run, Friday 23 October`);
    expect(t).toContain('Out of hearts on board 2 of 5');
    expect(t).toContain('Score ');
    expect(t).toContain('1: ');
    expect(t).toContain('2: failed (Fog)');
    expect(t).not.toMatch(BAD_COPY);
  });

  it('describes a finished free run', () => {
    let r = newRun('t:share', null, 1);
    for (let i = 0; i < BOARD_COUNT - 1; i++) r = playOn(r);
    r = finishBoard(r, clean);
    const t = shareText(r);
    expect(t.split('\n')[0]).toBe(`${APP_NAME} Run, free run`);
    expect(t).toMatch(/Finished all 5 boards with \d hearts? left/);
  });
});

describe('par times', () => {
  it('grow with difficulty', () => {
    for (let d = 2; d <= 5; d++) expect(PAR_MS[d]).toBeGreaterThan(PAR_MS[d - 1]);
    expect(cardById('tight-clock')!.mult).toBeGreaterThan(0);
  });

  it('grow with size: a 9x9 at difficulty 3 has 10 minutes, and a 6x6 keeps its par', () => {
    for (let d = 1; d <= 5; d++) expect(parFor(6, d)).toBe(PAR_MS[d]);
    expect(parFor(9, 3)).toBe(600_000);
    expect(parFor(9, 2)).toBe(480_000);
  });
});
