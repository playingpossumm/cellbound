// Text contrast of every theme and mode, read straight from the stylesheets.
// Interface text needs 4.5:1 on the page ground. Prism's digits and notes need
// 4.5:1 on its glass cells: a digit on its own tint, the selected cell and the
// peer cell, and a note on plain glass and on those same cells.
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
    const same = over(colour(env, '--cb-same'), glass);

    it(`${label}: every digit hue on its own tinted glass, selected and peer cells`, () => {
      const tint = parseFloat(resolve('--pr-tint', env) ?? '14') / 100;
      for (const size of [4, 6, 9]) {
        const hue = { ...env, ...sizeVars(src, 'prism', night, size) };
        for (let i = 1; i <= size; i++) {
          const c = colour(hue, `--h${i}`);
          const tinted = over([c[0], c[1], c[2], tint], glass);
          for (const bg of [tinted, sel, peer]) {
            expect(contrast(c, bg), `${label} h${i} on ${size}x${size}`).toBeGreaterThanOrEqual(4.5);
          }
        }
      }
      expect(contrast(colour(env, '--pr-err', ground), glass)).toBeGreaterThanOrEqual(4.5);
    });

    it(`${label}: notes on glass, selected, peer and same-digit cells`, () => {
      const note = colour(env, '--cb-note', glass);
      for (const bg of [glass, sel, peer, same]) expect(contrast(note, bg), label).toBeGreaterThanOrEqual(4.5);
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
