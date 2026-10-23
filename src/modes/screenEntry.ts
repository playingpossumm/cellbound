import { useEffect, useRef, type RefObject } from 'react';

/**
 * Call on a full-screen page. When the page appears it scrolls to the top and, if nothing
 * else holds focus (the button that led here is gone), moves focus to the page itself, so
 * keyboard and screen reader users start at the top of the new screen.
 */
export function useScreenEntry<T extends HTMLElement>(): RefObject<T | null> {
  const ref = useRef<T>(null);
  useEffect(() => {
    document.scrollingElement?.scrollTo?.(0, 0);
    const active = document.activeElement;
    if (!active || active === document.body) ref.current?.focus({ preventScroll: true });
  }, []);
  return ref;
}
