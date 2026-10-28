// The leaderboard's server. A player is a name with a 4-digit PIN; the same name and PIN on another
// device sign that device in. Each device sends its own stats as they stand and the server keeps
// one copy per device, so nothing is counted twice; a device gets back what the player's other
// devices hold, and the boards read the player's devices together. The four boards: today's Daily
// by time, today's Daily Run by score, the best run and the longest Daily streak.
import { mergeRunStats, mergeStats } from '../src/sync/merge';
import { BLANK_RUN, BLANK_STATS, BOARD_KINDS, cleanName, LOWEST_WINS, nameKey, standingOf, validName, validPin, type BoardKind, type BoardRow, type Boards, type Snapshot } from '../src/sync/rules';
import type { Store } from './store';

/** Rows a board shows; the player asking is added below when further down. */
export const TOP = 50;
/** Devices one name may hold. */
export const MAX_DEVICES = 20;
/** Sign-ins a name allows in TRIES_SECONDS, so a PIN cannot be guessed through the server. */
export const TRIES = 8;
const TRIES_SECONDS = 15 * 60;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const keys = {
  player: (key: string) => `p:${key}`,
  /** A token is kept by its hash, so the store never holds one that would sign a device in. */
  token: (hash: string) => `t:${hash}`,
  devices: (key: string) => `d:${key}`,
  tries: (key: string) => `f:${key}`,
  names: 'names',
  board: (kind: BoardKind, date: string) => (kind === 'daily' || kind === 'drun' ? `lb:${kind}:${date}` : `lb:${kind}`),
  dailyMarks: (date: string) => `lbm:daily:${date}`,
};

/** A request the server turns down, with the words to show and the HTTP status. */
export class Refusal extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

interface Player {
  name: string;
  salt: string;
  hash: string;
  created: number;
}

interface Session {
  key: string;
  device: string;
}

interface Kept extends Snapshot {
  at: number;
}

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export function randomId(bytes = 24): string {
  return b64(crypto.getRandomValues(new Uint8Array(bytes)));
}

async function sha256(text: string): Promise<string> {
  return b64(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))));
}

export async function hashPin(pin: string, salt: string): Promise<string> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: 100_000 }, base, 256);
  return b64(new Uint8Array(bits));
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const entries = (v: unknown, max: number) => Object.entries(obj(v)).slice(0, max);

/** A device's stats as sent, kept to the shapes the app writes and to sane sizes. */
export function cleanSnapshot(raw: unknown): Snapshot {
  const r = obj(raw);
  const s = obj(r.stats);
  const u = obj(r.run);
  const counts = (v: unknown) => Object.fromEntries(entries(v, 20).map(([k, n]) => [k, num(n)]));
  const daily: Snapshot['stats']['daily'] = {};
  for (const [date, e] of entries(s.daily, 4000)) {
    const d = obj(e);
    if (!DATE_RE.test(date) || (d.status !== 'solved' && d.status !== 'failed') || typeof d.solvedOn !== 'string') continue;
    daily[date] = { status: d.status, ms: num(d.ms), mistakes: num(d.mistakes), hints: num(d.hints), solvedOn: d.solvedOn.slice(0, 10) };
  }
  const times: Snapshot['stats']['times'] = {};
  for (const [k, t] of entries(s.times, 60)) {
    const x = obj(t);
    times[k] = { count: num(x.count), totalMs: num(x.totalMs), bestMs: num(x.bestMs) };
  }
  const dailyBest: Snapshot['run']['dailyBest'] = {};
  for (const [date, e] of entries(u.dailyBest, 4000)) {
    const d = obj(e);
    if (!DATE_RE.test(date)) continue;
    dailyBest[date] = { score: num(d.score), cleared: num(d.cleared), outcome: d.outcome === 'won' || d.outcome === 'lost' ? d.outcome : 'abandoned' };
  }
  const codex: Snapshot['run']['codex'] = {};
  for (const [id, c] of entries(u.codex, 80)) codex[id as keyof Snapshot['run']['codex']] = { n: num(obj(c).n), best: num(obj(c).best) };
  const bestFree = obj(u.bestFree);
  const best = obj(u.best);
  return {
    stats: { solves: counts(s.solves), fails: counts(s.fails), times, daily },
    run: {
      ...BLANK_RUN,
      started: num(u.started),
      won: num(u.won),
      lost: num(u.lost),
      abandoned: num(u.abandoned),
      bestFree: typeof bestFree.score === 'number' ? { score: num(bestFree.score), date: String(bestFree.date ?? '').slice(0, 10) } : null,
      dailyBest,
      topAnte: Math.min(3, num(u.topAnte)),
      bosses: num(u.bosses),
      cleanBoards: num(u.cleanBoards),
      codex,
      best: typeof best.points === 'number' && typeof best.technique === 'string' ? { technique: best.technique as NonNullable<Snapshot['run']['best']>['technique'], points: num(best.points) } : null,
    },
  };
}

/** Snapshots added together. */
function together(list: Snapshot[]): Snapshot {
  let stats = { ...BLANK_STATS };
  let run = BLANK_RUN;
  for (const s of list) {
    stats = mergeStats(stats, { ...s.stats, recorded: [] });
    run = mergeRunStats(run, s.run);
  }
  const { recorded: _, ...rest } = stats;
  return { stats: rest, run };
}

async function devicesOf(store: Store, key: string): Promise<Record<string, Kept>> {
  const all = await store.hgetall(keys.devices(key));
  const out: Record<string, Kept> = {};
  for (const [device, json] of Object.entries(all)) {
    try {
      out[device] = JSON.parse(json) as Kept;
    } catch {
      // A copy that cannot be read counts for nothing.
    }
  }
  return out;
}

