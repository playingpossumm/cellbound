// @vitest-environment jsdom
// The look a player gets: Prism for everyone. A save that names a look that was removed falls
// back to Prism, in storage as well as on screen, and keeps the player's other settings.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const KEY = 'cellbound:v1:settings';

async function load() {
  vi.resetModules();
  return (await import('./settings')).useSettings.getState();
}

const saved = () => JSON.parse(localStorage.getItem(KEY) ?? 'null') as { state: Record<string, unknown>; version: number } | null;
const save = (state: Record<string, unknown>, version = 1) => localStorage.setItem(KEY, JSON.stringify({ state, version }));

beforeEach(() => localStorage.clear());

describe('the look a player gets', () => {
  it('is Prism for a new player', async () => {
    expect((await load()).theme).toBe('prism');
  });

  it('is Prism for a player from before who never picked a look', async () => {
    // Saves from before, and no settings: these players were kept on Star atlas until it was removed.
    localStorage.setItem('cellbound:v1:stats', JSON.stringify({ state: { solves: { daily: 3 } }, version: 1 }));
    localStorage.setItem('cellbound:run:v1', '{}');
    expect((await load()).theme).toBe('prism');
    expect(localStorage.getItem('cellbound:v1:stats')).not.toBeNull();
  });

  it('turns a removed look into Prism, keeps the other settings and writes the change down', async () => {
    // Version 2 saves could name the last look to go; version 1 saves any of the earlier ones.
    const olds: [string, number][] = [['letters', 2], ['atlas', 1], ['paper', 1], ['washi', 1], ['swiss', 1]];
    for (const [old, version] of olds) {
      localStorage.clear();
      save({ theme: old, night: 'dark', mistakes: 'strict', hideTimer: true, reducedMotion: 'on' }, version);
      const s = await load();
      expect(s.theme, old).toBe('prism');
      expect([s.night, s.mistakes, s.hideTimer, s.reducedMotion], old).toEqual(['dark', 'strict', true, 'on']);
      expect(saved()?.state.theme, old).toBe('prism');
      expect(saved()?.state.night, old).toBe('dark');
      expect(saved()?.version, old).toBe(3);
    }
  });

  it('rewrites a version 2 save that was already on Prism, under the same key', async () => {
    save({ theme: 'prism', night: 'light' }, 2);
    const s = await load();
    expect([s.theme, s.night]).toEqual(['prism', 'light']);
    expect(saved()?.version).toBe(3);
    expect(Object.keys(localStorage)).toEqual([KEY]);
  });

  it('survives a damaged save', async () => {
    localStorage.setItem(KEY, '{"state":{"theme":42,"night":"dusk"},"version":1}');
    const s = await load();
    expect([s.theme, s.night]).toEqual(['prism', 'auto']);
  });
});
