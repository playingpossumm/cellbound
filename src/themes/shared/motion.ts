// Reduced motion as the app defines it: the device setting or the in-app switch,
// which the app mirrors on <html data-reduced-motion>. One shared subscription
// serves every component that asks, however many digits are on the board.
import { useSyncExternalStore } from 'react';

export function prefersStill(): boolean {
  try {
    if (typeof document !== 'undefined' && document.documentElement.dataset.reducedMotion === 'true') return true;
    return (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  } catch {
    return false;
  }
}

const listeners = new Set<() => void>();
let stop: (() => void) | null = null;

function start(): void {
  const notify = (): void => listeners.forEach((l) => l());
  const mq = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  mq?.addEventListener('change', notify);
  const mo = new MutationObserver(notify);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-reduced-motion'] });
  stop = () => {
    mq?.removeEventListener('change', notify);
    mo.disconnect();
  };
}

function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) start();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      stop?.();
      stop = null;
    }
  };
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, prefersStill, () => false);
}
