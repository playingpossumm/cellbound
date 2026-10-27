// Text contrast of every theme and mode, read straight from the stylesheets.
// Interface text needs 4.5:1 on the page ground. Prism's digits and notes need
// 4.5:1 on its glass cells: the ink on plain glass, a given's pane and the
// selected and peer cells, a digit's hue (its pad key) and the grey notes on
// glass and the selected and peer cells, and the lit ink on every digit's hue,
// where a picked digit's cells and pencil marks light up.
import { describe, expect, it } from 'vitest';
import { contrast, oklabDistance, over, parseColor, resolve, rootVars, sizeVars, themeCss } from '../test/cssvars';
import type { Rgba } from '../test/cssvars';
import { themes } from './index';

const MODES = [false, true];

function colour(env: Record<string, string>, name: string, under?: Rgba): Rgba {
  const c = parseColor(resolve(name, env));
  if (!c) throw new Error(`cannot read ${name}`);
  return under && c[3] < 1 ? over(c, under) : c;
}

describe('contrast', () => {
  for (const { id } of themes) {
    for (const night of MODES) {
      const label = `${id} ${night ? 'dark' : 'light'}`;
      it(`${label}: interface text on the ground`, () => {
        const env = rootVars(themeCss(id), id, night);
        const ground = colour(env, '--cb-ground');
        for (const name of ['--cb-text', '--cb-text-dim', '--cb-accent']) {
          expect(contrast(colour(env, name, ground), ground), `${label} ${name}`).toBeGreaterThanOrEqual(4.5);
        }
      });
    }
  }
});

describe('Prism on glass', () => {
  const src = themeCss('prism');
  for (const night of MODES) {
    const label = night ? 'dark' : 'light';
    const env = rootVars(src, 'prism', night);
    const ground = colour(env, '--cb-ground');
    const glass = over(colour(env, '--pr-glass'), ground);
    const sel = over(colour(env, '--cb-sel'), glass);
    const peer = over(colour(env, '--cb-peer'), glass);
    const given = over(colour(env, '--pr-given'), glass);
    // Every digit's hue per board size: its pad key, and the tile its lit cells and pencil marks become.
    const hues = (size: number) => {
      const hue = { ...env, ...sizeVars(src, 'prism', night, size) };
      return Array.from({ length: size }, (_, i) => ({ name: `h${i + 1} on ${size}x${size}`, c: colour(hue, `--h${i + 1}`) }));
    };

    it(`${label}: the ink on glass, a given's pane and the selected and peer cells`, () => {
      const ink = colour(env, '--pr-text');
      for (const bg of [glass, given, sel, peer]) expect(contrast(ink, bg), label).toBeGreaterThanOrEqual(4.5);
      expect(contrast(colour(env, '--pr-err', ground), glass)).toBeGreaterThanOrEqual(4.5);
    });

    it(`${label}: every digit hue on glass, the selected and peer cells`, () => {
      for (const size of [4, 6, 9]) {
        for (const h of hues(size)) for (const bg of [glass, sel, peer]) expect(contrast(h.c, bg), `${label} ${h.name}`).toBeGreaterThanOrEqual(4.5);
      }
    });

    it(`${label}: a lit tile stands far clear of the glass and keeps its digit readable`, () => {
      const ink = colour(env, '--pr-lit-ink');
      for (const size of [4, 6, 9]) {
        for (const h of hues(size)) {
          expect(contrast(ink, h.c), `${label} ${h.name}`).toBeGreaterThanOrEqual(4.5);
          expect(oklabDistance(h.c, glass), `${label} ${h.name}`).toBeGreaterThanOrEqual(0.3);
        }
      }
      // A given's pane is plainly brighter glass, so givens read apart from the player's digits.
      expect(oklabDistance(given, glass), label).toBeGreaterThanOrEqual(0.04);
    });

    it(`${label}: notes on glass, the selected and peer cells`, () => {
      const note = colour(env, '--cb-note', glass);
      for (const bg of [glass, sel, peer]) expect(contrast(note, bg), label).toBeGreaterThanOrEqual(4.5);
    });

    it(`${label}: every two digit hues on one board are clearly different`, () => {
      for (const size of [4, 6, 9]) {
        const hue = { ...env, ...sizeVars(src, 'prism', night, size) };
        const list = Array.from({ length: size }, (_, i) => colour(hue, `--h${i + 1}`));
        let min = Infinity;
        for (let i = 0; i < size; i++) for (let j = i + 1; j < size; j++) min = Math.min(min, oklabDistance(list[i], list[j]));
        // 0.1 in OKLab is a difference anyone sees at a glance, even across a 9x9 board.
        expect(min, `${label} ${size}x${size}`).toBeGreaterThanOrEqual(0.1);
      }
    });
  }
});
