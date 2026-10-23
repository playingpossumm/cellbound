// Test helpers: every 4x4 Latin square, an independent rule checker written
// only for tests, and random 4x4 puzzles with any clue kind, irregular
// regions and negative kropki. Not used by the app.
import { makeRng, randInt, shuffle } from './rng';
import type { Clue, Puzzle } from './types';

const n = 4;
const N = 16;

function latinSquares(): number[][] {
  const out: number[][] = [];
  const g = new Array<number>(N).fill(0);
  const rec = (i: number) => {
    if (i === N) { out.push(g.slice()); return; }
    const r = Math.floor(i / n), c = i % n;
    for (let d = 1; d <= n; d++) {
      let ok = true;
      for (let k = 0; k < c; k++) if (g[r * n + k] === d) ok = false;
      for (let k = 0; k < r; k++) if (g[k * n + c] === d) ok = false;
      if (!ok) continue;
      g[i] = d;
      rec(i + 1);
    }
    g[i] = 0;
  };
  rec(0);
  return out;
}
export const LATIN = latinSquares();

function distinct(xs: number[]): boolean {
  return new Set(xs).size === xs.length;
}

function knight(a: number, b: number): boolean {
  const dr = Math.abs(Math.floor(a / n) - Math.floor(b / n)), dc = Math.abs((a % n) - (b % n));
  return (dr === 1 && dc === 2) || (dr === 2 && dc === 1);
}

/** Independent reference: does grid g satisfy everything in p? */
export function satisfies(p: Puzzle, g: number[]): boolean {
  const groups = new Map<number, number[]>();
  for (let i = 0; i < N; i++) {
    const r = Math.floor(i / n), c = i % n;
    const id = p.regions ? p.regions[i] : Math.floor(r / 2) * 2 + Math.floor(c / 2);
    groups.set(id, [...(groups.get(id) ?? []), g[i]]);
  }
  for (const v of groups.values()) if (!distinct(v)) return false;
  for (let i = 0; i < N; i++) if (p.givens[i] && p.givens[i] !== g[i]) return false;
  const dotted = new Set<string>();
  for (const cl of p.clues) {
    switch (cl.kind) {
      case 'thermo':
        for (let i = 1; i < cl.cells.length; i++) if (g[cl.cells[i]] <= g[cl.cells[i - 1]]) return false;
        break;
      case 'arrow':
        if (cl.path.reduce((s, c) => s + g[c], 0) !== g[cl.circle]) return false;
        break;
      case 'cage': {
        const ds = cl.cells.map((c) => g[c]);
        if (!distinct(ds)) return false;
        if (cl.sum != null && ds.reduce((a, b) => a + b, 0) !== cl.sum) return false;
        break;
      }
      case 'renban': {
        const ds = cl.cells.map((c) => g[c]);
        if (!distinct(ds) || Math.max(...ds) - Math.min(...ds) !== ds.length - 1) return false;
        break;
      }
      case 'whisper':
        for (let i = 1; i < cl.cells.length; i++) if (Math.abs(g[cl.cells[i]] - g[cl.cells[i - 1]]) < cl.minDiff) return false;
        break;
      case 'kropki': {
        const a = g[cl.a], b = g[cl.b];
        dotted.add(`${Math.min(cl.a, cl.b)}:${Math.max(cl.a, cl.b)}`);
        if (cl.color === 'white' ? Math.abs(a - b) !== 1 : a !== 2 * b && b !== 2 * a) return false;
        break;
      }
      case 'xv':
        if (g[cl.a] + g[cl.b] !== cl.sum) return false;
        break;
      case 'diagonal':
        if (!distinct([0, 5, 10, 15].map((c) => g[c])) || !distinct([3, 6, 9, 12].map((c) => g[c]))) return false;
        break;
      case 'antiKnight':
        for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) if (knight(a, b) && g[a] === g[b]) return false;
        break;
    }
  }
  if (p.negativeKropki) {
    for (let a = 0; a < N; a++) {
      for (const b of [a % n < n - 1 ? a + 1 : -1, a + n < N ? a + n : -1]) {
        if (b < 0 || dotted.has(`${a}:${b}`)) continue;
        const x = g[a], y = g[b];
        if (Math.abs(x - y) === 1 || x === 2 * y || y === 2 * x) return false;
      }
    }
  }
  return true;
}

function randomCells(rng: () => number, k: number): number[] {
  return shuffle(rng, Array.from({ length: N }, (_, i) => i)).slice(0, k);
}

function neighbourPair(rng: () => number): [number, number] {
  for (;;) {
    const a = randInt(rng, 0, N - 1);
    const b = rng() < 0.5 ? a + 1 : a + n;
    if (b < N && (b === a + n || a % n < n - 1)) return [a, b];
  }
}

function randomClue(rng: () => number, kind: Clue['kind']): Clue {
  switch (kind) {
    case 'thermo': return { kind, cells: randomCells(rng, randInt(rng, 2, 4)) };
    case 'arrow': {
      const cs = randomCells(rng, randInt(rng, 2, 4));
      return { kind, circle: cs[0], path: cs.slice(1) };
    }
    case 'cage': {
      const cs = randomCells(rng, randInt(rng, 2, 4));
      return { kind, cells: cs, sum: rng() < 0.2 ? null : randInt(rng, cs.length, cs.length * 3) };
    }
    case 'renban': return { kind, cells: randomCells(rng, randInt(rng, 2, 4)) };
    case 'whisper': return { kind, cells: randomCells(rng, randInt(rng, 2, 4)), minDiff: 2 };
    case 'kropki': {
      const [a, b] = neighbourPair(rng);
      return { kind, a, b, color: rng() < 0.5 ? 'white' : 'black' };
    }
    case 'xv': {
      const [a, b] = neighbourPair(rng);
      return { kind, a, b, sum: rng() < 0.5 ? 5 : 10 };
    }
    case 'diagonal': return { kind };
    default: return { kind: 'antiKnight' };
  }
}

const KINDS: Clue['kind'][] = ['thermo', 'arrow', 'cage', 'renban', 'whisper', 'kropki', 'xv', 'diagonal', 'antiKnight'];
const REGIONS = [0, 0, 0, 1, 2, 0, 1, 1, 2, 2, 3, 1, 2, 3, 3, 3];

export function randomPuzzle(seed: string): Puzzle {
  const rng = makeRng(seed);
  const clues: Clue[] = [];
  const count = randInt(rng, 1, 4);
  for (let i = 0; i < count; i++) clues.push(randomClue(rng, KINDS[randInt(rng, 0, KINDS.length - 1)]));
  const useRegions = rng() < 0.2;
  const base = LATIN[randInt(rng, 0, LATIN.length - 1)];
  const givens = base.map((d) => (rng() < 0.15 ? d : 0));
  return {
    id: seed, seed, size: 4, boxW: 2, boxH: 2,
    ...(useRegions ? { regions: REGIONS } : {}),
    givens, solution: base, clues,
    negativeKropki: rng() < 0.15,
    difficulty: 1, score: 0,
  };
}
