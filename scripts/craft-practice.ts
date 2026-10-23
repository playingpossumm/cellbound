// Crafts the practice puzzles for the Learn lessons and writes src/modes/learn/practice.ts.
// Usage: npm run gen:practice
// Each puzzle is unique, and its lesson rule is needed: with the clues removed the same givens
// leave more than one solution. The tests check both again.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Clue, ClueKind, Digit, PuzzleShape } from '../src/engine/types';
import { consistent, countSolutions } from '../src/modes/learn/check';

type Rng = () => number;
function mulberry(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T,>(rng: Rng, xs: T[]): T => xs[Math.floor(rng() * xs.length)];
function shuffle<T>(rng: Rng, xs: T[]): T[] {
  const a = xs.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

interface Spec {
  id: ClueKind | 'basics';
  size: 4 | 6;
  boxW: number;
  boxH: number;
  /** Stop removing givens at this many. */
  target: number;
  /** Clue kinds that carry the lesson. They are removed for the "rule is needed" check. */
  rule: ClueKind[];
  make(rng: Rng, p: Shape, sol: Digit[]): Clue[] | null;
}
type Shape = { size: number; boxW: number; boxH: number };

const rc = (n: number, i: number): [number, number] => [Math.floor(i / n), i % n];
const idx = (n: number, r: number, c: number) => r * n + c;
const ortho = (n: number, i: number): number[] => {
  const [r, c] = rc(n, i);
  return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]
    .filter(([a, b]) => a >= 0 && b >= 0 && a < n && b < n)
    .map(([a, b]) => idx(n, a, b));
};
function walk(rng: Rng, n: number, len: number, step: (n: number, i: number) => number[]): number[] | null {
  const path = [Math.floor(rng() * n * n)];
  while (path.length < len) {
    const next = step(n, path[path.length - 1]).filter((x) => !path.includes(x));
    if (!next.length) return null;
    path.push(pick(rng, next));
  }
  return path;
}

function randomSolution(rng: Rng, p: Shape, global: Clue[]): Digit[] | null {
  const n = p.size;
  const shape: PuzzleShape = { size: n as 4 | 6, boxW: p.boxW, boxH: p.boxH, givens: new Array(n * n).fill(0), clues: global };
  const g: Digit[] = new Array(n * n).fill(0);
  let budget = 20000;
  const go = (i: number): boolean => {
    if (budget-- <= 0) return false;
    if (i === n * n) return true;
    for (const d of shuffle(rng, Array.from({ length: n }, (_, k) => k + 1))) {
      g[i] = d;
      if (consistent(shape, g) && go(i + 1)) return true;
    }
    g[i] = 0;
    return false;
  };
  return go(0) ? g : null;
}

const SPECS: Spec[] = [
  { id: 'basics', size: 6, boxW: 3, boxH: 2, target: 19, rule: [], make: () => [] },
  {
    id: 'thermo', size: 4, boxW: 2, boxH: 2, target: 5, rule: ['thermo'],
    make(rng, p, sol) {
      const path = walk(rng, p.size, pick(rng, [3, 4]), ortho);
      if (!path) return null;
      const v = path.map((i) => sol[i]);
      const up = v.every((d, k) => k === 0 || d > v[k - 1]);
      const down = v.every((d, k) => k === 0 || d < v[k - 1]);
      if (!up && !down) return null;
      return [{ kind: 'thermo', cells: up ? path : path.slice().reverse() }];
    },
  },
  {
    id: 'arrow', size: 4, boxW: 2, boxH: 2, target: 5, rule: ['arrow'],
    make(rng, p, sol) {
      const path = walk(rng, p.size, 3, ortho);
      if (!path) return null;
      const [circle, ...rest] = path;
      if (sol[circle] !== rest.reduce((s, i) => s + sol[i], 0)) return null;
      return [{ kind: 'arrow', circle, path: rest }];
    },
  },
  {
    id: 'cage', size: 4, boxW: 2, boxH: 2, target: 5, rule: ['cage'],
    make(rng, p, sol) {
      const out: Clue[] = [];
      const used = new Set<number>();
      for (let t = 0; t < 2; t++) {
        const cells = walk(rng, p.size, pick(rng, [2, 3]), ortho);
        if (!cells || cells.some((i) => used.has(i))) return null;
        if (new Set(cells.map((i) => sol[i])).size !== cells.length) return null;
        cells.forEach((i) => used.add(i));
        out.push({ kind: 'cage', cells, sum: cells.reduce((s, i) => s + sol[i], 0) });
      }
      return out;
    },
  },
  {
    id: 'renban', size: 4, boxW: 2, boxH: 2, target: 5, rule: ['renban'],
    make(rng, p, sol) {
      const cells = walk(rng, p.size, 3, ortho);
      if (!cells) return null;
      const v = cells.map((i) => sol[i]);
      if (Math.max(...v) - Math.min(...v) !== 2 || new Set(v).size !== 3) return null;
      return [{ kind: 'renban', cells }];
    },
  },
  {
    id: 'whisper', size: 4, boxW: 2, boxH: 2, target: 5, rule: ['whisper'],
    make(rng, p, sol) {
      const cells = walk(rng, p.size, pick(rng, [3, 4]), ortho);
      if (!cells) return null;
      const v = cells.map((i) => sol[i]);
      if (!v.every((d, k) => k === 0 || Math.abs(d - v[k - 1]) >= 2)) return null;
      return [{ kind: 'whisper', cells, minDiff: 2 }];
    },
  },
  {
    id: 'kropki', size: 4, boxW: 2, boxH: 2, target: 5, rule: ['kropki'],
    make(rng, p, sol) {
      const n = p.size;
      const out: Clue[] = [];
      const seen = new Set<string>();
      const pairs = shuffle(rng, Array.from({ length: n * n }, (_, i) => i).flatMap((i) => ortho(n, i).filter((j) => j > i).map((j) => [i, j] as const)));
      let white = 0;
      let black = 0;
      for (const [a, b] of pairs) {
        const x = sol[a];
        const y = sol[b];
        const isWhite = Math.abs(x - y) === 1;
        const isBlack = x === 2 * y || y === 2 * x;
        if (isWhite && white < 2) {
          out.push({ kind: 'kropki', a, b, color: 'white' });
          white++;
        } else if (isBlack && black < 2) {
          out.push({ kind: 'kropki', a, b, color: 'black' });
          black++;
        }
        seen.add(a + ',' + b);
        if (white === 2 && black === 2) break;
      }
      return white >= 1 && black >= 1 ? out : null;
    },
  },
  {
    id: 'xv', size: 6, boxW: 3, boxH: 2, target: 15, rule: ['xv'],
    make(rng, p, sol) {
      const n = p.size;
      const out: Clue[] = [];
      const pairs = shuffle(rng, Array.from({ length: n * n }, (_, i) => i).flatMap((i) => ortho(n, i).filter((j) => j > i).map((j) => [i, j] as const)));
      let x = 0;
      let v = 0;
      for (const [a, b] of pairs) {
        const s = sol[a] + sol[b];
        if (s === 10 && x < 2) {
          out.push({ kind: 'xv', a, b, sum: 10 });
          x++;
        } else if (s === 5 && v < 3) {
          out.push({ kind: 'xv', a, b, sum: 5 });
          v++;
        }
      }
      return x >= 1 && v >= 2 ? out : null;
    },
  },
  { id: 'diagonal', size: 4, boxW: 2, boxH: 2, target: 4, rule: ['diagonal'], make: () => [{ kind: 'diagonal' }] },
  { id: 'antiKnight', size: 6, boxW: 3, boxH: 2, target: 12, rule: ['antiKnight'], make: () => [{ kind: 'antiKnight' }] },
];

function craft(spec: Spec): { givens: Digit[]; solution: Digit[]; clues: Clue[] } | null {
  let best: { givens: Digit[]; solution: Digit[]; clues: Clue[] } | null = null;
  for (let attempt = 0; attempt < 6000 && !(best && best.givens.filter(Boolean).length <= spec.target); attempt++) {
    const rng = mulberry(1000 + attempt * 7919 + spec.id.length * 131);
    const n = spec.size;
    const shape: Shape = { size: n, boxW: spec.boxW, boxH: spec.boxH };
    const global: Clue[] = spec.id === 'diagonal' ? [{ kind: 'diagonal' }] : spec.id === 'antiKnight' ? [{ kind: 'antiKnight' }] : [];
    const solution = randomSolution(rng, shape, global);
    if (!solution) continue;
    const clues = spec.make(rng, shape, solution);
    if (!clues) continue;
    const full: PuzzleShape = { size: n, boxW: spec.boxW, boxH: spec.boxH, givens: solution.slice(), clues };
    if (!consistent(full, solution)) continue;
    let givens = solution.slice();
    for (const i of shuffle(rng, Array.from({ length: n * n }, (_, k) => k))) {
      if (givens.filter(Boolean).length <= spec.target) break;
      const trial = givens.slice();
      trial[i] = 0;
      if (countSolutions({ ...full, givens: trial }, 2) === 1) givens = trial;
    }
    const count = givens.filter(Boolean).length;
    if (count > spec.target + 2) continue;
    const bare = clues.filter((c) => !spec.rule.includes(c.kind));
    if (spec.rule.length && countSolutions({ ...full, givens, clues: bare }, 2) < 2) continue;
    if (!best || count < best.givens.filter(Boolean).length) best = { givens, solution, clues };
  }
  return best;
}

const rows = (xs: number[], n: number) =>
  '[\n' + Array.from({ length: n }, (_, r) => '      ' + xs.slice(r * n, r * n + n).join(', ') + ',').join('\n') + '\n    ]';

const out: string[] = [];
out.push('// Generated by scripts/craft-practice.ts and checked by lessons.test.ts. Do not edit by hand.');
out.push("import type { Clue, Digit, Size } from '../../engine/types';");
out.push('');
out.push('export interface PracticeData {');
out.push('  size: Size;');
out.push('  boxW: number;');
out.push('  boxH: number;');
out.push('  givens: Digit[];');
out.push('  solution: Digit[];');
out.push('  clues: Clue[];');
out.push('}');
out.push('');
out.push("export const PRACTICE: Record<string, PracticeData> = {");
for (const spec of SPECS) {
  const r = craft(spec);
  if (!r) {
    console.error('FAILED', spec.id);
    process.exit(1);
  }
  console.error(spec.id, 'givens', r.givens.filter(Boolean).length);
  out.push(`  ${spec.id}: {`);
  out.push(`    size: ${spec.size},`);
  out.push(`    boxW: ${spec.boxW},`);
  out.push(`    boxH: ${spec.boxH},`);
  out.push(`    givens: ${rows(r.givens, spec.size)},`);
  out.push(`    solution: ${rows(r.solution, spec.size)},`);
  out.push(`    clues: ${JSON.stringify(r.clues)},`);
  out.push('  },');
}
out.push('};');
const outFile = fileURLToPath(new URL('../src/modes/learn/practice.ts', import.meta.url));
writeFileSync(outFile, out.join('\n') + '\n');
console.error('wrote src/modes/learn/practice.ts');
