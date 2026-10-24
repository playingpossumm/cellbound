// Theme application: data-theme and data-night on <html>, fonts, reduced motion.
import { useEffect, useSyncExternalStore } from 'react';
import { getTheme } from '../themes';
import type { ThemeDef } from '../themes/types';
import { useSettings } from '../game/settings';

function media(q: string): MediaQueryList | null {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(q) : null;
}

function subscribeMedia(q: string) {
  return (cb: () => void) => {
    const m = media(q);
    m?.addEventListener('change', cb);
    return () => m?.removeEventListener('change', cb);
  };
}

const darkQ = '(prefers-color-scheme: dark)';
const lightQ = '(prefers-color-scheme: light)';
const motionQ = '(prefers-reduced-motion: reduce)';
const subDark = subscribeMedia(darkQ);
const subLight = subscribeMedia(lightQ);
const subMotion = subscribeMedia(motionQ);

/** Device colour scheme: true dark, false light, null no preference. */
function useDevicePrefersDark(): boolean | null {
  const dark = useSyncExternalStore(subDark, () => !!media(darkQ)?.matches, () => false);
  const light = useSyncExternalStore(subLight, () => !!media(lightQ)?.matches, () => false);
  return dark ? true : light ? false : null;
}

/** Whether a look shows its night variant, from the setting, the device and the look's default. */
export function useNightFor(theme: ThemeDef): boolean {
  const setting = useSettings((s) => s.night);
  const device = useDevicePrefersDark();
  if (setting === 'dark') return true;
  if (setting === 'light') return false;
  return device ?? theme.defaultNight;
}

/** Whether the night variant of the chosen look is on. */
export function useNight(): boolean {
  return useNightFor(getTheme(useSettings((s) => s.theme)));
}

export function useReducedMotion(): boolean {
  const setting = useSettings((s) => s.reducedMotion);
  const device = useSyncExternalStore(subMotion, () => !!media(motionQ)?.matches, () => false);
  return setting === 'on' || device;
}

function resolveNight(setting: 'auto' | 'light' | 'dark', defaultNight: boolean): boolean {
  if (setting === 'dark') return true;
  if (setting === 'light') return false;
  if (media(darkQ)?.matches) return true;
  if (media(lightQ)?.matches) return false;
  return defaultNight;
}

/** Sets the theme attributes before the first render, so the page never flashes the wrong look. */
export function applyThemeNow(): void {
  if (typeof document === 'undefined') return;
  const s = useSettings.getState();
  const theme = getTheme(s.theme);
  const html = document.documentElement;
  html.dataset.theme = theme.id;
  html.dataset.night = String(resolveNight(s.night, theme.defaultNight));
  html.dataset.reducedMotion = String(s.reducedMotion === 'on' || !!media(motionQ)?.matches);
}

/** Applies the active theme to <html> and loads its fonts. */
export function useApplyTheme(): void {
  const themeId = useSettings((s) => s.theme);
  const night = useNight();
  const reduced = useReducedMotion();
  const theme = getTheme(themeId);
  useEffect(() => {
    const html = document.documentElement;
    html.dataset.theme = theme.id;
    html.dataset.night = String(night);
    html.dataset.reducedMotion = String(reduced);
    html.style.colorScheme = night ? 'dark' : 'light';
    // The browser bar and the installed app's frame take the theme's ground colour.
    const ground = getComputedStyle(html).getPropertyValue('--cb-ground').trim();
    const meta = document.querySelector('meta[name="theme-color"]');
    if (ground && meta) meta.setAttribute('content', ground);
  }, [theme.id, night, reduced]);
  useEffect(() => {
    theme.loadFonts().catch(() => undefined);
  }, [theme]);
}
