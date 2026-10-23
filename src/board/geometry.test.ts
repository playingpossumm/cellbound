import { describe, expect, it } from 'vitest';
import { arrowPaths, cagePath, gridPaths, makeGeometry } from './geometry';

const six = makeGeometry({ size: 6, boxW: 3, boxH: 2 });

describe('board geometry', () => {
  it('measures cells and boxes', () => {
    expect(six.px).toBe(360);
    expect(six.center(7)).toEqual([90, 90]);
    expect(six.regionOf(0)).toBe(0);
    expect(six.regionOf(3)).toBe(1);
    expect(six.regionOf(12)).toBe(2);
  });

  it('draws thick lines on box edges only', () => {
    const { thin, thick } = gridPaths(six);
    expect(thick).toContain('M180 0V360');
    expect(thick).toContain('M0 120H360');
    expect(thin).toContain('M60 0V360');
    expect(thin).not.toContain('M180 0V360');
  });

  it('insets a cage outline, meeting at inner corners', () => {
    // An L of cells 4, 5, 11 on 6x6 (the look-study cage).
    const d = cagePath([4, 5, 11], 6, 60, 4);
    expect(d).toContain('M244 4H356');
    expect(d).toContain('M244 4V56');
    // The inner corner at (300, 60): the bottom edge of cell 4 runs to x 304.
    expect(d).toContain('M244 56H304');
    expect(d).toContain('M304 56V116');
  });

  it('starts an arrow at the circle edge and ends with a head', () => {
    const { shaft, head } = arrowPaths(six, 1, [8, 9], 24);
    expect(shaft.startsWith('M')).toBe(true);
    const [x, y] = shaft.slice(1).split(/[ L]/).map(Number);
    expect(Math.hypot(x - 90, y - 30)).toBeCloseTo(24, 0);
    expect(head.split('L')).toHaveLength(3);
  });
});
