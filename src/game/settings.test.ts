// @vitest-environment jsdom
// The look a player starts with: Prism for a new player, and the look they had for a player
// from before Prism became the default.
import { beforeEach, describe, expect, it, vi } from 'vitest';

async function load() {
  vi.resetModules();
  return (await import('./settings')).useSettings.getState();
}

const saved = () => JSON.parse(localStorage.getItem('cellbound:v1:settings') ?? 'null') as { state: { theme: string } } | null;

beforeEach(() => localStorage.clear());

describe('the starting look', () => {
  it('is Prism for a new player, written down at once so their first game cannot change it', async () => {
    expect((await load()).theme).toBe('prism');
    expect(saved()?.state.theme).toBe('prism');
    // The next visit finds a game save, and the look stays Prism.
    localStorage.setItem('cellbound:v1', '{"state":{"games":{}},"version":1}');
    expect((await load()).theme).toBe('prism');
  });

  it('stays Star atlas for a player with saves from before, and is written down', async () => {
    localStorage.setItem('cellbound:v1:stats', JSON.stringify({ state: { solves: { daily: 3 } }, version: 1 }));
    expect((await load()).theme).toBe('atlas');
    expect(saved()?.state.theme).toBe('atlas');
    // Later visits read the saved setting.
    localStorage.removeItem('cellbound:v1:stats');
    expect((await load()).theme).toBe('atlas');
  });

  it('keeps whatever look a player picked', async () => {
    localStorage.setItem('cellbound:v1', '{}');
    localStorage.setItem('cellbound:v1:settings', JSON.stringify({ state: { theme: 'washi' }, version: 1 }));
    expect((await load()).theme).toBe('washi');
  });

  it('counts a run or a lesson as having played before', async () => {
    const { hasPlayedBefore } = await import('./settings');
    expect(hasPlayedBefore()).toBe(false);
    localStorage.setItem('cellbound:learn:v1', '{"v":1,"done":{}}');
    expect(hasPlayedBefore()).toBe(true);
    localStorage.clear();
    localStorage.setItem('cellbound:run:v1', '{}');
    expect(hasPlayedBefore()).toBe(true);
  });
});
