// The technique ladder: soundness over generated boards of every size, rule
// mix and level, the meaning of tiers 1 to 3 against independent references,
// the limits of tier 8 (logical play never guesses, a guess stays tier 0,
// proven cells stay proven as the board fills), fixtures and the profiles.
import { describe, expect, it } from 'vitest';
import { unpackClue, unpackDay, type MonthFile } from './daily';
import { ALL_KINDS, boxDims } from './generator';
import { generate, type ClueKind, type Difficulty, type Puzzle, type Size } from './index';
import { classify, classifyHardest, closeTo, Grid, hardestStep, kitFor, LADDER_TIER, playOrder, profile, tierMap, type Deduction } from './ladder';
import { contradictionDepth } from './logic';
import { clueCells, POP, support, type Model } from './model';
import { chainProofs, DETECTORS, forcingProofs, refuteRounds, scan, TIER8, tier8Proofs, type Proof } from './patterns';
import { makeRng } from './rng';
import { propagate } from './solver';
import { classifyPlacement, classifyPlacementAsync, hardestPlacement, hardestPlacementAsync, TECHNIQUES, tierProfile, tierProfileAsync } from './techniques';
import { TECHNIQUE_FIXTURES, type TechniqueFixture } from './techniques.fixtures';
import { LATIN, randomPuzzle, satisfies } from './testkit';

const stored = import.meta.glob('../data/daily/*.json', { eager: true, import: 'default' }) as Record<string, MonthFile>;
const nineDays: Puzzle[] = Object.values(stored)
  .flatMap((m) => Object.entries(m))
  .filter(([date]) => date >= '2026-10-24')
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([date, packed]) => unpackDay(date, packed));

/** Random 4x4 boards with a unique solution: every clue kind, irregular regions and negative kropki. */
function smallBoards(count: number): Puzzle[] {
  const out: Puzzle[] = [];
  for (let t = 0; out.length < count && t < 40 * count; t++) {
    const p = randomPuzzle(`ladder-${t}`);
    const sols = LATIN.filter((g) => satisfies(p, g));
    if (sols.length === 1) out.push({ ...p, solution: sols[0] });
  }
  return out;
}

/** Generated 6x6 boards: each rule alone and all rules mixed, at every level, and hidden cage totals. */
function sixBoards(): Puzzle[] {
  const out: Puzzle[] = [];
  for (const d of [1, 2, 3, 4, 5] as Difficulty[]) {
    for (const k of ALL_KINDS) out.push(generate({ size: 6, seed: `ladder6-${k}-${d}`, rules: [k], difficulty: d, minKinds: 1, maxKinds: 1 }));
    out.push(generate({ size: 6, seed: `ladder6-mix-${d}`, rules: ALL_KINDS, difficulty: d }));
    out.push(generate({ size: 6, seed: `ladder6-classic-${d}`, rules: [], difficulty: d }));
  }
  out.push(generate({ size: 6, seed: 'ladder6-hidden', rules: ['cage', 'thermo'], difficulty: 4, minKinds: 2, maxKinds: 2, hiddenCageTotals: true }));
  return out;
}

/** Generated 9x9 boards beyond the Dailies: classic at the two hardest levels, a mix at level 5, killer with hidden totals. */
function nineBoards(): Puzzle[] {
  return [
    generate({ size: 9, seed: 'ladder9-classic-4', rules: [], difficulty: 4 }),
    generate({ size: 9, seed: 'ladder9-classic-5', rules: [], difficulty: 5 }),
    generate({ size: 9, seed: 'ladder9-mix-5', rules: ALL_KINDS, difficulty: 5 }),
    generate({ size: 9, seed: 'ladder9-hidden', rules: ['cage', 'kropki'] as ClueKind[], difficulty: 3, minKinds: 2, maxKinds: 2, hiddenCageTotals: true }),
  ];
}

const small = smallBoards(80);
const six = sixBoards();
const nine = [...nineDays.filter((_, i) => i % 4 === 0), ...nineBoards()];

/** The givens plus a random share of the other cells of the solution. */
function partial(p: Puzzle, share: number, seed: string): number[] {
  const rng = makeRng(seed);
  return p.givens.map((d, i) => d || (rng() < share ? p.solution[i] : 0));
}

/** The open cells of a board in a random order. */
function shuffled(p: Puzzle, seed: string): number[] {
  const rng = makeRng(seed);
  return p.givens.map((d, i) => (d ? -1 : i)).filter((i) => i >= 0).sort(() => rng() - 0.5);
}

