import { describe, expect, it } from 'vitest';
import { ALL_KINDS } from './generator';
import { generate, type Difficulty, type Size } from './index';

function median(xs: number[]): number {
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

describe('generation speed', () => {
  for (const [size, limit] of [[6, 1000], [9, 4000]] as [Size, number][]) {
    it(`${size}x${size} is fast enough`, () => {
      const times: number[] = [];
      for (const difficulty of [1, 2, 3, 4] as Difficulty[]) {
        for (let i = 0; i < 3; i++) {
          const t = performance.now();
          generate({ size, seed: `bench-${i}`, rules: ALL_KINDS, difficulty, fog: true });
          times.push(performance.now() - t);
        }
      }
      const med = median(times);
      const max = Math.max(...times);
      console.log(`${size}x${size}: median ${med.toFixed(0)} ms, max ${max.toFixed(0)} ms over ${times.length} puzzles`);
      expect(med).toBeLessThan(limit);
    }, 120000);
  }
});
