// The leaderboard's server on a store in memory: names with PINs, devices that sign in with them,
// history added up across a player's devices without counting anything twice, and the boards.
import { describe, expect, it } from 'vitest';
import type { DailyEntry } from '../src/game/stats';
import { BLANK_RUN, type Snapshot } from '../src/sync/rules';
import { handle } from './http';
import { boards, cleanSnapshot, join, Refusal, sync, TRIES } from './leaderboard';
import { memoryStore } from './store';

const NOW = Date.parse('2026-10-28T12:00:00Z');
const TODAY = '2026-10-28';
const solved = (ms: number, over: Partial<DailyEntry> = {}): DailyEntry => ({ status: 'solved', ms, mistakes: 0, hints: 0, solvedOn: TODAY, ...over });
const snap = (over: { daily?: Record<string, DailyEntry>; solves?: number; run?: Partial<Snapshot['run']> } = {}): Snapshot => ({
  stats: { solves: { daily: over.solves ?? 0 }, fails: {}, times: {}, daily: over.daily ?? {} },
  run: { ...BLANK_RUN, ...over.run },
});
const device = (n: number) => `device-${String(n).padStart(4, '0')}`;

async function refused(p: Promise<unknown>): Promise<number> {
  try {
    await p;
  } catch (e) {
    if (e instanceof Refusal) return e.status;
    throw e;
  }
  return 0;
}

describe('a name and a PIN', () => {
  it('makes a new name the player’s, and signs a second device in with the same PIN', async () => {
    const store = memoryStore();
    const first = await join(store, { name: '  Ana  Lee ', pin: '1234', device: device(1) });
    expect(first.name).toBe('Ana Lee');
    expect(first.token.length).toBeGreaterThan(20);
    const second = await join(store, { name: 'ana lee', pin: '1234', device: device(2) });
    expect(second.name).toBe('Ana Lee');
    expect(second.token).not.toBe(first.token);
    // The token is kept by its hash: the store holds nothing under the token itself.
    expect(await store.get(`t:${first.token}`)).toBeNull();
  });

  it('turns away a wrong PIN, a bad name or PIN, and a run of tries', async () => {
    const store = memoryStore();
    await join(store, { name: 'Bo', pin: '0000', device: device(1) });
    expect(await refused(join(store, { name: 'bo', pin: '1111', device: device(2) }))).toBe(403);
    expect(await refused(join(store, { name: 'x', pin: '1111', device: device(2) }))).toBe(400);
    expect(await refused(join(store, { name: 'Cy', pin: '12', device: device(2) }))).toBe(400);
    expect(await refused(join(store, { name: 'Cy', pin: '1234', device: 'short' }))).toBe(400);
    for (let i = 0; i < TRIES; i++) await refused(join(store, { name: 'Bo', pin: '9999', device: device(3) }));
    expect(await refused(join(store, { name: 'Bo', pin: '0000', device: device(3) }))).toBe(429);
  });
});

describe('history across devices', () => {
  it('keeps each device’s stats once and hands each device the others’', async () => {
    const store = memoryStore();
    const phone = await join(store, { name: 'Dee', pin: '4321', device: device(1) });
    await sync(store, phone.token, { snapshot: snap({ solves: 3, daily: { '2026-10-27': solved(400_000, { solvedOn: '2026-10-27' }) } }) }, NOW);
    // Sending the same stats again changes nothing: a device's copy is replaced, not added.
    await sync(store, phone.token, { snapshot: snap({ solves: 3, daily: { '2026-10-27': solved(400_000, { solvedOn: '2026-10-27' }) } }) }, NOW);
    const laptop = await join(store, { name: 'Dee', pin: '4321', device: device(2) });
    expect(laptop.others.stats.solves.daily).toBe(3);
    expect(Object.keys(laptop.others.stats.daily)).toEqual(['2026-10-27']);
    const back = await sync(store, laptop.token, { snapshot: snap({ solves: 1, daily: { [TODAY]: solved(300_000) } }) }, NOW);
    expect(back.others.stats.solves.daily).toBe(3);
    const phoneAgain = await sync(store, phone.token, { snapshot: snap({ solves: 3, daily: { '2026-10-27': solved(400_000, { solvedOn: '2026-10-27' }) } }) }, NOW);
    expect(phoneAgain.others.stats.solves.daily).toBe(1);
    expect(phoneAgain.others.stats.daily[TODAY].ms).toBe(300_000);
  });

  it('asks a device without a valid token to sign in again', async () => {
    expect(await refused(sync(memoryStore(), 'nope', { snapshot: snap() }, NOW))).toBe(401);
  });

  it('keeps a device’s stats to the shapes the app writes', () => {
    const s = cleanSnapshot({ stats: { solves: { daily: 2, free: -4 }, daily: { '2026-10-28': { status: 'solved', ms: 9, mistakes: 0, hints: 0, solvedOn: TODAY }, nope: {}, '2026-10-29': { status: 'won' } } }, run: { started: 'x', topAnte: 9 } });
    expect(s.stats.solves).toEqual({ daily: 2, free: 0 });
    expect(Object.keys(s.stats.daily)).toEqual([TODAY]);
    expect(s.run.started).toBe(0);
    expect(s.run.topAnte).toBe(3);
  });
});

