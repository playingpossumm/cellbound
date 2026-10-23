import { describe, expect, it } from 'vitest';
import { BAD_COPY } from '../../test/copy';
import type { Clue, ClueKind, Digit, PuzzleShape } from '../../engine/types';
import { RULE_TEXTS } from '../names';
import { consistent, countSolutions, firstSolution } from './check';
import { LESSONS, LESSON_IDS, lessonById, practicePuzzle, type Illustration } from './lessons';

const shapeOf = (size: 4 | 6, givens: Digit[], clues: Clue[]): PuzzleShape => ({
  size,
  boxW: size === 4 ? 2 : 3,
  boxH: 2,
  givens,
  clues,
});

describe('lesson set', () => {
  it('covers basics and the nine rules, once each, in a sensible order', () => {
    const rules: ClueKind[] = ['thermo', 'arrow', 'cage', 'renban', 'whisper', 'kropki', 'xv', 'diagonal', 'antiKnight'];
    expect(LESSON_IDS[0]).toBe('basics');
    expect([...LESSON_IDS].sort()).toEqual(['basics', ...rules].sort());
    expect(new Set(LESSON_IDS).size).toBe(LESSON_IDS.length);
  });

  it('gives every lesson two to four steps and the exact rule line', () => {
    for (const l of LESSONS) {
      expect(l.steps.length).toBeGreaterThanOrEqual(2);
      expect(l.steps.length).toBeLessThanOrEqual(4);
      if (l.id !== 'basics' && l.id !== 'whisper') expect(l.rule).toBe(RULE_TEXTS[l.id]);
    }
    expect(lessonById('whisper').rule).toBe('Neighbours on the line differ by at least 2.');
  });

  it('writes plain copy: no em dashes, no emoji, no empty text', () => {
    const bad = BAD_COPY;
    for (const l of LESSONS) {
      for (const text of [l.title, l.rule, ...l.steps.flatMap((s) => [s.text, s.art.label])]) {
        expect(text.trim().length).toBeGreaterThan(0);
        expect(text).not.toMatch(bad);
      }
    }
  });

  it('keeps each step short enough to read at a glance', () => {
    for (const l of LESSONS) for (const s of l.steps) expect(s.text.length).toBeLessThanOrEqual(190);
  });
});

function gridOf(art: Illustration): Digit[] {
  const n = art.size;
  const g: Digit[] = new Array(n * n).fill(0);
  (art.rows ?? []).forEach((r, y) => [...r].forEach((ch, x) => (g[y * n + x] = ch === '.' ? 0 : Number(ch))));
  for (const [i, d] of Object.entries(art.mine ?? {})) g[Number(i)] = d;
  return g;
}

