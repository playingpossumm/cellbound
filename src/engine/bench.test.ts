import { describe, expect, it } from 'vitest';
import { dayNumber } from './daily';
import { generateDaily } from './dailygen';
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

  it('a week of 9x9 Dailies is fast enough to make on the device', () => {
    // A week past the stored months, so every day is made from scratch.
    const monday = dayNumber('2031-03-03');
    const times: number[] = [];
    for (let i = 0; i < 7; i++) {
      const t = performance.now();
      generateDaily(new Date((monday + i) * 86400000).toISOString().slice(0, 10));
      times.push(performance.now() - t);
    }
    console.log(`9x9 Dailies: ${times.map((t) => t.toFixed(0)).join(', ')} ms, Monday to Sunday`);
    expect(Math.max(...times)).toBeLessThan(4000);
  }, 120000);
});
