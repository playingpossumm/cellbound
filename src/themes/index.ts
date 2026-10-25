// Theme registry: the two looks in picker order. The exports themes,
// DEFAULT_THEME and getTheme are the contract with the app.
import type { ThemeDef, ThemeId } from './types';
import { prism } from './prism';
import { letters } from './letters';

/** Picker order: the default look first. */
export const themes: ThemeDef[] = [prism, letters];

/** The look a new player starts with, and the one a save naming a look that no longer exists falls back to. */
export const DEFAULT_THEME: ThemeId = 'prism';

export function getTheme(id: ThemeId): ThemeDef {
  return themes.find((t) => t.id === id) ?? themes[0];
}
