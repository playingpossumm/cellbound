import { describe, expect, it } from 'vitest';
import { moves, springValues } from './motion';

describe('motion', () => {
  it('samples a spring that overshoots a little and settles on its target', () => {
    // The digit's landing: from 78 percent, k 520, c 22.
    const { xs, ms } = springValues(0.78, 1, 520, 22);
    expect(xs[0]).toBe(0.78);
    expect(xs.at(-1)).toBe(1);
    const peak = Math.max(...xs);
    expect(peak).toBeGreaterThan(1.02);
    expect(peak).toBeLessThan(1.05);
    expect(ms).toBeGreaterThan(400);
    expect(ms).toBeLessThan(600);
  });

  it('gives a stiffer spring a shorter life', () => {
    expect(springValues(0.94, 1, 700, 20).ms).toBeLessThan(springValues(0, 1, 260, 21).ms);
  });

  it('stays still where the page cannot animate', () => {
    expect(moves()).toBe(false);
  });
});
