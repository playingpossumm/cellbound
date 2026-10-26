import { describe, expect, it } from 'vitest';
import { EM_DASH } from '../test/copy';
import { rootVars, themeCss } from '../test/cssvars';
import { DEFAULT_THEME, getTheme, themes } from './index';
import { cellsLoops, cellsOutline, wavePath } from './shared/util';

const REQUIRED = [
  'ground', 'board', 'ink', 'mine', 'hint', 'note', 'wrong', 'peer', 'same', 'sel', 'sel-ring', 'focus',
  'line-thin', 'line-box', 'frame', 'clue', 'clue-strong', 'clue-fill', 'text', 'text-dim', 'accent',
  'font-ui', 'font-digit',
].map((n) => `--cb-${n}`);

describe('theme registry', () => {
  it('has Prism, the default look, and nothing else', () => {
    expect(themes.map((t) => t.id)).toEqual(['prism']);
    expect(DEFAULT_THEME).toBe('prism');
    // An id from an old save that slipped past the settings falls back to the default look.
    expect(getTheme('letters' as never).id).toBe('prism');
  });

  it('describes each theme in one plain line', () => {
    for (const t of themes) {
      expect(t.name.length).toBeGreaterThan(2);
      expect(t.blurb).not.toContain('\n');
      expect(t.blurb).not.toContain(EM_DASH);
      expect(typeof t.loadFonts).toBe('function');
      expect(typeof t.Band).toBe('function');
    }
  });

  it('opens Prism in night mode', () => {
    expect(getTheme('prism').defaultNight).toBe(true);
  });
});

describe('theme stylesheets', () => {
  for (const { id } of themes) {
    for (const night of [false, true]) {
      it(`${id} sets every --cb variable in ${night ? 'dark' : 'light'}`, () => {
        const vars = rootVars(themeCss(id), id, night);
        for (const name of REQUIRED) expect(vars[name], `${id} ${name}`).toBeTruthy();
      });
    }
  }
});

describe('shape helpers', () => {
  it('outlines a block of cells as one inset rectangle', () => {
    const loops = cellsLoops([0, 1, 6, 7], 6, 60, 4);
    expect(loops).toHaveLength(1);
    const xs = loops[0].map((p) => p[0]);
    const ys = loops[0].map((p) => p[1]);
    expect(Math.min(...xs)).toBeCloseTo(4);
    expect(Math.max(...xs)).toBeCloseTo(116);
    expect(Math.min(...ys)).toBeCloseTo(4);
    expect(Math.max(...ys)).toBeCloseTo(116);
    expect(loops[0]).toHaveLength(4);
  });

  it('follows the bend of an L shaped cage and splits apart cells', () => {
    expect(cellsLoops([0, 6, 7], 6, 60, 4)[0]).toHaveLength(6);
    expect(cellsLoops([0, 14], 6, 60, 4)).toHaveLength(2);
    expect(cellsOutline([0], 6, 60, 4)).toMatch(/^M.*Z$/);
  });

  it('draws a wavy line that ends where the polyline ends', () => {
    const d = wavePath([[0, 0], [100, 0]], 2, 20);
    expect(d.startsWith('M0 0')).toBe(true);
    expect(d.endsWith('100 0')).toBe(true);
  });
});
