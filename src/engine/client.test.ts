import { readFileSync } from 'node:fs';
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

  it('fetches the detector only when a job runs inline, so the first paint does not carry it', () => {
    const src = readFileSync(new URL('./client.ts', import.meta.url), 'utf8');
    // Types only: a value import of the jobs or the ladder would put the detector in the main bundle.
    expect(src).not.toMatch(/^import\s+(?!type\b)[^;]*from\s+'\.\/(jobs|ladder|patterns|index)'/m);
    expect(src).toContain("import('./jobs')");
  });
});
