// localStorage with a memory fallback, so private windows, blocked storage and
// tests in Node all work. Every read and write is guarded.
import { createJSONStorage, type PersistStorage, type StateStorage, type StorageValue } from 'zustand/middleware';

const memory = new Map<string, string>();

const safe = {
  getItem(name: string): string | null {
    try {
      if (typeof localStorage !== 'undefined') return localStorage.getItem(name);
    } catch {
      /* storage blocked */
    }
    return memory.get(name) ?? null;
  },
  setItem(name: string, value: string): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(name, value);
        return;
      }
    } catch {
      /* quota or blocked: keep it in memory */
    }
    memory.set(name, value);
  },
  removeItem(name: string): void {
    try {
      if (typeof localStorage !== 'undefined') localStorage.removeItem(name);
    } catch {
      /* ignore */
    }
    memory.delete(name);
  },
} satisfies StateStorage;

export const safeStorage = createJSONStorage(() => safe);

const flushers = new Set<() => void>();

/** Writes every pending debounced save now. */
export function flushStorage(): void {
  flushers.forEach((f) => f());
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushStorage);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushStorage();
  });
}

/**
 * Storage that serialises at most once per `delay` ms. The game store changes
 * every second while the clock runs; this keeps those writes cheap. Pending
 * writes flush when the page is hidden or closed.
 */
export function debouncedStorage<S>(delay = 700): PersistStorage<S> {
  const pending = new Map<string, StorageValue<S>>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    for (const [name, value] of pending) {
      try {
        safe.setItem(name, JSON.stringify(value));
      } catch {
        /* ignore */
      }
    }
    pending.clear();
  };
  flushers.add(flush);
  return {
    getItem(name) {
      const raw = safe.getItem(name);
      if (!raw) return null;
      try {
        return JSON.parse(raw) as StorageValue<S>;
      } catch {
        return null;
      }
    },
    setItem(name, value) {
      pending.set(name, value);
      if (!timer) timer = setTimeout(flush, delay);
    },
    removeItem(name) {
      pending.delete(name);
      safe.removeItem(name);
    },
  };
}

/** Test helper: forget everything kept in memory. */
export function clearMemoryStorage(): void {
  memory.clear();
}