function closed7(p: Puzzle, values: number[]): Grid {
  const { m, cages } = kitFor(p);
  const g = Grid.of(m, cages, values);
  for (let L = 1; L <= 7; L++) closeTo(g, L);
  return g;
}

/**
 * Solves from values as a solver would, closing at tier 7 and then placing
 * the first cell a chain or forcing chain proves, over and over, and checks
 * every deduction applied and every proof offered against the solution.
 */
function solveChecked(p: Puzzle, values: number[]): { solved: boolean; used: Set<string> } {
  const { m, cages } = kitFor(p);
  const g = Grid.of(m, cages, values);
  const used = new Set<string>();
  const check = (d: Deduction) => {
    used.add(d.technique);
    expect(d.tier, d.technique).toBe(LADDER_TIER[d.technique]);
    expect(d.focus.length, d.technique).toBeGreaterThan(0);
    for (const e of d.elim) expect(e.mask & (1 << p.solution[e.cell]), `${p.id} ${d.technique} at ${e.cell}`).toBe(0);
  };
  g.onDeduction = check;
  for (let step = 0; step < 200; step++) {
    for (let L = 1; L <= 7; L++) closeTo(g, L);
    expect(g.broken, p.id).toBe(false);
    for (let c = 0; c < m.N; c++) expect(g.masks[c] & (1 << p.solution[c]), `${p.id} cell ${c}`).not.toBe(0);
    if (Array.from(g.masks).every((v) => (v & (v - 1)) === 0)) break;
    const proofs = [...tier8Proofs(g, TIER8).values()];
    for (const pr of proofs) {
      used.add(pr.technique);
      expect(pr.digit, `${p.id} ${pr.technique} at ${pr.cell}`).toBe(p.solution[pr.cell]);
    }
    if (!proofs.length) break;
    g.place(proofs[0].cell, proofs[0].digit);
  }
  return { solved: Array.from(g.masks).every((v, i) => v === 1 << p.solution[i]), used };
}

