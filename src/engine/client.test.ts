import { describe, expect, it } from 'vitest';
import { generateAsync } from './client';
import { ALL_KINDS } from './generator';
import { generate } from './index';

describe('client', () => {
  it('runs inline when Worker is not available and matches generate', async () => {
    expect(typeof Worker).toBe('undefined');
    const opts = { size: 6 as const, seed: 'client', rules: ALL_KINDS, difficulty: 2 as const, fog: true };
    const [a, b] = await Promise.all([generateAsync(opts), generateAsync({ ...opts, seed: 'client-2' })]);
    expect(a).toEqual(generate(opts));
    expect(a.fog).toBeDefined();
    expect(b.seed).toBe('client-2');
  });
});
