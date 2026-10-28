// The dev server's leaderboard (vite.config.ts): Redis when the shell has its variables, else one
// store in memory that lasts as long as the server, so the e2e tests can join, sync and rank.
import { memoryStore, storeFromEnv, type Store } from './store';

let store: Store | null = null;

export function devStore(): Store {
  store ??= storeFromEnv(process.env) ?? memoryStore();
  return store;
}
