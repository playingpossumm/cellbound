// Player settings, persisted next to the game store.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_THEME, themes } from '../themes';
import type { ThemeId } from '../themes/types';
import { safeStorage } from './storage';

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

/**
 * Keeps only known values, so an old or edited save never breaks the app. A look that no longer
 * exists (every look but Prism) becomes the default look.
 */
export function sanitizeSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    theme: pick(r.theme, themes.map((t) => t.id), DEFAULT_SETTINGS.theme),
    night: pick(r.night, ['auto', 'light', 'dark'] as const, DEFAULT_SETTINGS.night),
    mistakes: pick(r.mistakes, ['off', 'conflicts', 'strict'] as const, DEFAULT_SETTINGS.mistakes),
    autoNotes: typeof r.autoNotes === 'boolean' ? r.autoNotes : DEFAULT_SETTINGS.autoNotes,
    highlights: typeof r.highlights === 'boolean' ? r.highlights : DEFAULT_SETTINGS.highlights,
    hideTimer: typeof r.hideTimer === 'boolean' ? r.hideTimer : DEFAULT_SETTINGS.hideTimer,
    reducedMotion: pick(r.reducedMotion, ['auto', 'on'] as const, DEFAULT_SETTINGS.reducedMotion),
  };
}

export const useSettings = create<SettingsStore>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      update: (patch) => set((s) => sanitizeSettings({ ...s, ...patch })),
      reset: () => set({ ...DEFAULT_SETTINGS }),
    }),
    {
      name: 'cellbound:v1:settings',
      // Version 3 has one look, Prism. Loading an older save runs migrate and writes the result
      // back, so a removed look is replaced in storage too, not only on screen.
      version: 3,
      storage: safeStorage,
      partialize: (s) => sanitizeSettings(s),
      migrate: (persisted) => sanitizeSettings(persisted),
      merge: (persisted, current) => ({ ...current, ...sanitizeSettings(persisted) }),
    },
  ),
);

export function getSettings(): Settings {
  return useSettings.getState();
}
