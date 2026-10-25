import { describe, expect, it } from 'vitest';
import { APP_NAME } from '../../app/brand';
import { BAD_COPY } from '../../test/copy';
import { BOARD_COUNT, BOARD_SPECS, baseFor } from './boards';
import { cardPool, cardById, START_HEARTS } from './cards';
import { clockOf, parOf } from './scale';
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
    expect(r.setup.options.size).toBe(9);
    expect(r.setup.options.difficulty).toBe(1);
    expect(r.setup.options.minutes).toEqual(BOARD_SPECS[0].minutes);
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
  it('is five 9x9 boards', () => {
    expect(BOARD_SPECS).toHaveLength(BOARD_COUNT);
    for (const s of BOARD_SPECS) expect(s.size).toBe(9);
  });

  it('rises from board to board: level, rules and time never fall, and the time always grows', () => {
    expect(BOARD_SPECS[0]).toMatchObject({ difficulty: 1, kinds: 1 });
    expect(BOARD_SPECS[BOARD_COUNT - 1]).toMatchObject({ difficulty: 3, kinds: 3 });
    for (let i = 1; i < BOARD_COUNT; i++) {
      const [a, b] = [BOARD_SPECS[i - 1], BOARD_SPECS[i]];
      expect(b.difficulty, `board ${i + 1}`).toBeGreaterThanOrEqual(a.difficulty);
      expect(b.kinds, `board ${i + 1}`).toBeGreaterThanOrEqual(a.kinds);
      expect(b.minutes[0], `board ${i + 1}`).toBeGreaterThanOrEqual(a.minutes[1] - 0.5);
      expect(b.minutes[1], `board ${i + 1}`).toBeGreaterThan(a.minutes[1]);
    }
  });

  it('plans a run of about 45 minutes for an experienced player', () => {
    const mid = BOARD_SPECS.reduce((sum, s) => sum + (s.minutes[0] + s.minutes[1]) / 2, 0);
    expect(mid).toBeGreaterThanOrEqual(42);
    expect(mid).toBeLessThanOrEqual(48);
  });

  it('gives every board a par from its time window and the base of its slot', () => {
    let r = newRun('t:final', null, 1);
    for (let i = 0; i < BOARD_COUNT - 1; i++) {
      expect(r.setup.parMs).toBe(parOf(BOARD_SPECS[i].minutes));
      expect(r.setup.base).toBe(baseFor(i));
      // Lantern leaves the board's time window as it is.
      r = advance(finishBoard(r, clean), pool);
      r = choose({ ...r, offer: ['lantern'] }, 'lantern');
    }
    expect(r.setup.options.size).toBe(9);
    expect(r.setup.parMs).toBe(parOf(BOARD_SPECS[BOARD_COUNT - 1].minutes));
    const done = finishBoard(r, { ...clean, elapsedMs: r.setup.parMs });
    const last = done.results[BOARD_COUNT - 1];
    expect(last.size).toBe(9);
    expect(last.score.base).toBe(baseFor(BOARD_COUNT - 1));
    expect(last.score.base).toBeGreaterThan(done.results[3].score.base);
  });

  it('scores a board set up before the time windows with the base of its slot', () => {
    // A run in progress when every board became a 9x9: its board was a 6x6 with no window and no base.
    const r = newRun('t:old', null, 1);
    const { minutes: _gone, ...options } = r.setup.options as typeof r.setup.options & { minutes?: unknown };
    const old: RunState = { ...r, setup: { ...r.setup, options: { ...options, size: 6 }, base: undefined, parMs: 150_000 } };
    const done = finishBoard(old, { ...clean, elapsedMs: 150_000 });
    expect(done.results[0]).toMatchObject({ status: 'solved', size: 6, parMs: 150_000 });
    expect(done.results[0].score.base).toBe(baseFor(0));
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
    expect(r.results[0].parMs).toBe(parOf(BOARD_SPECS[0].minutes));
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
    const clock = clockOf(BOARD_SPECS[1].minutes);
    expect(r.setup.mods.timeLimitMs).toBe(clock);
    const out = finishBoard(r, { status: 'failed', mistakes: 1, hintsUsed: 0, elapsedMs: clock });
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
    expect(r.setup.mods.reveal).toBe(4);
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
  it('grow along the run, from 6 minutes to 12', () => {
    const pars = BOARD_SPECS.map((s) => parOf(s.minutes));
    for (let i = 1; i < pars.length; i++) expect(pars[i]).toBeGreaterThan(pars[i - 1]);
    expect(pars[0]).toBe(360_000);
    expect(pars[pars.length - 1]).toBe(720_000);
  });

  it('follow a card that changes the board: Easy road shortens par and Hard turn lengthens it', () => {
    const parWith = (id: string) => {
      const r = advance(finishBoard(newRun('t:steps', null, 1), clean), pool);
      return choose({ ...r, offer: [id] }, id).setup.parMs;
    };
    expect(parWith('easy-road')).toBeLessThan(parWith('lantern'));
    expect(parWith('hard-turn')).toBeGreaterThan(parWith('lantern'));
    expect(cardById('tight-clock')!.mult).toBeGreaterThan(0);
  });
});
