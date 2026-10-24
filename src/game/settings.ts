// Player settings, persisted next to the game store.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_THEME, LEGACY_DEFAULT_THEME, themes } from '../themes';
import type { ThemeId } from '../themes/types';
import { safeStorage } from './storage';

/** Saves that only a player from before this version can have. The settings key is not one: it is written only on a change. */
const PLAYER_KEYS = ['cellbound:v1', 'cellbound:v1:stats', 'cellbound:v1:free', 'cellbound:run:v1', 'cellbound:learn:v1'];

/** True when this browser already holds a game, stats, a run or lessons: the player is not new. */
export function hasPlayedBefore(storage: Pick<Storage, 'getItem'> | null = typeof localStorage === 'undefined' ? null : localStorage): boolean {
  try {
    return !!storage && PLAYER_KEYS.some((k) => storage.getItem(k) !== null);
  } catch {
    return false;
  }
}

export type NightSetting = 'auto' | 'light' | 'dark';
export type MistakeSetting = 'off' | 'conflicts' | 'strict';
export type MotionSetting = 'auto' | 'on';

export interface Settings {
  theme: ThemeId;
  night: NightSetting;
  mistakes: MistakeSetting;
  autoNotes: boolean;
  highlights: boolean;
  hideTimer: boolean;
  /** 'on' forces reduced motion; 'auto' follows the device. */
  reducedMotion: MotionSetting;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: DEFAULT_THEME,
  night: 'auto',
  mistakes: 'conflicts',
  autoNotes: false,
  highlights: true,
  hideTimer: false,
  reducedMotion: 'auto',
};

interface SettingsStore extends Settings {
  update(patch: Partial<Settings>): void;
  reset(): void;
}

const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;

/** Keeps only known values, so an old or edited save never breaks the app. */
export function sanitizeSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const themeIds = themes.map((t) => t.id);
  return {
    theme: pick(r.theme, ['atlas', 'paper', 'washi', 'swiss', 'prism', 'letters'] as const, DEFAULT_SETTINGS.theme),
    night: pick(r.night, ['auto', 'light', 'dark'] as const, DEFAULT_SETTINGS.night),
    mistakes: pick(r.mistakes, ['off', 'conflicts', 'strict'] as const, DEFAULT_SETTINGS.mistakes),
    autoNotes: typeof r.autoNotes === 'boolean' ? r.autoNotes : DEFAULT_SETTINGS.autoNotes,
    highlights: typeof r.highlights === 'boolean' ? r.highlights : DEFAULT_SETTINGS.highlights,
    hideTimer: typeof r.hideTimer === 'boolean' ? r.hideTimer : DEFAULT_SETTINGS.hideTimer,
    reducedMotion: pick(r.reducedMotion, ['auto', 'on'] as const, DEFAULT_SETTINGS.reducedMotion),
    ...(themeIds.length && !themeIds.includes(r.theme as ThemeId) ? { theme: DEFAULT_SETTINGS.theme } : {}),
  };
}

/** The look to write down after loading, when nothing was saved yet. */
let firstLook: ThemeId | null = null;

export const useSettings = create<SettingsStore>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      update: (patch) => set((s) => sanitizeSettings({ ...s, ...patch })),
      reset: () => set({ ...DEFAULT_SETTINGS }),
    }),
    {
      name: 'cellbound:v1:settings',
      version: 1,
      storage: safeStorage,
      partialize: (s) => sanitizeSettings(s),
      migrate: (persisted) => sanitizeSettings(persisted),
      merge: (persisted, current) => {
        if (persisted == null) {
          // Nothing saved yet. A new player gets the default look; a player who has played before
          // the default changed never picked a look, so they keep the one they have been playing.
          firstLook = hasPlayedBefore() ? LEGACY_DEFAULT_THEME : current.theme;
          return { ...current, theme: firstLook };
        }
        return { ...current, ...sanitizeSettings(persisted) };
      },
    },
  ),
);

// Write the starting look down at once. Otherwise a new player's first game would make the next
// visit look like a player from before, and the look would change under them.
if (firstLook) useSettings.setState({ theme: firstLook });

export function getSettings(): Settings {
  return useSettings.getState();
}
