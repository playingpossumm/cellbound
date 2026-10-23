// Theme registry: the six themes in picker order. The exports themes,
// DEFAULT_THEME and getTheme are the contract with the app.
import type { ThemeDef, ThemeId } from './types';
import { atlas } from './atlas';
import { paper } from './paper';
import { swiss } from './swiss';
import { prism } from './prism';
import { washi } from './washi';
import { letters } from './letters';

export const themes: ThemeDef[] = [atlas, paper, washi, swiss, prism, letters];

export const DEFAULT_THEME: ThemeId = 'atlas';

export function getTheme(id: ThemeId): ThemeDef {
  return themes.find((t) => t.id === id) ?? themes[0];
}
