// @vitest-environment jsdom
// Sound: a digit plays its own note, a digit the board marks as wrong buzzes, and a wrong digit the
// board cannot tell from a right one sounds like one, so the sound never gives the answer away.
import { beforeEach, describe, expect, it } from 'vitest';
import { conflicts } from '../engine';
import { LYRA } from '../engine/fixtures';
import { useSettings } from '../game/settings';
import { actions, resetStoreForTesting, startGame } from '../game/store';

interface Played {
  type: string;
  freq: number;
}
const played: Played[] = [];

/** Just enough of Web Audio to hear what would play. */
class FakeAudio {
  currentTime = 0;
  state = 'running';
  destination = {};
  resume() {
    return Promise.resolve();
  }
  createGain() {
    return { gain: { value: 1, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} };
  }
  createOscillator() {
    const osc = {
      type: 'sine',
      frequency: {
        setValueAtTime: (f: number) => played.push({ type: osc.type, freq: f }),
        exponentialRampToValueAtTime() {},
      },
      connect() {},
      start() {},
      stop() {},
    };
    return osc;
  }
}
(window as unknown as { AudioContext: unknown }).AudioContext = FakeAudio;
await import('./sound');

const noteOf = (d: number) => 523.25 * Math.pow(2, [0, 2, 4, 7, 9, 12, 14, 16, 19][d - 1] / 12);
const empty = LYRA.givens.map((d, i) => (d ? -1 : i)).filter((i) => i >= 0);
const play = (i: number, d: number) => {
  actions.select(i);
  actions.input(d);
};

beforeEach(() => {
  resetStoreForTesting();
  useSettings.setState({ sound: true, mistakes: 'conflicts' });
  played.length = 0;
});

describe('sound', () => {
  it('plays each digit its own note', () => {
    startGame({ key: 's1', mode: 'free', puzzle: LYRA });
    const i = empty[0];
    play(i, LYRA.solution[i]);
    expect(played[0].freq).toBeCloseTo(noteOf(LYRA.solution[i]), 3);
    expect(played[0].type).toBe('triangle');
  });

  it('buzzes a digit that breaks a rule, and plays a wrong one that breaks none as any other', () => {
    startGame({ key: 's2', mode: 'free', puzzle: LYRA });
    const n = LYRA.size;
    // A digit its row already holds breaks a rule the board shows.
    const i = empty[0];
    const row = Math.floor(i / n);
    const held = LYRA.givens.slice(row * n, row * n + n).find((d) => d && d !== LYRA.solution[i])!;
    play(i, held);
    expect(played.map((p) => p.type)).toEqual(['sawtooth']);
    // A wrong digit nothing on the board contradicts yet sounds like a right one.
    played.length = 0;
    actions.erase();
    let quiet: [number, number] | null = null;
    for (const c of empty) {
      for (let d = 1; d <= n && !quiet; d++) {
        const grid = LYRA.givens.slice();
        grid[c] = d;
        if (d !== LYRA.solution[c] && !conflicts(LYRA, grid).some((x) => x.cells.includes(c))) quiet = [c, d];
      }
    }
    expect(quiet).not.toBeNull();
    play(quiet![0], quiet![1]);
    expect(played[0].type).toBe('triangle');
    expect(played[0].freq).toBeCloseTo(noteOf(quiet![1]), 3);
  });

  it('buzzes every wrong digit where the game checks the solution', () => {
    useSettings.setState({ mistakes: 'strict' });
    startGame({ key: 's3', mode: 'free', puzzle: LYRA });
    const i = empty[0];
    play(i, (LYRA.solution[i] % 6) + 1);
    expect(played.map((p) => p.type)).toEqual(['sawtooth']);
  });

  it('stays silent with the switch off', () => {
    useSettings.setState({ sound: false });
    startGame({ key: 's4', mode: 'free', puzzle: LYRA });
    const i = empty[0];
    play(i, LYRA.solution[i]);
    expect(played).toEqual([]);
  });
});
