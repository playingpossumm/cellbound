// Theme registry. STUB with one plain theme; the themes agent replaces it with
// the six themes and keeps the exports.
import { createElement } from 'react';
import type { ThemeDef, ThemeId } from './types';

const stub: ThemeDef = {
  id: 'atlas',
  name: 'Star atlas',
  blurb: 'Ink-blue chart paper, gold hairlines, a slow star field.',
  defaultNight: true,
  loadFonts: async () => undefined,
  Band: ({ title, subtitle, time }) =>
    createElement('div', { className: 'cb-band-stub' }, `${title} · ${subtitle} · ${time}`),
};

export const themes: ThemeDef[] = [stub];

export const DEFAULT_THEME: ThemeId = 'atlas';

export function getTheme(id: ThemeId): ThemeDef {
  return themes.find((t) => t.id === id) ?? themes[0];
}
