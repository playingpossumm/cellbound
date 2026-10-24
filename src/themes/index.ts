// Theme registry: the six themes in picker order. The exports themes,
// DEFAULT_THEME and getTheme are the contract with the app.
import type { ThemeDef, ThemeId } from './types';
import { atlas } from './atlas';
import { paper } from './paper';
import { swiss } from './swiss';
import { prism } from './prism';
import { washi } from './washi';
import { letters } from './letters';

/** Picker order: the two favourite looks first, then the rest. */
export const themes: ThemeDef[] = [prism, letters, atlas, paper, washi, swiss];

/** The look a new player starts with. */
export const DEFAULT_THEME: ThemeId = 'prism';

/**
 * The look every player had before Prism became the default. A player with saves from that
 * time who never picked a look keeps this one, so an update never changes a look under them.
 */
export const LEGACY_DEFAULT_THEME: ThemeId = 'atlas';

export function getTheme(id: ThemeId): ThemeDef {
  return themes.find((t) => t.id === id) ?? themes[0];
}
