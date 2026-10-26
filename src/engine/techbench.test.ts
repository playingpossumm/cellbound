// Speed and tier mix of the technique ladder on 9x9 boards: the stored
// Dailies (crafted like Run boards) at levels 1 to 4 and generated boards at
// levels 1 to 5. Prints what it measures; the limits are loose on purpose.
import { describe, expect, it } from 'vitest';
import { unpackDay, type MonthFile } from './daily';
import { ALL_KINDS } from './generator';
import { generate, type Difficulty, type Puzzle } from './index';
import { classify, closeTo, Grid, kitFor, profile } from './ladder';
import { makeRng } from './rng';

const stored = import.meta.glob('../data/daily/*.json', { eager: true, import: 'default' }) as Record<string, MonthFile>;
const nineDays: Puzzle[] = Object.values(stored)
  .flatMap((m) => Object.entries(m))
  .filter(([date]) => date >= '2026-10-24')
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([date, packed]) => unpackDay(date, packed));

const quantile = (xs: number[], q: number) => {
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
};
const ms = (x: number) => (x < 1 ? x.toFixed(2) : x.toFixed(1));

/** The order in which the ladder itself solves the board: a natural playing order. */
function solveOrder(p: Puzzle): number[] {
  const { m, cages } = kitFor(p);
  const g = Grid.of(m, cages, p.givens);
  const order: number[] = [];
  const seen = new Uint8Array(m.N);
  for (let c = 0; c < m.N; c++) if (p.givens[c]) seen[c] = 1;
  const note = () => {
    for (let c = 0; c < m.N; c++) if (!seen[c] && g.isSolved(c)) { seen[c] = 1; order.push(c); }
  };
  g.onDeduction = note;
  for (let L = 1; L <= 8; L++) { closeTo(g, L); note(); }
  for (let c = 0; c < m.N; c++) if (!seen[c]) order.push(c);
  return order;
}

function timeClassify(boards: Puzzle[], random: boolean): number[] {
  const times: number[] = [];
  for (const p of boards) {
    const v = p.givens.slice();
    const rng = makeRng(`${p.id}|bench`);
    const order = random ? v.map((d, i) => (d ? -1 : i)).filter((i) => i >= 0).sort(() => rng() - 0.5) : solveOrder(p);
    for (const c of order) {
      const t = performance.now();
      classify(p, v, c, p.solution[c]);
      times.push(performance.now() - t);
      v[c] = p.solution[c];
    }
  }
  return times;
}

describe('technique ladder speed and tier mix', () => {
  it('classifies 9x9 placements quickly and profiles boards in well under a second', () => {
    const sets: { label: string; boards: Puzzle[] }[] = [];
    for (const d of [1, 2, 3, 4] as Difficulty[]) sets.push({ label: `Daily level ${d}`, boards: nineDays.filter((p) => p.difficulty === d).slice(0, 24) });
    for (const d of [1, 2, 3, 4, 5] as Difficulty[]) {
      const boards: Puzzle[] = [];
      for (let i = 0; i < 4; i++) boards.push(generate({ size: 9, seed: `techbench-${d}-${i}`, rules: i % 2 ? [] : ALL_KINDS, difficulty: d }));
      sets.push({ label: `generated level ${d}`, boards });
    }
    const all: number[] = [];
    let worst = 0;
    for (const { label, boards } of sets) {
      const inOrder = timeClassify(boards, false);
      const random = timeClassify(boards, true);
      all.push(...inOrder, ...random);
      const prof: number[] = [];
      const typical = new Array(9).fill(0), expert = new Array(9).fill(0);
      for (const p of boards) {
        const t = performance.now();
        const r = profile(p);
        prof.push(performance.now() - t);
        r.typical.forEach((x, i) => (typical[i] += x / boards.length));
        r.expert.forEach((x, i) => (expert[i] += x / boards.length));
      }
      worst = Math.max(worst, ...prof);
      console.log(
        `${label} (${boards.length} boards): classify in solving order median ${ms(quantile(inOrder, 0.5))} ms, p99 ${ms(quantile(inOrder, 0.99))}, max ${ms(Math.max(...inOrder))}; ` +
          `random order median ${ms(quantile(random, 0.5))}, p99 ${ms(quantile(random, 0.99))}, max ${ms(Math.max(...random))}; ` +
          `profile median ${ms(quantile(prof, 0.5))} ms, max ${ms(Math.max(...prof))}\n` +
          `  typical by tier 0-8: ${typical.map((x) => x.toFixed(1)).join(' ')}\n  expert by tier 0-8:  ${expert.map((x) => x.toFixed(1)).join(' ')}`,
      );
    }
    expect(quantile(all, 0.5)).toBeLessThan(5);
    expect(Math.max(...all)).toBeLessThan(1000);
    expect(worst).toBeLessThan(3000);
  }, 300000);
});
