// How fast the Method badges fill: placements per tier over a whole run of nine boards, for the
// typical and expert players of calibrate.ts, as the plain detector scores them and as Microscope
// does, so the steps in src/game/badges.ts can be read as runs.
// Usage: npm run calibrate:badges [-- SEEDS]   (default 6 seeds; Easy, Normal and Hard)
import { generate } from '../src/engine';
import { classifyPlacement, hardestPlacement } from '../src/engine/techniques';
import { optionsFor, SLOT_COUNT } from '../src/modes/run/boards';
import { recordAs, type Style } from '../src/modes/run/calibrate';
import type { RunDifficulty } from '../src/modes/run/model';

const count = Number(process.argv[2] ?? 6);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
for (const level of ['easy', 'normal', 'hard'] as RunDifficulty[]) {
  for (const style of ['typical', 'expert'] as Style[]) {
    const plain: number[][] = [];
    const micro: number[][] = [];
    for (let k = 0; k < count; k++) {
      const seed = `free:badges${k + 1}`;
      const a = new Array<number>(9).fill(0);
      const b = new Array<number>(9).fill(0);
      for (let slot = 0; slot < SLOT_COUNT; slot++) {
        const p = generate(optionsFor(seed, slot, level));
        for (const m of recordAs(p, style, seed, classifyPlacement, hardestPlacement).moves) {
          a[m.cls.tier]++;
          b[(m.hard ?? m.cls).tier]++;
        }
      }
      plain.push(a);
      micro.push(b);
    }
    const row = (xs: number[][]) => Array.from({ length: 8 }, (_, t) => mean(xs.map((x) => x[t + 1])).toFixed(1)).join(' / ');
    console.log(`${level} ${style}: plain ${row(plain)} | Microscope ${row(micro)}`);
  }
}