describe('the boards', () => {
  it('ranks today’s Daily by time, the Daily Run, the best run and the streak, with the asker marked', async () => {
    const store = memoryStore();
    const a = await join(store, { name: 'Ann', pin: '1111', device: device(1) });
    const b = await join(store, { name: 'Ben', pin: '2222', device: device(2) });
    await sync(store, a.token, { snapshot: snap({ daily: { [TODAY]: solved(500_000, { mistakes: 2 }) }, run: { dailyBest: { [TODAY]: { score: 9000, cleared: 5, outcome: 'lost' } } } }) }, NOW);
    await sync(
      store,
      b.token,
      {
        snapshot: snap({
          daily: { '2026-10-27': solved(1, { solvedOn: '2026-10-27' }), [TODAY]: solved(420_000, { hints: 1 }) },
          run: { bestFree: { score: 40_000, date: '2026-10-20' }, dailyBest: { [TODAY]: { score: 7000, cleared: 4, outcome: 'lost' } } },
        }),
      },
      NOW,
    );
    const seen = await boards(store, TODAY, a.token);
    expect(seen.daily.map((r) => [r.rank, r.name, r.value, r.mistakes, r.hints, !!r.you])).toEqual([
      [1, 'Ben', 420_000, 0, 1, false],
      [2, 'Ann', 500_000, 2, 0, true],
    ]);
    expect(seen.drun.map((r) => [r.name, r.value])).toEqual([
      ['Ann', 9000],
      ['Ben', 7000],
    ]);
    expect(seen.best.map((r) => [r.name, r.value])).toEqual([
      ['Ben', 40_000],
      ['Ann', 9000],
    ]);
    expect(seen.streak.map((r) => [r.name, r.value])).toEqual([
      ['Ben', 2],
      ['Ann', 1],
    ]);
    // A Daily solved after its day counts for nothing on that day's board.
    const late = await join(store, { name: 'Cat', pin: '3333', device: device(3) });
    await sync(store, late.token, { snapshot: snap({ daily: { [TODAY]: solved(10, { solvedOn: '2026-10-29' }) } }) }, NOW);
    expect((await boards(store, TODAY, null)).daily.map((r) => r.name)).toEqual(['Ben', 'Ann']);
  });

  it('gives players level on a board the same rank', async () => {
    const store = memoryStore();
    for (const [n, name] of ['Gus', 'Hal', 'Ivy'].entries()) {
      const p = await join(store, { name, pin: '1212', device: device(10 + n) });
      const days: Record<string, DailyEntry> = n === 2 ? { '2026-10-27': solved(1, { solvedOn: '2026-10-27' }), [TODAY]: solved(1) } : { [TODAY]: solved(1) };
      await sync(store, p.token, { snapshot: snap({ daily: days }) }, NOW);
    }
    expect((await boards(store, TODAY, null)).streak.map((r) => [r.rank, r.name, r.value])).toEqual([
      [1, 'Ivy', 2],
      [2, 'Gus', 1],
      [2, 'Hal', 1],
    ]);
  });

  it('answers over HTTP, and says so when there is no store', async () => {
    const store = memoryStore();
    const res = await handle(new Request('http://x/api/join', { method: 'POST', body: JSON.stringify({ name: 'Eve', pin: '5555', device: device(5) }) }), store);
    expect(res.status).toBe(200);
    const { token } = (await res.json()) as { token: string };
    const board = await handle(new Request(`http://x/api/board?date=${TODAY}`, { headers: { Authorization: `Bearer ${token}` } }), store);
    expect(board.status).toBe(200);
    expect(((await board.json()) as { daily: unknown[] }).daily).toEqual([]);
    expect((await handle(new Request('http://x/api/board?date=2026-10-28'), null)).status).toBe(503);
    expect((await handle(new Request('http://x/api/join', { method: 'POST', body: 'not json' }), store)).status).toBe(400);
  });
});

describe('a snapshot of runs at each difficulty', () => {
  it('keeps the bests on Easy and Hard and the wins on Easy, never more of those than wins', () => {
    const s = cleanSnapshot({ run: { won: 2, wonEasy: 5, bestHard: { score: 1200, date: '2026-10-28T09:00' }, bestEasy: { score: 'x' } } });
    expect(s.run.wonEasy).toBe(2);
    expect(s.run.bestHard).toEqual({ score: 1200, date: '2026-10-28' });
    expect(s.run.bestEasy).toBeNull();
  });
});
