// Text contrast of every theme and mode, read straight from the stylesheets.
// Digits and notes need 4.5:1 on the board, on the selected cell and on the
// same-digit cell; interface text needs 4.5:1 on the page ground.
import { describe, expect, it } from 'vitest';
import { contrast, oklabDistance, over, parseColor, resolve, rootVars, sizeVars, themeCss } from '../test/cssvars';
import type { Rgba } from '../test/cssvars';

const ids = ['prism', 'letters'] as const;

function colour(env: Record<string, string>, name: string, under?: Rgba): Rgba {
  const c = parseColor(resolve(name, env));
  if (!c) throw new Error(`cannot read ${name}`);
  return under && c[3] < 1 ? over(c, under) : c;
}

describe('contrast', () => {
  for (const id of ids) {
    for (const night of [false, true]) {
      const label = `${id} ${night ? 'dark' : 'light'}`;
      const src = themeCss(id);
      const env = rootVars(src, id, night);
      const ground = colour(env, '--cb-ground');
      const boardRaw = parseColor(resolve('--cb-board', env));
      const board = boardRaw && boardRaw[3] > 0 ? over(boardRaw, ground) : ground;

      it(`${label}: interface text on the ground`, () => {
        for (const name of ['--cb-text', '--cb-text-dim', '--cb-accent']) {
          expect(contrast(colour(env, name, ground), ground), `${label} ${name}`).toBeGreaterThanOrEqual(4.5);
        }
      });

      if (id === 'prism') {
        it(`${label}: every digit hue on its own tinted glass, selected and peer cells`, () => {
          const glass = over(colour(env, '--pr-glass'), ground);
          const tint = parseFloat(resolve('--pr-tint', env) ?? '14') / 100;
          const sel = over(colour(env, '--cb-sel'), glass);
          const peer = over(colour(env, '--cb-peer'), glass);
          for (const size of [4, 6, 9]) {
            const hue = { ...env, ...sizeVars(src, id, night, size) };
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
        it(`${label}: every two digit hues on one board are clearly different`, () => {
          for (const size of [4, 6, 9]) {
            const hue = { ...env, ...sizeVars(src, id, night, size) };
            const list = Array.from({ length: size }, (_, i) => colour(hue, `--h${i + 1}`));
            let min = Infinity;
            for (let i = 0; i < size; i++) for (let j = i + 1; j < size; j++) min = Math.min(min, oklabDistance(list[i], list[j]));
            // 0.1 in OKLab is a difference anyone sees at a glance, even across a 9x9 board.
            expect(min, `${label} ${size}x${size}`).toBeGreaterThanOrEqual(0.1);
          }
        });
        continue;
      }

      it(`${label}: digits and notes on board, selected and same-digit cells`, () => {
        const cells: Rgba[] = [board, over(colour(env, '--cb-same', board), board), over(colour(env, '--cb-sel', board), board)];
        for (const name of ['--cb-ink', '--cb-mine', '--cb-hint', '--cb-note', '--cb-wrong']) {
          const c = colour(env, name, board);
          for (const bg of cells) expect(contrast(c, bg), `${label} ${name}`).toBeGreaterThanOrEqual(4.5);
        }
      });
    }
  }
});
