// Theme registry. Prism is the one look; another would be one more entry here and one more
// ThemeId. The exports themes, DEFAULT_THEME and getTheme are the contract with the app.
import type { ThemeDef, ThemeId } from './types';
import { prism } from './prism';

/** Every look, the default first. */
export const themes: ThemeDef[] = [prism];

/** The look a new player starts with, and the one a save naming a look that no longer exists falls back to. */
export const DEFAULT_THEME: ThemeId = 'prism';

export function getTheme(id: ThemeId): ThemeDef {
  return themes.find((t) => t.id === id) ?? themes[0];
}
