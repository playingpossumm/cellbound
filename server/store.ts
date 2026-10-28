// Where the leaderboard keeps its data: Redis, through Upstash's REST API in production, or a copy
// in memory for the dev server and the tests. Only the few commands the leaderboard uses.

export interface Store {
  get(key: string): Promise<string | null>;
  /** Sets a key; with nx only when it is not there yet. True when it was set. */
  set(key: string, value: string, opts?: { nx?: boolean }): Promise<boolean>;
  hget(key: string, field: string): Promise<string | null>;
  hmget(key: string, fields: string[]): Promise<(string | null)[]>;
  hset(key: string, field: string, value: string): Promise<void>;
  hdel(key: string, field: string): Promise<void>;
  hgetall(key: string): Promise<Record<string, string>>;
  zadd(key: string, score: number, member: string): Promise<void>;
  /** Members and scores from start to stop, lowest first, or highest first with rev. */
  zrange(key: string, start: number, stop: number, rev: boolean): Promise<[string, number][]>;
  zrank(key: string, member: string, rev: boolean): Promise<number | null>;
  zscore(key: string, member: string): Promise<number | null>;
  zcard(key: string): Promise<number>;
  /** Adds one to a counter that lasts ttl seconds from its first count. */
  count(key: string, ttl: number): Promise<number>;
}

/** Redis over Upstash's REST API: one command per request, as JSON. */
export function redisStore(url: string, token: string): Store {
  const call = async (...cmd: (string | number)[]): Promise<unknown> => {
    const res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(cmd) });
    const body = (await res.json()) as { result?: unknown; error?: string };
    if (!res.ok || body.error) throw new Error(`redis ${String(cmd[0])}: ${body.error ?? res.status}`);
    return body.result ?? null;
  };
  const pairs = (flat: unknown): [string, number][] => {
    const a = (flat as string[]) ?? [];
    const out: [string, number][] = [];
    for (let i = 0; i + 1 < a.length; i += 2) out.push([a[i], Number(a[i + 1])]);
    return out;
  };
  return {
    get: async (k) => (await call('GET', k)) as string | null,
    set: async (k, v, o) => (await call('SET', k, v, ...(o?.nx ? ['NX'] : []))) === 'OK',
    hget: async (k, f) => (await call('HGET', k, f)) as string | null,
    hmget: async (k, fs) => (fs.length ? ((await call('HMGET', k, ...fs)) as (string | null)[]) : []),
    hset: async (k, f, v) => void (await call('HSET', k, f, v)),
    hdel: async (k, f) => void (await call('HDEL', k, f)),
    hgetall: async (k) => {
      const flat = ((await call('HGETALL', k)) as string[]) ?? [];
      const out: Record<string, string> = {};
      for (let i = 0; i + 1 < flat.length; i += 2) out[flat[i]] = flat[i + 1];
      return out;
    },
    zadd: async (k, s, m) => void (await call('ZADD', k, s, m)),
    zrange: async (k, a, b, rev) => pairs(await call('ZRANGE', k, a, b, ...(rev ? ['REV'] : []), 'WITHSCORES')),
    zrank: async (k, m, rev) => {
      const r = await call(rev ? 'ZREVRANK' : 'ZRANK', k, m);
      return r === null ? null : Number(r);
    },
    zscore: async (k, m) => {
      const r = await call('ZSCORE', k, m);
      return r === null ? null : Number(r);
    },
    zcard: async (k) => Number(await call('ZCARD', k)),
    count: async (k, ttl) => {
      const n = Number(await call('INCR', k));
      if (n === 1) await call('EXPIRE', k, ttl);
      return n;
    },
  };
}

/** The same commands over Maps, for the dev server and the tests. */
export function memoryStore(): Store {
  const strings = new Map<string, string>();
  const hashes = new Map<string, Map<string, string>>();
  const sets = new Map<string, Map<string, number>>();
  const counters = new Map<string, { n: number; until: number }>();
  const hash = (k: string) => hashes.get(k) ?? hashes.set(k, new Map()).get(k)!;
  const zset = (k: string) => sets.get(k) ?? sets.set(k, new Map()).get(k)!;
  // Redis orders equal scores by member, so the same goes here.
  const sorted = (k: string, rev: boolean) =>
    [...zset(k).entries()].sort((a, b) => (a[1] - b[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)) * (rev ? -1 : 1));
  return {
    get: async (k) => strings.get(k) ?? null,
    set: async (k, v, o) => {
      if (o?.nx && strings.has(k)) return false;
      strings.set(k, v);
      return true;
    },
    hget: async (k, f) => hash(k).get(f) ?? null,
    hmget: async (k, fs) => fs.map((f) => hash(k).get(f) ?? null),
    hset: async (k, f, v) => void hash(k).set(f, v),
    hdel: async (k, f) => void hash(k).delete(f),
    hgetall: async (k) => Object.fromEntries(hash(k)),
    zadd: async (k, s, m) => void zset(k).set(m, s),
    zrange: async (k, a, b, rev) => {
      const all = sorted(k, rev);
      return all.slice(a, b < 0 ? all.length + b + 1 : b + 1);
    },
    zrank: async (k, m, rev) => {
      const i = sorted(k, rev).findIndex(([x]) => x === m);
      return i < 0 ? null : i;
    },
    zscore: async (k, m) => zset(k).get(m) ?? null,
    zcard: async (k) => zset(k).size,
    count: async (k, ttl) => {
      const now = Date.now();
      const c = counters.get(k);
      const next = c && c.until > now ? { n: c.n + 1, until: c.until } : { n: 1, until: now + ttl * 1000 };
      counters.set(k, next);
      return next.n;
    },
  };
}

/** Redis when the deployment has it (Vercel's Upstash integration sets these), else nothing. */
export function storeFromEnv(env: Record<string, string | undefined>): Store | null {
  const url = env.KV_REST_API_URL ?? env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN ?? env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? redisStore(url, token) : null;
}
