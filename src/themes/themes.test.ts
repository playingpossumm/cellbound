import { describe, expect, it } from 'vitest';
import { EM_DASH } from '../test/copy';
import { rootVars, themeCss } from '../test/cssvars';
import { DEFAULT_THEME, getTheme, themes } from './index';
import { buildItems, project } from './letters/cube';
import { mastheadFor } from './paper';
import { cellsLoops, cellsOutline, simplify, wavePath } from './shared/util';

const ids = ['atlas', 'paper', 'washi', 'swiss', 'prism', 'letters'] as const;

const REQUIRED = [
  'ground', 'board', 'ink', 'mine', 'hint', 'note', 'wrong', 'peer', 'same', 'sel', 'sel-ring', 'focus',
  'line-thin', 'line-box', 'frame', 'clue', 'clue-strong', 'clue-fill', 'text', 'text-dim', 'accent',
  'font-ui', 'font-digit',
].map((n) => `--cb-${n}`);

describe('theme registry', () => {
  it('lists the six themes in picker order', () => {
    expect(themes.map((t) => t.id)).toEqual([...ids]);
    expect(DEFAULT_THEME).toBe('atlas');
    expect(getTheme('prism').id).toBe('prism');
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

  it('opens atlas and prism in night mode and the rest in day mode', () => {
    expect(themes.filter((t) => t.defaultNight).map((t) => t.id)).toEqual(['atlas', 'prism']);
  });
});

describe('theme stylesheets', () => {
  for (const id of ids) {
    for (const night of [false, true]) {
      it(`${id} sets every --cb variable in ${night ? 'dark' : 'light'}`, () => {
        const vars = rootVars(themeCss(id), id, night);
        for (const name of REQUIRED) expect(vars[name], `${id} ${name}`).toBeTruthy();
      });
    }
  }

});

describe('paper masthead', () => {
  it('names every mode in the voice of a newspaper', () => {
    expect(mastheadFor('Daily')).toBe('The Daily Puzzle');
    expect(mastheadFor('Run')).toBe('The Run Gazette');
    expect(mastheadFor('Learn')).toBe('The Learning Column');
    expect(mastheadFor('Fog')).toBe('The Fog Report');
    expect(mastheadFor('Free play')).toBe('The Free Play Edition');
  });

  it('falls back to "The Title Puzzle" for a title it does not know', () => {
    expect(mastheadFor('night owl')).toBe('The Night Owl Puzzle');
  });
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

  it('drops points on a straight run', () => {
    expect(simplify([[0, 0], [1, 0], [2, 0], [2, 1]])).toEqual([[0, 0], [2, 0], [2, 1]]);
  });

  it('draws a wavy line that ends where the polyline ends', () => {
    const d = wavePath([[0, 0], [100, 0]], 2, 20);
    expect(d.startsWith('M0 0')).toBe(true);
    expect(d.endsWith('100 0')).toBe(true);
  });
});

describe('letters cube', () => {
  it('has one letter per placed digit plus the twelve edges', () => {
    const values = Array.from({ length: 36 }, (_, i) => (i % 3 === 0 ? (i % 6) + 1 : 0));
    const placed = values.filter(Boolean).length;
    expect(buildItems(values, 6)).toHaveLength(placed + 12 * 6);
    expect(buildItems(Array(81).fill(0), 9)).toHaveLength(12 * 9);
    expect(buildItems(Array(16).fill(0), 4)).toHaveLength(12 * 4);
  });

  it('projects every letter to finite numbers and lights the layer the band is on', () => {
    const items = buildItems(Array.from({ length: 36 }, (_, i) => (i % 6) + 1), 6);
    for (const it of items) {
      const v = project(it, 6, 3.2, 0.1);
      for (const n of [v.tx, v.ty, v.fs, v.o, v.z]) expect(Number.isFinite(n)).toBe(true);
    }
    // At t = 0 the band sits at layer -1, so the first digit layer is only just lit.
    const first = items.find((it) => it.layer === 0)!;
    expect(project(first, 6, 2, 0).hot).toBe(true);
    expect(project(first, 6, 6, 0).hot).toBe(false);
  });
});
