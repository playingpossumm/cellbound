// The Run's colour tokens carry meaning in text (marks, mult, coins, the reward categories and the
// technique tiers), so each must read at 4.5:1 on the ground, on glass and on the popup panel, in
// light and in dark.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { contrast, over, parseColor, rootVars, themeCss } from '../../test/cssvars';

const runCss = readFileSync(fileURLToPath(new URL('./run.css', import.meta.url)), 'utf8');
const TOKENS = ['--rn-marks', '--rn-mult', '--rn-coins', '--rn-hearts', '--rn-hints', '--rn-violet', '--rn-score', ...[1, 2, 3, 4, 5, 6, 7, 8].map((t) => `--rn-t${t}`)];

describe('Run colours', () => {
  for (const night of [false, true]) {
    const mode = night ? 'dark' : 'light';
    const prism = rootVars(themeCss('prism'), 'prism', night);
    const run = rootVars(runCss, 'prism', night);
    const ground = parseColor(prism['--cb-ground'])!;
    const glass = over(parseColor(prism['--pr-glass'])!, ground);
    const panel = over(parseColor(run['--rn-panel'])!, ground);

    it(`reads at 4.5:1 or better on the ground, glass and the popup panel, ${mode}`, () => {
      for (const token of TOKENS) {
        const c = parseColor(run[token]);
        expect(c, `${token} ${mode}`).not.toBeNull();
        for (const [name, bg] of [['ground', ground], ['glass', glass], ['panel', panel]] as const) {
          expect(contrast(c!, bg), `${token} on ${name}, ${mode}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    });
  }
});
