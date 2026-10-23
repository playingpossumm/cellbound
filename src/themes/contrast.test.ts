// Text contrast of every theme and mode, read straight from the stylesheets.
// Digits and notes need 4.5:1 on the board, on the selected cell and on the
// same-digit cell; interface text needs 4.5:1 on the page ground.
import { describe, expect, it } from 'vitest';
import { contrast, over, parseColor, resolve, rootVars, sizeVars, themeCss } from '../test/cssvars';
import type { Rgba } from '../test/cssvars';

const ids = ['atlas', 'paper', 'washi', 'swiss', 'prism', 'letters'] as const;

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
        continue;
      }

      it(`${label}: digits and notes on board, selected and same-digit cells`, () => {
        // Swiss paints the selected cell yellow and sets its digits in near black instead.
        const cells: Rgba[] = [board, over(colour(env, '--cb-same', board), board)];
        if (id !== 'swiss') cells.push(over(colour(env, '--cb-sel', board), board));
        for (const name of ['--cb-ink', '--cb-mine', '--cb-hint', '--cb-note', '--cb-wrong']) {
          const c = colour(env, name, board);
          for (const bg of cells) expect(contrast(c, bg), `${label} ${name}`).toBeGreaterThanOrEqual(4.5);
        }
      });

      if (id === 'swiss') {
        it(`${label}: digits on the colour blocks of finished boxes`, () => {
          for (const k of ['red', 'blue', 'yellow', 'ink']) {
            const on = colour(env, `--sw-on-${k}`);
            const bg = colour(env, `--sw-${k}`);
            // 9x9 digits on a phone are under the large-text size, so the full 4.5:1 applies.
            expect(contrast(on, bg), `${label} ${k}`).toBeGreaterThanOrEqual(4.5);
          }
        });
      }
    }
  }
});