/** What the player's devices other than this one hold, together. */
const others = (devices: Record<string, Snapshot>, device: string) => together(Object.entries(devices).filter(([d]) => d !== device).map(([, s]) => s));

async function session(store: Store, token: string | null): Promise<Session | null> {
  const json = token ? await store.get(keys.token(await sha256(token))) : null;
  return json ? (JSON.parse(json) as Session) : null;
}

/** Today in UTC, and the days either side: a player's own date is one of them, wherever they are. */
function nearDates(now: number): string[] {
  return [-1, 0, 1].map((d) => new Date(now + d * 86_400_000).toISOString().slice(0, 10));
}

/**
 * A name and PIN: a new name is the player's from now on, and a name already taken signs in when
 * the PIN matches. Either way this device gets a token, and what the player's other devices hold.
 */
export async function join(store: Store, body: unknown): Promise<{ token: string; name: string; others: Snapshot }> {
  const b = obj(body);
  const name = cleanName(String(b.name ?? ''));
  const pin = String(b.pin ?? '');
  const device = String(b.device ?? '');
  if (!validName(name)) throw new Refusal(400, 'A username is 2 to 16 letters or digits.');
  if (!validPin(pin)) throw new Refusal(400, 'A PIN is 4 digits.');
  if (!/^[\w-]{8,64}$/.test(device)) throw new Refusal(400, 'This device could not be read. Reload and try again.');
  const key = nameKey(name);
  if ((await store.count(keys.tries(key), TRIES_SECONDS)) > TRIES) throw new Refusal(429, 'Too many tries for that username. Try again in a few minutes.');
  const salt = randomId(16);
  const fresh: Player = { name, salt, hash: await hashPin(pin, salt), created: Date.now() };
  let player = fresh;
  if (await store.set(keys.player(key), JSON.stringify(fresh), { nx: true })) {
    await store.hset(keys.names, key, name);
  } else {
    player = JSON.parse((await store.get(keys.player(key)))!) as Player;
    if ((await hashPin(pin, player.salt)) !== player.hash) throw new Refusal(403, 'That username is taken, or the PIN is wrong.');
    const devices = await devicesOf(store, key);
    if (!devices[device] && Object.keys(devices).length >= MAX_DEVICES) throw new Refusal(409, `That username is on ${MAX_DEVICES} devices already.`);
  }
  const token = randomId();
  await store.set(keys.token(await sha256(token)), JSON.stringify({ key, device } satisfies Session));
  return { token, name: player.name, others: others(await devicesOf(store, key), device) };
}

/** A device's stats as they stand: kept, put on the boards, and answered with the other devices'. */
export async function sync(store: Store, token: string | null, body: unknown, now = Date.now()): Promise<{ name: string; others: Snapshot }> {
  const me = await session(store, token);
  if (!me) throw new Refusal(401, 'Log in again with your username and PIN.');
  const { key, device } = me;
  const mine = cleanSnapshot(obj(body).snapshot);
  await store.hset(keys.devices(key), device, JSON.stringify({ ...mine, at: now } satisfies Kept));
  const devices = await devicesOf(store, key);
  const whole = together(Object.values(devices));
  const dates = nearDates(now);
  const standing = standingOf({ ...whole.stats, recorded: [] }, whole.run, dates);
  for (const date of dates) {
    const d = standing.daily[date];
    if (d) {
      await store.zadd(keys.board('daily', date), d.ms, key);
      await store.hset(keys.dailyMarks(date), key, JSON.stringify([d.mistakes, d.hints]));
    }
    if (standing.drun[date] !== undefined) await store.zadd(keys.board('drun', date), standing.drun[date], key);
  }
  if (standing.best > 0) await store.zadd(keys.board('best', ''), standing.best, key);
  if (standing.streak > 0) await store.zadd(keys.board('streak', ''), standing.streak, key);
  const name = (await store.hget(keys.names, key)) ?? key;
  return { name, others: others(devices, device) };
}

/** The four boards for a date, with the player asking marked, and added below when further down. */
export async function boards(store: Store, date: string, token: string | null): Promise<Boards> {
  if (!DATE_RE.test(date)) throw new Refusal(400, 'Which day?');
  const me = (await session(store, token))?.key ?? null;
  const out = { date } as Boards;
  for (const kind of BOARD_KINDS) {
    const key = keys.board(kind, date);
    const rev = !LOWEST_WINS[kind];
    const top: [string, number, number][] = (await store.zrange(key, 0, TOP - 1, rev)).map(([m, v], i) => [m, v, i + 1]);
    if (me && !top.some(([m]) => m === me)) {
      const rank = await store.zrank(key, me, rev);
      const score = rank === null ? null : await store.zscore(key, me);
      if (rank !== null && score !== null) top.push([me, score, rank + 1]);
    }
    const names = await store.hmget(keys.names, top.map(([m]) => m));
    const marks = kind === 'daily' ? await store.hmget(keys.dailyMarks(date), top.map(([m]) => m)) : [];
    const rows: BoardRow[] = [];
    let lastPlace = 0;
    for (let i = 0; i < top.length; i++) {
      const [member, value, place] = top[i];
      // Players level with the row above share its rank: 1, 1, 3.
      const prev = rows[i - 1];
      const rank = prev && prev.value === value && place === lastPlace + 1 ? prev.rank : place;
      lastPlace = place;
      const row: BoardRow = { rank, name: names[i] ?? member, value };
      if (kind === 'daily') {
        const [mistakes, hints] = (JSON.parse(marks[i] ?? '[0,0]') as number[]) ?? [0, 0];
        row.mistakes = mistakes;
        row.hints = hints;
      }
      if (member === me) row.you = true;
      rows.push(row);
    }
    // Players who share a rank are listed by name.
    out[kind] = rows.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
  }
  return out;
}