describe('illustrations', () => {
  const all = LESSONS.flatMap((l) => l.steps.map((s, k) => ({ id: l.id, k, art: s.art })));

  it.each(all.map((a) => [`${a.id} step ${a.k + 1}`, a.art] as const))('%s is a valid little board', (_name, art) => {
    const n = art.size;
    const cells = n * n;
    if (art.rows) {
      expect(art.rows).toHaveLength(n);
      for (const r of art.rows) expect(r).toHaveLength(n);
    }
    const g = gridOf(art);
    expect(g.every((d) => d >= 0 && d <= n)).toBe(true);
    for (const list of [art.focus, art.tint, art.cross, Object.keys(art.mine ?? {}).map(Number)]) {
      for (const i of list ?? []) {
        expect(Number.isInteger(i)).toBe(true);
        expect(i).toBeGreaterThanOrEqual(0);
        expect(i).toBeLessThan(cells);
      }
    }
    for (const c of art.clues ?? []) {
      const used = c.kind === 'thermo' || c.kind === 'cage' || c.kind === 'renban' || c.kind === 'whisper' ? c.cells : c.kind === 'arrow' ? [c.circle, ...c.path] : c.kind === 'kropki' || c.kind === 'xv' ? [c.a, c.b] : [];
      for (const i of used) expect(i).toBeLessThan(cells);
    }
    // The digits drawn never break the rules drawn with them.
    expect(consistent(shapeOf(n, g, art.clues ?? []), g)).toBe(true);
  });

  it('shows whisper lines with the gap the lesson names', () => {
    for (const l of LESSONS) {
      for (const s of l.steps) for (const c of s.art.clues ?? []) if (c.kind === 'whisper') expect(c.minDiff).toBe(s.art.size === 4 ? 2 : 3);
    }
  });

  it('draws knight crosses only on cells a knight move from the marked digit', () => {
    const steps = lessonById('antiKnight').steps;
    const jump = (a: number, b: number) => {
      const dr = Math.abs(Math.floor(a / 6) - Math.floor(b / 6));
      const dc = Math.abs((a % 6) - (b % 6));
      return (dr === 1 && dc === 2) || (dr === 2 && dc === 1);
    };
    for (const i of steps[0].art.tint ?? []) expect(jump(14, i)).toBe(true);
    expect((steps[0].art.tint ?? []).length).toBe(8);
    for (const i of steps[1].art.cross ?? []) expect(jump(14, i)).toBe(true);
    expect(jump(12, 25) && jump(14, 25)).toBe(true);
    expect(steps[2].art.links).toEqual([
      [12, 25],
      [14, 25],
    ]);
    for (const [from, to] of steps[2].art.links ?? []) expect(jump(from, to)).toBe(true);
  });

  it('works the examples in the text through', () => {
    // Basics: the empty cells in the first three steps each have a single answer.
    const [row, column, box, single] = lessonById('basics').steps.map((s) => gridOf(s.art));
    expect(new Set(row.slice(0, 5)).size).toBe(5);
    expect([1, 2, 3, 4, 5, 6].filter((d) => !row.slice(0, 5).includes(d))).toEqual([4]);
    expect([1, 2, 3, 4, 5, 6].filter((d) => ![5, 11, 17, 23, 29].map((i) => column[i]).includes(d))).toEqual([2]);
    expect([1, 2, 3, 4, 5, 6].filter((d) => ![0, 1, 2, 6, 7].map((i) => box[i]).includes(d))).toEqual([2]);
    const seen = new Set<number>();
    for (let i = 0; i < 36; i++) {
      const r = Math.floor(i / 6);
      const c = i % 6;
      if (i !== 13 && single[i] && (r === 2 || c === 1 || (r >= 2 && r <= 3 && c <= 2))) seen.add(single[i]);
    }
    expect([1, 2, 3, 4, 5, 6].filter((d) => !seen.has(d))).toEqual([3]);
  });
});

describe('practice puzzles', () => {
  const ruleOf = (id: string): ClueKind | null => (id === 'basics' ? null : (id as ClueKind));

  it.each(LESSON_IDS)('%s: has one solution, valid givens, and uses its rule', (id) => {
    const p = practicePuzzle(id);
    const shape: PuzzleShape = { size: p.size, boxW: p.boxW, boxH: p.boxH, givens: p.givens, clues: p.clues };
    expect([4, 6]).toContain(p.size);
    expect(p.givens).toHaveLength(p.size * p.size);
    expect(p.solution).toHaveLength(p.size * p.size);
    // Givens are part of the solution, the solution is complete and breaks nothing.
    p.givens.forEach((d, i) => d && expect(d).toBe(p.solution[i]));
    expect(p.solution.every((d) => d >= 1 && d <= p.size)).toBe(true);
    expect(consistent({ ...shape, givens: p.solution }, p.solution)).toBe(true);
    // Exactly one solution, and it is the stored one.
    expect(countSolutions(shape, 3)).toBe(1);
    expect(firstSolution(shape)).toEqual(p.solution);
    // Only the lesson's rule appears.
    const kind = ruleOf(id);
    if (kind) {
      expect(p.clues.length).toBeGreaterThan(0);
      expect(p.clues.every((c) => c.kind === kind)).toBe(true);
      // The rule is needed: without its clues the same givens leave several solutions.
      expect(countSolutions({ ...shape, clues: [] }, 2)).toBeGreaterThanOrEqual(2);
    } else {
      expect(p.clues).toHaveLength(0);
    }
  });

  it('keeps puzzles short: 4x4 for single rules, 6x6 where the rule needs room', () => {
    for (const id of LESSON_IDS) {
      const p = practicePuzzle(id);
      if (['xv', 'antiKnight', 'basics'].includes(id)) expect(p.size).toBe(6);
      else expect(p.size).toBe(4);
      expect(p.givens.filter(Boolean).length).toBeGreaterThanOrEqual(4);
    }
  });

  it('names the puzzle after its lesson and rates it gentle', () => {
    for (const id of LESSON_IDS) {
      const p = practicePuzzle(id);
      expect(p.name).toBe(lessonById(id).title);
      expect(p.difficulty).toBe(1);
      expect(p.id).toBe('learn-' + id);
    }
  });

  it('hands out copies, so a game cannot change the lesson data', () => {
    const a = practicePuzzle('thermo');
    a.givens[0] = 4;
    a.clues.length = 0;
    expect(practicePuzzle('thermo').clues.length).toBeGreaterThan(0);
  });
});

