// The player's name on the leaderboard, on this device: the token that signs the device in, the
// device's own id, and what the player's other devices hold. A device sends its own stats as they
// stand (server/leaderboard.ts keeps one copy per device), when the app opens, after each game and
// when the app comes back into view; it shows its own stats with the others' added in. A device
// with no name plays as before, and nothing leaves it.
import { useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { onGameEnd } from '../game/store';
import { useStats, type StatsData } from '../game/stats';
import { safeStorage } from '../game/storage';
import type { RunStats } from '../modes/run/stats';
import { mergeRunStats, mergeStats } from './merge';
import { BLANK_RUN, cleanName, validName, validPin, type Boards, type Snapshot } from './rules';

/** The Run's save (RUN_KEY in modes/run/storage.ts), read here without loading the Run. */
const RUN_SAVE = 'cellbound:run:v2';
/** A sync waits this long after a game ends, so the Run has saved its stats. */
const SETTLE_MS = 2500;

interface Account {
  /** This device, for the server's copy of its stats. Made once, kept when signing out. */
  device: string;
  name: string | null;
  token: string | null;
  /** What the player's other devices held at the last sync. */
  others: Snapshot | null;
}

const newDevice = () => {
  const bytes = new Uint8Array(16);
  try {
    crypto.getRandomValues(bytes);
  } catch {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
};

export const useAccount = create<Account>()(
  persist((): Account => ({ device: newDevice(), name: null, token: null, others: null }), {
    name: 'cellbound:v1:account',
    version: 1,
    storage: safeStorage,
  }),
);

export class LeaderboardError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { token } = useAccount.getState();
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers },
    });
  } catch {
    throw new LeaderboardError(0, 'The leaderboard could not be reached.');
  }
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new LeaderboardError(res.status, body.error ?? 'The leaderboard could not be reached.');
  return body;
}

/** This device's own stats, as the server keeps them. */
export function snapshotOf(stats: StatsData, run: RunStats): Snapshot {
  const { solves, fails, times, daily } = stats;
  return { stats: { solves, fails, times, daily }, run };
}

/** The Run's stats from its save, or none yet. */
function savedRunStats(): RunStats {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(RUN_SAVE) : null;
    const stats = raw ? (JSON.parse(raw) as { stats?: RunStats }).stats : undefined;
    return stats && typeof stats === 'object' ? { ...BLANK_RUN, ...stats } : BLANK_RUN;
  } catch {
    return BLANK_RUN;
  }
}

/** Joins with a name and PIN: a new name, or the player's own on another device. */
export async function joinLeaderboard(name: string, pin: string): Promise<void> {
  if (!validName(name)) throw new LeaderboardError(400, 'A username is 2 to 16 letters or digits.');
  if (!validPin(pin)) throw new LeaderboardError(400, 'A PIN is 4 digits.');
  const { device } = useAccount.getState();
  const r = await call<{ token: string; name: string; others: Snapshot }>('/api/join', { method: 'POST', body: JSON.stringify({ name: cleanName(name), pin, device }) });
  useAccount.setState({ token: r.token, name: r.name, others: r.others });
  await syncLeaderboard();
}

/** Leaves the leaderboard on this device. The player's scores stay on it, and on their other devices. */
export function leaveLeaderboard(): void {
  useAccount.setState({ token: null, name: null, others: null });
}

let inFlight: Promise<void> | null = null;

/** Sends this device's stats and takes back the other devices'. Quiet when offline. */
export function syncLeaderboard(): Promise<void> {
  if (!useAccount.getState().token) return Promise.resolve();
  inFlight ??= (async () => {
    try {
      const snapshot = snapshotOf(useStats.getState(), savedRunStats());
      const r = await call<{ name: string; others: Snapshot }>('/api/sync', { method: 'POST', body: JSON.stringify({ snapshot }) });
      useAccount.setState({ name: r.name, others: r.others });
    } catch (e) {
      // A token the server no longer knows signs this device out; anything else waits for the next sync.
      if (e instanceof LeaderboardError && e.status === 401) leaveLeaderboard();
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/** Today's boards, with this device's player marked. */
export function fetchBoards(date: string): Promise<Boards> {
  return call<Boards>(`/api/board?date=${encodeURIComponent(date)}`);
}

/** The player's stats on every device: this one's, with the others' added in. */
export function useAllStats(): StatsData {
  const mine = useStats();
  const others = useAccount((s) => s.others);
  return useMemo(() => (others ? mergeStats(mine, { ...others.stats, recorded: [] }) : mine), [mine, others]);
}

/** The Run's stats on every device. */
export function allRunStats(mine: RunStats, others: Snapshot | null = useAccount.getState().others): RunStats {
  return others ? mergeRunStats(mine, others.run) : mine;
}

// Syncs when the app opens, a while after each game ends, and when the app comes back into view.
let settle: ReturnType<typeof setTimeout> | undefined;
function soon() {
  clearTimeout(settle);
  settle = setTimeout(() => void syncLeaderboard(), SETTLE_MS);
}
if (typeof window !== 'undefined') {
  onGameEnd(soon);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') soon();
  });
  soon();
}
