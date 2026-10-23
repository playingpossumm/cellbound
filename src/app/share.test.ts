import { describe, expect, it } from 'vitest';
import { decodeFree, encodeFree } from './share';

describe('challenge links', () => {
  it('round-trips free play options and seed', () => {
    const o = { size: 9 as const, rules: ['thermo', 'xv'] as ('thermo' | 'xv')[], difficulty: 4 as const, seed: 'abc123' };
    const code = encodeFree(o);
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeFree(code)).toEqual(o);
  });

  it('rejects broken codes', () => {
    expect(decodeFree('not json')).toBeNull();
    expect(decodeFree(encodeFree({ size: 6, rules: [], difficulty: 2, seed: '' }))).toBeNull();
  });
});