describe('technique ladder', () => {
  it('gives every technique the tier of TECHNIQUES, and tier 8 its documented limits', () => {
    for (const [id, t] of Object.entries(TECHNIQUES)) {
      if (id === 'unproven') expect(t.tier).toBe(0);
      else expect(LADDER_TIER[id as keyof typeof LADDER_TIER], id).toBe(t.tier);
    }
    expect(Object.keys(LADDER_TIER).length).toBe(Object.keys(TECHNIQUES).length - 1);
    expect(TIER8).toEqual({ links: 9, rounds: 5 });
  });

  it('never rules out a solution digit on generated boards of every size, rule mix and level', () => {
    const used = new Set<string>();
    let solved = 0, total = 0;
    for (const p of [...small, ...six, ...nine]) {
      for (const [k, share] of [0, 0.15, 0.4].entries()) {
        const r = solveChecked(p, share ? partial(p, share, `${p.id}|${k}`) : p.givens);
        r.used.forEach((x) => used.add(x));
        total++;
        if (r.solved) solved++;
      }
    }
    // The common techniques all do some work on these boards.
    for (const t of ['hiddenSingle', 'clueSingle', 'lockedCandidates', 'cageRule', 'nakedPair', 'hiddenPair', 'chain', 'forcing']) {
      expect(used.has(t), t).toBe(true);
    }
    expect(solved / total).toBeGreaterThan(0.9);
  }, 120000);

  it('keeps every detector sound on boards with random candidates removed', () => {
    let fired = 0;
    const firedBy = new Set<string>();
    const boards = [...small.slice(0, 40), ...six, ...nine.slice(0, 30)];
    for (const p of boards) {
      const { m, cages } = kitFor(p);
      for (let round = 0; round < 3; round++) {
        const rng = makeRng(`${p.id}|stress|${round}`);
        const g = Grid.of(m, cages, partial(p, 0.1 * round, `${p.id}|s${round}`));
        // Remove a random share of the wrong candidates, without clearing the peers of solved cells.
        for (let c = 0; c < m.N; c++) {
          for (let d = 1; d <= m.n; d++) if (d !== p.solution[c] && rng() < 0.35 + 0.15 * round) g.masks[c] &= ~(1 << d);
        }
        const check = (d: Deduction | null) => {
          if (!d) return;
          fired++;
          firedBy.add(d.technique);
          for (const e of d.elim) expect(e.mask & (1 << p.solution[e.cell]), `${p.id} ${d.technique}`).toBe(0);
        };
        const s = scan(g);
        for (const f of Object.values(DETECTORS)) check(f(g, s));
        const proved = (pr: Proof) => {
          fired++;
          firedBy.add(pr.technique);
          expect(pr.digit, `${p.id} ${pr.technique} at ${pr.cell}`).toBe(p.solution[pr.cell]);
        };
        chainProofs(g, s, 15).forEach(proved);
        forcingProofs(g, 12).forEach(proved);
        check(g.hiddenSingle());
        check(g.clueStep());
        expect(g.broken, p.id).toBe(false);
      }
    }
    expect(fired).toBeGreaterThan(200);
    for (const t of ['lockedCandidates', 'nakedPair', 'hiddenPair', 'xWing', 'skyscraper', 'kite', 'xyWing', 'xyzWing', 'wWing', 'swordfish', 'chain', 'forcing']) {
      expect(firedBy.has(t), t).toBe(true);
    }
  }, 120000);

  it('puts a placement at tier 1, 2 or 3 exactly when singles, hidden singles or the clues alone prove it', () => {
    let checked = 0;
    const seen = [0, 0, 0, 0];
    for (const p of [...small.slice(0, 40), ...six, ...nine.slice(0, 40)]) {
      const { m } = kitFor(p);
      for (const share of [0, 0.3]) {
        const v = share ? partial(p, share, `${p.id}|sem`) : p.givens.slice();
        // Independent references: naked singles alone, then with hidden singles, then the search solver's propagation.
        const masks = new Int32Array(m.N);
        for (let c = 0; c < m.N; c++) masks[c] = v[c] ? 1 << v[c] : m.all;
        const r1 = singlesFixpoint(m, masks.slice(), false);
        const r2 = singlesFixpoint(m, masks.slice(), true);
        const r3 = masks.slice();
        expect(propagate(m, r3, null)).toBe(true);
        for (let c = 0; c < m.N; c++) {
          if (v[c]) continue;
          const t = classify(p, v, c, p.solution[c]).tier;
          const one = (x: Int32Array) => x[c] === 1 << p.solution[c];
          expect(t === 1, `${p.id} ${c}`).toBe(one(r1));
          expect(t >= 1 && t <= 2, `${p.id} ${c}`).toBe(one(r2));
          expect(t >= 1 && t <= 3, `${p.id} ${c}`).toBe(one(r3));
          if (t <= 3) seen[t]++;
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(3000);
    expect(Math.min(seen[1], seen[2], seen[3])).toBeGreaterThan(50);
  }, 120000);

  it('never proves a wrong digit, even when it is not told the solution', () => {
    let tried = 0;
    for (const p of [...small.slice(0, 30), ...six.slice(0, 30), ...nine.slice(0, 25)]) {
      const blind = { ...p, solution: [] as number[] };
      const v = partial(p, 0.2, `${p.id}|wrong`);
      const rng = makeRng(`${p.id}|wrong`);
      for (let k = 0; k < 6; k++) {
        const c = Math.floor(rng() * p.size * p.size);
        if (v[c]) continue;
        const d = 1 + ((p.solution[c] + Math.floor(rng() * (p.size - 1))) % p.size);
        expect(d).not.toBe(p.solution[c]);
        expect(classify(blind, v, c, d).tier, `${p.id} ${c} ${d}`).toBe(0);
        expect(classifyPlacement(p, v, c, d).technique).toBe('unproven');
        tried++;
      }
    }
    expect(tried).toBeGreaterThan(200);
  }, 120000);

  it('ignores wrong entries, notes and the digit already in the cell', () => {
    const p = nineDays[6];
    const v = partial(p, 0.3, 'entries');
    const c = v.findIndex((d) => !d);
    const want = classifyPlacement(p, v, c, p.solution[c]);
    const noisy = v.slice();
    let k = 0;
    for (let i = 0; i < 81 && k < 3; i++) if (!noisy[i] && i !== c) { noisy[i] = (p.solution[i] % 9) + 1; k++; }
    expect(classifyPlacement(p, noisy, c, p.solution[c])).toEqual(want);
    const filled = v.slice();
    filled[c] = p.solution[c];
    expect(classifyPlacement(p, filled, c, p.solution[c])).toEqual(want);
  });

  it('is deterministic', () => {
    const p = nineDays[13];
    const v = partial(p, 0.2, 'det');
    for (let c = 0; c < 81; c++) {
      if (v[c]) continue;
      expect(classify(p, v, c, p.solution[c])).toEqual(classify({ ...p, clues: JSON.parse(JSON.stringify(p.clues)) }, v.slice(), c, p.solution[c]));
    }
    expect(tierProfile(p)).toEqual(tierProfile({ ...p, clues: p.clues.slice() }));
  });

  it('runs the async forms inline without a worker, with the same answers', async () => {
    expect(typeof Worker).toBe('undefined');
    const p = nineDays[20];
    const c = p.givens.findIndex((d) => !d);
    expect(await classifyPlacementAsync(p, p.givens, c, p.solution[c])).toEqual(classifyPlacement(p, p.givens, c, p.solution[c]));
    expect(await tierProfileAsync(p)).toEqual(tierProfile(p));
  });
});

/**
 * The board classifyHardest judges a placement on: for a cell singles prove, the candidates the
 * placed digits leave; otherwise the board closed one tier below the simplest proof.
 */
function hardestBoard(p: Puzzle, values: number[], cell: number, tier: number): { g: Grid; open: number[] } {
  const { m, cages } = kitFor(p);
  const base = p.givens.map((d, i) => (i === cell ? 0 : d || (values[i] === p.solution[i] ? values[i] : 0)));
  const g = Grid.of(m, cages, base);
  if (tier === 1) {
    for (let c = 0; c < m.N; c++) if (base[c]) for (const x of m.peers[c]) if (!base[x]) g.masks[x] &= ~(1 << base[c]);
  } else {
    for (let L = 1; L < tier; L++) closeTo(g, L);
  }
  return { g, open: base.map((d, i) => (d ? -1 : i)).filter((i) => i >= 0) };
}

describe('the hardest technique, for Microscope', () => {
  const boards = [...six.filter((_, i) => i % 3 === 0), ...nine.slice(0, 10)];
  const ups = new Map<string, number>();
  const seen: { p: Puzzle; values: number[]; cell: number; s: ReturnType<typeof classify>; h: ReturnType<typeof classify> }[] = [];
  for (const p of boards) {
    for (const [k, share] of [0.2, 0.5].entries()) {
      const values = partial(p, share, `${p.id}|hard${k}`);
      for (const cell of shuffled(p, `${p.id}|hard${k}`).filter((c) => !values[c]).slice(0, 24)) {
        const s = classify(p, values, cell, p.solution[cell]);
        const h = classifyHardest(p, values, cell, p.solution[cell]);
        seen.push({ p, values, cell, s, h });
        if (h.tier > s.tier) ups.set(`${s.tier}>${h.tier}`, (ups.get(`${s.tier}>${h.tier}`) ?? 0) + 1);
      }
    }
  }

  it('is never below the simplest technique, keeps a guess and a chain as they are, and goes no higher than tier 7', () => {
    for (const { s, h } of seen) {
      expect(h.tier).toBeGreaterThanOrEqual(s.tier);
      if (s.tier === 0 || s.tier >= 7) expect(h).toEqual(s);
      else expect(h.tier).toBeLessThanOrEqual(7);
      expect(h.tier).toBe(LADDER_TIER[h.technique as keyof typeof LADDER_TIER] ?? 0);
    }
  });

  it('backs every upgrade with one sound deduction that proves the cell on the board the simple one was found on', () => {
    for (const { p, values, cell, s, h } of seen) {
      if (h.tier === s.tier) continue;
      const d = hardestStep(p, values, cell, p.solution[cell], s.tier)!;
      expect([d.technique, d.tier, d.focus]).toEqual([h.technique, h.tier, h.focus]);
      for (const e of d.elim) expect(e.mask & (1 << p.solution[e.cell]), `${p.id} ${d.technique} at ${e.cell}`).toBe(0);
      const { g, open } = hardestBoard(p, values, cell, s.tier);
      const bit = 1 << p.solution[cell];
      const left = g.masks.slice();
      for (const e of d.elim) left[e.cell] &= ~e.mask;
      const { m } = kitFor(p);
      const naked = g.masks[cell] !== bit && left[cell] === bit;
      const hidden = m.cellHouses[cell].some((hs) => {
        const others = m.houses[hs].filter((c) => c !== cell && open.includes(c));
        return others.length > 0 && others.some((c) => g.masks[c] & bit) === (d.elim.length > 0) && others.every((c) => !(left[c] & bit));
      });
      expect(naked || hidden, `${p.id} cell ${cell} ${d.technique}`).toBe(true);
      // Patterns only once the singles are in.
      if (s.tier === 1) expect(h.tier).toBeLessThanOrEqual(3);
    }
  });

  it('upgrades singles that are also hidden singles, and hidden singles that a pattern also proves', () => {
    expect(ups.get('1>2') ?? 0).toBeGreaterThan(0);
    expect([...ups].filter(([k]) => k.startsWith('2>') && Number(k.slice(2)) >= 4).reduce((a, [, n]) => a + n, 0)).toBeGreaterThan(0);
  });

  it('never proves a wrong digit, and leaves a full house a full house', () => {
    for (const { p, values, cell, s } of seen.slice(0, 120)) {
      expect(classifyHardest(p, values, cell, (p.solution[cell] % p.size) + 1).tier).toBe(0);
      if (s.technique !== 'fullHouse') continue;
      const h = classifyHardest(p, values, cell, p.solution[cell]);
      if (h.technique === 'hiddenSingle') expect(h.focus.some((c) => c !== cell && !values[c] && !p.givens[c])).toBe(true);
    }
    // The last open cell of a row, on a board where it is nothing more.
    const p = fixturePuzzle(TECHNIQUE_FIXTURES.find((f) => f.key === 'fullHouse')!);
    expect(hardestPlacement(p, p.givens, 8, 2)).toEqual(classifyPlacement(p, p.givens, 8, 2));
  });

  it('is deterministic, and its async form runs inline with the same answers', async () => {
    for (const { p, values, cell, h } of seen.slice(0, 40)) expect(classifyHardest({ ...p, clues: p.clues.slice() }, values.slice(), cell, p.solution[cell])).toEqual(h);
    const { p, values, cell } = seen.find((x) => x.h.tier > x.s.tier)!;
    expect(await hardestPlacementAsync(p, values, cell, p.solution[cell])).toEqual(hardestPlacement(p, values, cell, p.solution[cell]));
  });
});

describe('tier 8 limits', () => {
  it('never leaves a placement made in a logical order at tier 0 on boards at levels 1 to 4, and agrees with the profile', () => {
    // Crafted 9x9 boards, as the Dailies and the Run make them, and generated boards up to level 3.
    const boards: Puzzle[] = nineDays.filter((p, i) => p.difficulty === 4 || i % 7 === 3);
    const windows: [number, number][] = [[6, 9], [7, 10], [9, 13], [12, 16]];
    for (const d of [1, 2, 3, 4] as Difficulty[]) boards.push(generate({ size: 9, seed: `logical-${d}`, rules: ['thermo', 'xv'], difficulty: d, minutes: windows[d - 1] }));
    boards.push(...six.filter((p) => p.difficulty <= 3), generate({ size: 9, seed: 'logical-free-3', rules: ALL_KINDS, difficulty: 3 }));
    let tier8 = 0;
    for (const p of boards) {
      expect(p.difficulty, p.id).toBeLessThanOrEqual(4);
      for (const expert of [false, true]) {
        const v = p.givens.slice();
        for (const mv of playOrder(p, expert)) {
          expect(mv.tier, `${p.id} ${expert ? 'expert' : 'typical'} cell ${mv.cell}`).toBeGreaterThan(0);
          if (!expert) expect(classify(p, v, mv.cell, p.solution[mv.cell]).tier, `${p.id} cell ${mv.cell}`).toBe(mv.tier);
          if (mv.tier === 8) tier8++;
          v[mv.cell] = p.solution[mv.cell];
        }
        expect(v, p.id).toEqual(p.solution);
      }
    }
    expect(tier8).toBeGreaterThan(0);
  }, 120000);

  it('leaves guess-like placements at tier 0: tier 8 must prove the cell itself', () => {
    let beyond7 = 0, guessLike = 0, cascadeOnly = 0, unboundedProves = 0;
    for (const p of nineDays.filter((x) => x.difficulty === 4).slice(0, 16)) {
      const { m } = kitFor(p);
      const g = closed7(p, p.givens);
      const proofs = tier8Proofs(g, TIER8);
      // An independent reading of the forcing rule agrees with the engine's.
      const forced = strictForcing(m, g.masks, p.solution, TIER8.rounds);
      for (let c = 0; c < m.N; c++) {
        const engine = forcingProofs(g, TIER8.rounds, c).length > 0;
        if (!g.isSolved(c)) expect(engine, `${p.id} cell ${c}`).toBe(forced[c] === 1);
      }
      // What one short forcing chain followed by tiers 1 to 7 would reach: the looser reading.
      const cascade = new Uint8Array(m.N);
      for (let a = 0; a < m.N; a++) {
        const k = POP[g.masks[a]];
        if (k < 2 || k > 3) continue;
        for (let d = 1; d <= m.n; d++) {
          if (!(g.masks[a] & (1 << d)) || !refuteRounds(m, g.masks, a, d, TIER8.rounds)) continue;
          const t = g.clone();
          t.eliminate(a, 1 << d);
          for (let L = 1; L <= 7; L++) closeTo(t, L);
          for (let c = 0; c < m.N; c++) if (t.isSolved(c)) cascade[c] = 1;
        }
      }
      for (let c = 0; c < m.N; c++) {
        if (p.givens[c]) continue;
        const r = classifyPlacement(p, p.givens, c, p.solution[c]);
        if (g.isSolved(c)) {
          expect(r.tier, `${p.id} cell ${c}`).toBeLessThanOrEqual(7);
          continue;
        }
        beyond7++;
        const pr = proofs.get(c);
        if (pr) {
          expect([r.tier, r.technique], `${p.id} cell ${c}`).toEqual([8, pr.technique]);
          continue;
        }
        guessLike++;
        expect(r.technique, `${p.id} cell ${c}`).toBe('unproven');
        if (cascade[c]) cascadeOnly++;
        // A contradiction test with no limit refutes every other digit of some of these cells.
        let all = true;
        for (let d = 1; d <= m.n; d++) {
          if (d !== p.solution[c] && g.masks[c] & (1 << d) && contradictionDepth(m, g.masks, c, d, Infinity) < 0) all = false;
        }
        if (all) unboundedProves++;
      }
    }
    expect(guessLike / beyond7).toBeGreaterThan(0.25);
    expect(cascadeOnly).toBeGreaterThan(0);
    expect(unboundedProves).toBeGreaterThan(0);
  }, 120000);

  it('keeps every proven cell proven, at the same tier or lower, as correct digits are added', () => {
    const boards = [...nineDays.filter((x) => x.difficulty >= 3).slice(0, 4), ...six.filter((_, i) => i % 4 === 0), ...small.slice(0, 20)];
    let pairs = 0;
    for (const p of boards) {
      const v = p.givens.slice();
      let before = tierMap(p, v);
      const steps = shuffled(p, `${p.id}|mono`).slice(0, p.size === 9 ? 24 : 40);
      for (const c of steps) {
        v[c] = p.solution[c];
        const after = tierMap(p, v);
        for (let x = 0; x < v.length; x++) {
          if (v[x] || !before[x]) continue;
          expect(after[x], `${p.id} cell ${x} after ${c}`).toBeGreaterThan(0);
          expect(after[x], `${p.id} cell ${x} after ${c}`).toBeLessThanOrEqual(before[x]);
          pairs++;
        }
        before = after;
      }
      // The map and the classifier agree.
      for (let x = 0; x < v.length; x++) if (!v[x]) expect(classify(p, v, x, p.solution[x]).tier, `${p.id} ${x}`).toBe(before[x]);
    }
    expect(pairs).toBeGreaterThan(5000);
  }, 120000);

  it('counts forcing chains in rounds, which a fuller board never lengthens', () => {
    // Forced cells, the old measure, can grow: on the Daily of 2026-11-07 a test that forced 7 cells needs 29 two digits later.
    let checked = 0, forcedGrew = 0;
    for (const p of nineDays.filter((x) => x.difficulty === 4).slice(0, 12)) {
      const { m } = kitFor(p);
      const v = p.givens.slice();
      for (const c of shuffled(p, `${p.id}|rounds`).slice(0, 6)) {
        const g = closed7(p, v);
        const tests: [number, number, number][] = [];
        for (let a = 0; a < m.N; a++) {
          const k = POP[g.masks[a]];
          if (k < 2 || k > 3) continue;
          for (let d = 1; d <= m.n; d++) {
            if (!(g.masks[a] & (1 << d))) continue;
            const r = refuteRounds(m, g.masks, a, d, TIER8.rounds);
            if (r) tests.push([a, d, r]);
          }
        }
        v[c] = p.solution[c];
        const h = closed7(p, v);
        for (const [a, d, r] of tests) {
          if (!(h.masks[a] & (1 << d))) continue;
          const r2 = refuteRounds(m, h.masks, a, d, TIER8.rounds);
          expect(r2, `${p.id} r${Math.floor(a / 9) + 1}c${(a % 9) + 1} ${d}`).toBeGreaterThan(0);
          expect(r2).toBeLessThanOrEqual(r);
          if (contradictionDepth(m, h.masks, a, d, 81) > contradictionDepth(m, g.masks, a, d, 81)) forcedGrew++;
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(100);
    expect(forcedGrew).toBeGreaterThan(0);
  }, 120000);
});

/**
 * The forcing rule written out again for the test: a cell with two or three
 * candidates proves cell t when each of its candidates, followed for up to R
 * rounds (all rules applied at once from the round before), breaks a rule or
 * leaves t with its digit.
 */
function strictForcing(m: Model, start: Int32Array, sol: number[], R: number): Uint8Array {
  const branch = (cell: number, digit: number): Int32Array | null => {
    let cur = start.slice();
    cur[cell] = 1 << digit;
    for (let round = 0; round < R; round++) {
      const next = cur.slice();
      for (let x = 0; x < m.N; x++) {
        const v = cur[x];
        if (v && !(v & (v - 1))) for (const q of m.peers[x]) next[q] &= ~v;
      }
      for (const cells of m.houses) {
        for (let d = 1; d <= m.n; d++) {
          const at = cells.filter((x) => cur[x] & (1 << d));
          if (!at.length) return null;
          if (at.length === 1) next[at[0]] &= 1 << d;
        }
      }
      for (const con of m.cons) {
        const sup = support(con, cur);
        if (!sup) return null;
        con.cells.forEach((x, i) => (next[x] &= sup[i]));
      }
      if (next.some((v) => !v)) return null;
      if (next.every((v, i) => v === cur[i])) break;
      cur = next;
    }
    return cur;
  };
  const out = new Uint8Array(m.N);
  for (let a = 0; a < m.N; a++) {
    const k = POP[start[a]];
    if (k < 2 || k > 3) continue;
    const live: Int32Array[] = [];
    for (let d = 1; d <= m.n; d++) {
      if (!(start[a] & (1 << d))) continue;
      const b = branch(a, d);
      if (b) live.push(b);
    }
    for (let t = 0; t < m.N; t++) if (live.length && live.every((b) => b[t] === 1 << sol[t])) out[t] = 1;
  }
  return out;
}

/** The board's candidates after removing peers of solved cells, and with hidden, hidden singles, until nothing changes. */
function singlesFixpoint(m: ReturnType<typeof kitFor>['m'], masks: Int32Array, hidden: boolean): Int32Array {
  for (let changed = true; changed; ) {
    changed = false;
    for (let c = 0; c < m.N; c++) {
      const v = masks[c];
      if (v & (v - 1)) continue;
      for (const q of m.peers[c]) {
        if (masks[q] & v) {
          masks[q] &= ~v;
          changed = true;
        }
      }
    }
    if (changed || !hidden) continue;
    for (const cells of m.houses) {
      for (let d = 1; d <= m.n; d++) {
        const at = cells.filter((c) => masks[c] & (1 << d));
        if (at.length === 1 && masks[at[0]] !== 1 << d) {
          masks[at[0]] = 1 << d;
          changed = true;
        }
      }
    }
  }
  return masks;
}

function fixturePuzzle(f: TechniqueFixture): Puzzle {
  const givens = [...f.values].map(Number);
  return {
    id: `fixture-${f.key}`, seed: f.key, size: f.size, ...boxDims(f.size),
    ...(f.regions ? { regions: f.regions } : {}),
    ...(f.negativeKropki ? { negativeKropki: true } : {}),
    givens, solution: [...f.solution].map(Number), clues: f.clues.map(unpackClue), difficulty: 3, score: 0,
  };
}

describe('technique fixtures', () => {
  it('cover every technique', () => {
    const ids = new Set(TECHNIQUE_FIXTURES.map((f) => f.technique));
    for (const id of Object.keys(TECHNIQUES)) expect(ids.has(id as never), id).toBe(true);
  });

  for (const f of TECHNIQUE_FIXTURES) {
    it(`${f.key}: tier ${f.tier}, and nothing simpler proves it`, () => {
      const p = fixturePuzzle(f);
      const r = classifyPlacement(p, p.givens, f.cell, f.digit);
      expect([r.technique, r.tier]).toEqual([f.technique, f.tier]);
      expect('clue' in r).toBe(f.technique === 'clueSingle');
      expect(r.focus.length).toBeGreaterThan(0);
      expect(p.solution[f.cell]).toBe(f.digit);
      expect(p.givens[f.cell]).toBe(0);
      // The layered pass agrees: no lower tier proves the cell, and this one does.
      expect(tierMap(p, p.givens)[f.cell]).toBe(f.tier);
      if (f.tier > 1 && f.tier < 8) expect(closed7AtMost(p, f.tier - 1).isSolved(f.cell)).toBe(false);
      const n = p.size;
      const focus = [...r.focus].sort((a, b) => a - b);
      if (f.key === 'fullHouse') expect(r.focus.filter((c) => !p.givens[c])).toEqual([f.cell]);
      if (f.key === 'hidden:diagonal') {
        const falling = focus.every((c) => Math.floor(c / n) === c % n), rising = focus.every((c) => Math.floor(c / n) + (c % n) === n - 1);
        expect(falling || rising).toBe(true);
      }
      if (f.key === 'hidden:region') {
        expect(new Set(focus.map((c) => p.regions![c])).size).toBe(1);
        expect(new Set(focus.map((c) => Math.floor(c / n))).size).toBeGreaterThan(1);
      }
      if (f.key === 'hidden:antiKnight') {
        // Without the knight's move rule the same cell is no longer a hidden single.
        const plain = { ...p, clues: p.clues.filter((c) => c.kind !== 'antiKnight') };
        expect(classifyPlacement(plain, p.givens, f.cell, f.digit).tier).toBeGreaterThan(2);
      }
      if (f.key.startsWith('clue:')) {
        const kind = f.key.slice(5);
        const match = p.clues.find((c) => [...clueCells(c)].sort((a, b) => a - b).join() === focus.join());
        expect(r.clue).toBe(kind.startsWith('kropki') || kind === 'negKropki' ? 'kropki' : kind);
        if (kind === 'negKropki') {
          expect(p.negativeKropki).toBe(true);
          expect(match).toBeUndefined();
          expect(focus).toHaveLength(2);
          expect([1, n]).toContain(focus[1] - focus[0]);
        } else {
          expect(match, kind).toBeDefined();
          expect(match!.kind === 'kropki' ? `kropki-${match!.color}` : match!.kind).toBe(kind);
        }
      }
    });
  }

  it('leaves every cell of an empty board unproven', () => {
    const p = fixturePuzzle(TECHNIQUE_FIXTURES.find((f) => f.key === 'swordfish')!);
    const empty = p.givens.map(() => 0);
    for (const c of [0, 40, 80]) expect(classifyPlacement({ ...p, givens: empty }, empty, c, p.solution[c]).technique).toBe('unproven');
  });
});

/** The board closed at tiers up to maxTier (at most 7), from scratch. */
function closed7AtMost(p: Puzzle, maxTier: number): Grid {
  const { m, cages } = kitFor(p);
  const g = Grid.of(m, cages, p.givens);
  for (let L = 1; L <= maxTier; L++) closeTo(g, L);
  return g;
}

const CHIPS = [0, 10, 20, 30, 50, 80, 150, 250, 400];
const chips = (xs: number[]) => xs.reduce((a, x, i) => a + x * CHIPS[i], 0);

describe('tier profile', () => {
  it('counts every empty cell once, for both players, and the expert scores at least the typical player', () => {
    const boards = [...six.filter((_, i) => i % 3 === 0), ...nine.slice(0, 40)];
    for (const p of boards) {
      const { typical, expert } = profile(p);
      const empty = p.givens.filter((d) => !d).length;
      expect(typical).toHaveLength(9);
      expect(expert).toHaveLength(9);
      expect(typical.reduce((a, b) => a + b, 0), p.id).toBe(empty);
      expect(expert.reduce((a, b) => a + b, 0), p.id).toBe(empty);
      expect(chips(expert), p.id).toBeGreaterThanOrEqual(chips(typical));
      // The Dailies are solvable with tier 8 held to its limits, so nobody guesses.
      if (p.id.startsWith('daily-')) expect([typical[0], expert[0]], p.id).toEqual([0, 0]);
    }
  }, 120000);

  it('rises with the level on 9x9 Dailies', () => {
    const byLevel: number[][] = [[], [], [], [], []];
    for (const p of nineDays.slice(0, 63)) byLevel[p.difficulty].push(chips(profile(p).typical) / p.givens.filter((d) => !d).length);
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    for (let d = 2; d <= 4; d++) expect(mean(byLevel[d]), `level ${d}`).toBeGreaterThan(mean(byLevel[d - 1]));
  }, 120000);

  it('works on every board size', () => {
    for (const size of [4, 6, 9] as Size[]) {
      const p = generate({ size, seed: `profile-${size}`, rules: ALL_KINDS, difficulty: 3 });
      const r = tierProfile(p);
      expect(r.typical.reduce((a, b) => a + b, 0)).toBe(p.givens.filter((d) => !d).length);
    }
  });
});