describe('the checker itself', () => {
  it('rejects a broken thermometer, a repeated cage digit and a wrong arrow sum', () => {
    const base = new Array(16).fill(0);
    const thermo: Clue = { kind: 'thermo', cells: [0, 1, 2] };
    expect(consistent(shapeOf(4, [3, 2, 0, ...base.slice(3)], [thermo]), [3, 2, ...base.slice(2)])).toBe(false);
    expect(consistent(shapeOf(4, base, [{ kind: 'cage', cells: [0, 5], sum: 4 }]), [2, 0, 0, 0, 0, 2, ...base.slice(6)])).toBe(false);
    const arrow: Clue = { kind: 'arrow', circle: 0, path: [5, 10] };
    const at = (circle: number) => base.map((x, k) => (k === 0 ? circle : k === 5 || k === 10 ? 1 : x));
    expect(consistent(shapeOf(4, base, [arrow]), at(3))).toBe(false);
    expect(consistent(shapeOf(4, base, [arrow]), at(2))).toBe(true);
  });

  it('applies whisper, dots, xv and anti-knight as the engine types describe them', () => {
    const base = new Array(16).fill(0);
    const put = (i: number, d: number, j: number, e: number) => base.map((x, k) => (k === i ? d : k === j ? e : x));
    expect(consistent(shapeOf(4, base, [{ kind: 'whisper', cells: [0, 1], minDiff: 2 }]), put(0, 1, 1, 2))).toBe(false);
    expect(consistent(shapeOf(4, base, [{ kind: 'whisper', cells: [0, 1], minDiff: 2 }]), put(0, 1, 1, 3))).toBe(true);
    expect(consistent(shapeOf(4, base, [{ kind: 'kropki', a: 0, b: 1, color: 'white' }]), put(0, 2, 1, 4))).toBe(false);
    expect(consistent(shapeOf(4, base, [{ kind: 'kropki', a: 0, b: 1, color: 'black' }]), put(0, 2, 1, 4))).toBe(true);
    expect(consistent(shapeOf(4, base, [{ kind: 'xv', a: 0, b: 1, sum: 5 }]), put(0, 1, 1, 4))).toBe(true);
    expect(consistent(shapeOf(4, base, [{ kind: 'xv', a: 0, b: 1, sum: 5 }]), put(0, 1, 1, 3))).toBe(false);
    // Cell 0 and cell 6 are a knight's move apart on a 4x4 board.
    expect(consistent(shapeOf(4, base, [{ kind: 'antiKnight' }]), put(0, 2, 6, 2))).toBe(false);
    expect(consistent(shapeOf(4, base, [{ kind: 'antiKnight' }]), put(0, 2, 6, 3))).toBe(true);
  });
});
