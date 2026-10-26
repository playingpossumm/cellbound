// The technique ladder behind Run scoring.
//
// A Grid holds a candidate mask per cell. The cheap tiers run as a cascade:
// a solved cell clears its peers (tier 1), a digit with one place left in a
// house is placed (tier 2), and one clue at a time removes what it rules out
// (tier 3). The pattern tiers (4 to 8, patterns.ts) apply one deduction at a
// time, always the cheapest one available, with the cascade in between.
// Tier 8 is a cell that one chain or one forcing chain within fixed limits
// (TIER8 in patterns.ts) proves directly from the board closed at tier 7.
//
// classify() finds the smallest tier that proves a placement: it closes the
// board at tier 1, then 2, and so on up to 7, stopping at the first tier whose
// deductions leave the cell with only that digit, and then looks for a chain
// or forcing chain that proves the cell itself. profile() plays a board from its givens as a typical
// player and as an expert would. Limits count links and rounds, never time,
// so results are the same on every device.
import { buildModel, support, type Model } from './model';
import { findPattern, TIER8, tier8Proofs, type Tier8Limits } from './patterns';
import type { TechniqueId } from './techniques';
import type { Clue, Digit, PuzzleShape } from './types';

export type LadderTechnique = Exclude<TechniqueId, 'unproven'>;

export interface Elim {
  cell: number;
  /** Digits ruled out at the cell, as candidate bits. */
  mask: number;
}

export interface Deduction {
  technique: LadderTechnique;
  tier: number;
  elim: Elim[];
  /** Cells that carry the deduction, for highlighting. */
  focus: number[];
  /** Clue singles: the index of the clue in the puzzle's clues, or -1 for a pair with no dot under negative kropki. */
  clue?: number;
}

/** Tier of every technique on the ladder. It mirrors TECHNIQUES in techniques.ts, which a test checks. */
export const LADDER_TIER: Readonly<Record<LadderTechnique, number>> = {
  fullHouse: 1,
  nakedSingle: 1,
  hiddenSingle: 2,
  clueSingle: 3,
  lockedCandidates: 4,
  cageRule: 4,
  nakedPair: 5,
  hiddenPair: 5,
  nakedTriple: 5,
  hiddenTriple: 5,
  xWing: 6,
  skyscraper: 6,
  kite: 6,
  swordfish: 7,
  xyWing: 7,
  xyzWing: 7,
  wWing: 7,
  chain: 8,
  forcing: 8,
};

export interface Cage {
  cells: number[];
  sum: number;
}

const single = (v: number) => v !== 0 && (v & (v - 1)) === 0;

export class Grid {
  readonly m: Model;
  /** Cages with a known total, for the cage rule. */
  readonly cages: Cage[];
  readonly masks: Int32Array;
  /** 1 once a solved cell has cleared its digit from its peers. */
  readonly sent: Uint8Array;
  /** 1 when a clue's cells changed since its last check. */
  readonly conDirty: Uint8Array;
  queue: number[];
  /** How far tier 8 may go. */
  readonly limits: Tier8Limits;
  broken = false;
  /** The cell being classified, its digit's bit, and whether the cell is down to that digit. */
  watch = -1;
  watchBit = 0;
  proven = false;
  /** The last deduction applied at each tier (2 to 8). */
  readonly last: (Deduction | null)[] = [null, null, null, null, null, null, null, null, null];
  /** Sees every deduction as it is applied, for tests. */
  onDeduction: ((d: Deduction) => void) | null = null;

  constructor(m: Model, cages: Cage[], masks: Int32Array, sent: Uint8Array, conDirty: Uint8Array, queue: number[], limits: Tier8Limits) {
    this.m = m;
    this.cages = cages;
    this.masks = masks;
    this.sent = sent;
    this.conDirty = conDirty;
    this.queue = queue;
    this.limits = limits;
  }

  /** The board with these digits placed (0 is empty) and every other cell open. */
  static of(m: Model, cages: Cage[], values: ArrayLike<number>, limits: Tier8Limits = TIER8): Grid {
    const masks = new Int32Array(m.N).fill(m.all);
    const queue: number[] = [];
    for (let c = 0; c < m.N; c++) {
      const d = values[c] | 0;
      if (d >= 1 && d <= m.n) {
        masks[c] = 1 << d;
        queue.push(c);
      }
    }
    return new Grid(m, cages, masks, new Uint8Array(m.N), new Uint8Array(m.cons.length).fill(1), queue, limits);
  }

  /** A copy that carries on from here, watching the same cell. */
  clone(): Grid {
    const g = new Grid(this.m, this.cages, this.masks.slice(), this.sent.slice(), this.conDirty.slice(), this.queue.slice(), this.limits);
    g.broken = this.broken;
    g.watch = this.watch;
    g.watchBit = this.watchBit;
    g.proven = this.proven;
    return g;
  }

  isSolved(c: number): boolean {
    return single(this.masks[c]);
  }

  /** Rules out the digits in mask at cell c. */
  eliminate(c: number, mask: number): void {
    const old = this.masks[c];
    const nm = old & ~mask;
    if (nm === old) return;
    this.masks[c] = nm;
    if (nm === 0) {
      this.broken = true;
      return;
    }
    const cc = this.m.cellCons[c];
    for (let i = 0; i < cc.length; i++) this.conDirty[cc[i]] = 1;
    if (c === this.watch) {
      if (!(nm & this.watchBit)) this.broken = true;
      else if (nm === this.watchBit) this.proven = true;
    }
    if ((nm & (nm - 1)) === 0) this.queue.push(c);
  }

  /** Puts digit d in cell c. */
  place(c: number, d: number): void {
    this.eliminate(c, this.masks[c] & ~(1 << d));
  }

  apply(d: Deduction): void {
    this.last[d.tier] = d;
    this.onDeduction?.(d);
    for (const e of d.elim) {
      this.eliminate(e.cell, e.mask);
      if (this.broken) return;
    }
  }

  /**
   * Runs the cheap tiers up to maxTier (1 to 3) until nothing changes: solved
   * cells clear their peers, then hidden singles, then one clue at a time.
   * Stops early once the watched cell is proven. False when the board breaks.
   */
  cascade(maxTier: number): boolean {
    const { m, masks } = this;
    for (;;) {
      while (this.queue.length) {
        const c = this.queue.pop()!;
        if (this.sent[c]) continue;
        this.sent[c] = 1;
        const v = masks[c];
        const pc = m.peers[c];
        for (let i = 0; i < pc.length; i++) {
          if (masks[pc[i]] & v) {
            this.eliminate(pc[i], v);
            if (this.broken) return false;
          }
        }
        if (this.proven) return true;
      }
      if (this.proven || maxTier < 2) return true;
      const h = this.hiddenSingle();
      if (this.broken) return false;
      if (h) {
        this.apply(h);
        if (this.broken) return false;
        continue;
      }
      if (maxTier < 3) return true;
      const k = this.clueStep();
      if (this.broken) return false;
      if (k) {
        this.apply(k);
        if (this.broken) return false;
        continue;
      }
      return true;
    }
  }

  /** The first digit, house by house, that has one place left and is not yet placed there. */
  hiddenSingle(): Deduction | null {
    const { m, masks } = this;
    const { houses, all } = m;
    for (let h = 0; h < houses.length; h++) {
      const cells = houses[h];
      let once = 0, twice = 0;
      for (let i = 0; i < cells.length; i++) {
        const v = masks[cells[i]];
        twice |= once & v;
        once |= v;
      }
      if (once !== all) {
        this.broken = true;
        return null;
      }
      let uniq = once & ~twice;
      while (uniq) {
        const b = uniq & -uniq;
        uniq ^= b;
        for (let i = 0; i < cells.length; i++) {
          const v = masks[cells[i]];
          if (!(v & b)) continue;
          if (v !== b) return { technique: 'hiddenSingle', tier: 2, elim: [{ cell: cells[i], mask: v & ~b }], focus: cells.slice() };
          break;
        }
      }
    }
    return null;
  }

  /** The first clue whose cells changed and which now rules something out. */
  clueStep(): Deduction | null {
    const { m, conDirty } = this;
    for (let k = 0; k < m.cons.length; k++) {
      if (!conDirty[k]) continue;
      conDirty[k] = 0;
      const d = this.clueDeduction(k);
      if (this.broken) return null;
      if (d) return d;
    }
    return null;
  }

  /** What clue k rules out on its own, given the cells' candidates. */
  clueDeduction(k: number): Deduction | null {
    const con = this.m.cons[k];
    const { masks } = this;
    const cells = con.cells;
    let open = false;
    for (let i = 0; i < cells.length; i++) {
      if (!single(masks[cells[i]])) {
        open = true;
        break;
      }
    }
    if (!open) return null;
    const sup = support(con, masks);
    if (!sup) {
      this.broken = true;
      return null;
    }
    let elim: Elim[] | null = null;
    for (let i = 0; i < cells.length; i++) {
      const gone = masks[cells[i]] & ~sup[i];
      if (gone) (elim ??= []).push({ cell: cells[i], mask: gone });
    }
    return elim ? { technique: 'clueSingle', tier: 3, elim, focus: cells.slice(), clue: con.clue } : null;
  }
}

/**
 * Closes the grid at level L (1 to 7): the cascade (tiers up to 3), then
 * pattern deductions up to tier L, cheapest first, until none applies. Every
 * step removes a candidate, so it always ends, and since each technique still
 * applies (or is no longer needed) on a fuller board, the result does not
 * depend on the order of the steps.
 */
export function closeTo(g: Grid, L: number): void {
  for (;;) {
    if (!g.cascade(L < 3 ? L : 3)) return;
    if (g.proven || L < 4) return;
    const d = findPattern(g, Math.min(L, 7));
    if (!d) return;
    g.apply(d);
    if (g.broken) return;
  }
}

// Models and cages per puzzle. A puzzle sent to the worker arrives as a new
// object each time, so the last few are also kept by content.
interface Kit {
  m: Model;
  cages: Cage[];
}

const recent: { sig: string; clues: Clue[]; cages: Cage[] }[] = [];

export function kitFor(p: Pick<PuzzleShape, 'size' | 'boxW' | 'boxH' | 'regions' | 'clues' | 'negativeKropki'>): Kit {
  const sig = `${p.size}|${p.boxW}|${p.boxH}|${p.negativeKropki ? 1 : 0}|${p.regions ? p.regions.join(',') : ''}|${JSON.stringify(p.clues)}`;
  let hit = recent.find((r) => r.sig === sig);
  if (!hit) {
    hit = { sig, clues: p.clues, cages: cagesOf(p.clues) };
    recent.unshift(hit);
    if (recent.length > 4) recent.pop();
  }
  return { m: buildModel({ ...p, clues: hit.clues }), cages: hit.cages };
}

/** Cages with a known total. None when two cages share a cell, since the cage rule assumes they never do. */
export function cagesOf(clues: Clue[]): Cage[] {
  const out: Cage[] = [];
  const seen = new Set<number>();
  for (const c of clues) {
    if (c.kind !== 'cage' || c.sum == null) continue;
    for (const x of c.cells) {
      if (seen.has(x)) return [];
      seen.add(x);
    }
    out.push({ cells: c.cells.slice(), sum: c.sum });
  }
  return out;
}

export interface Classified {
  tier: number;
  technique: TechniqueId;
  focus: number[];
  /** Clue singles: the index of the deciding clue in the puzzle's clues, or -1 for a pair with no dot. */
  clue?: number;
}

type ClassifyInput = Pick<PuzzleShape, 'size' | 'boxW' | 'boxH' | 'regions' | 'clues' | 'negativeKropki' | 'givens'> & { solution?: Digit[] };

/**
 * The smallest tier whose closure proves digit at cell, from the board in
 * values (givens plus entries, the cell itself left empty). Entries that
 * disagree with the solution are left out, since nothing sound follows from
 * a wrong digit. A digit that is not the solution is never proven.
 */
export function classify(p: ClassifyInput, values: ArrayLike<number>, cell: number, digit: number, limits: Tier8Limits = TIER8): Classified {
  const { m, cages } = kitFor(p);
  const { N, n } = m;
  const none: Classified = { tier: 0, technique: 'unproven', focus: [cell] };
  if (!(cell >= 0 && cell < N) || !(digit >= 1 && digit <= n)) return none;
  const sol = p.solution && p.solution.length === N ? p.solution : null;
  if (sol && sol[cell] && sol[cell] !== digit) return none;
  const base = boardOf(p, m, values);
  base[cell] = 0;
  const g = Grid.of(m, cages, base, limits);
  g.watch = cell;
  g.watchBit = 1 << digit;
  const done = (tier: number, d: Deduction | null): Classified => {
    if (!d) return { tier: 0, technique: 'unproven', focus: [cell] };
    return d.clue === undefined ? { tier, technique: d.technique, focus: d.focus } : { tier, technique: d.technique, focus: d.focus, clue: d.clue };
  };

  // Tier 1: singles, cascading.
  g.cascade(1);
  if (g.broken) return none;
  if (g.proven) return singleAt(m, base, cell);

  // Tier 2: the cell's own hidden single first, then any.
  for (const h of m.cellHouses[cell]) {
    let only = true;
    for (const c of m.houses[h]) {
      if (c !== cell && g.masks[c] & g.watchBit) {
        only = false;
        break;
      }
    }
    if (only) return { tier: 2, technique: 'hiddenSingle', focus: m.houses[h].slice() };
  }
  g.cascade(2);
  if (g.broken) return none;
  if (g.proven) return done(2, g.last[2]);

  // Tier 3: the cell's own clues first, then any clue.
  for (const k of m.cellCons[cell]) {
    const d = g.clueDeduction(k);
    if (g.broken) return none;
    if (!d) continue;
    g.apply(d);
    g.cascade(2);
    if (g.broken) return none;
    if (g.proven) return done(3, d);
  }
  g.cascade(3);
  if (g.broken) return none;
  if (g.proven) return done(3, g.last[3]);

  // Tiers 4 to 7: patterns, one at a time.
  for (let L = 4; L <= 7; L++) {
    closeTo(g, L);
    if (g.broken) return none;
    if (g.proven) return done(L, g.last[L]);
  }

  // Tier 8: a chain or a forcing chain that proves the cell itself; beyond that it is a guess.
  const pr = tier8Proofs(g, g.limits, cell).get(cell);
  if (!pr || pr.digit !== digit) return none;
  return { tier: 8, technique: pr.technique, focus: pr.focus };
}

/** The givens and the entries that agree with the solution: what the ladder reasons from. */
function boardOf(p: ClassifyInput, m: Model, values: ArrayLike<number>): number[] {
  const { N, n } = m;
  const sol = p.solution && p.solution.length === N ? p.solution : null;
  const base = new Array<number>(N).fill(0);
  for (let c = 0; c < N; c++) {
    const v = (p.givens[c] || values[c] || 0) | 0;
    if (v < 1 || v > n) continue;
    if (sol && sol[c] && sol[c] !== v) continue;
    base[c] = v;
  }
  return base;
}

/**
 * The tier of every empty cell at once (0 where nothing in the library proves
 * it, and for filled cells), from one layered pass over the board: the same
 * tiers classify() gives the right digits one cell at a time.
 */
export function tierMap(p: ClassifyInput, values: ArrayLike<number>, limits: Tier8Limits = TIER8): number[] {
  const { m, cages } = kitFor(p);
  const base = boardOf(p, m, values);
  const layers = Layers.of(Grid.of(m, cages, base, limits));
  if (layers.g[1]!.broken) return base.map(() => 0);
  return base.map((v, c) => (v ? 0 : layers.tierOf(c)));
}

/** A full house when the cell is the last empty cell of one of its houses on the board, otherwise a naked single. */
function singleAt(m: Model, base: number[], cell: number): Classified {
  for (const h of m.cellHouses[cell]) {
    if (m.houses[h].every((c) => c === cell || base[c])) return { tier: 1, technique: 'fullHouse', focus: m.houses[h].slice() };
  }
  return { tier: 1, technique: 'nakedSingle', focus: [cell] };
}

/**
 * Closures of one board at every level, kept as the board fills: layer L (1
 * to 7) is the board closed at tier L. A placement proven at tier T leaves
 * layers T to 7 as they were, since they already hold it, so only the layers
 * below it are brought up to date. Tier 8 is not a closure but the cells that
 * one chain or forcing chain proves directly from layer 7, so it is worked
 * out again whenever layer 7 changes.
 */
class Layers {
  readonly g: (Grid | null)[];
  /** Cells that one chain or forcing chain proves from layer 7, or null until needed. */
  t8: Uint8Array | null;
  constructor(g: (Grid | null)[], t8: Uint8Array | null) {
    this.g = g;
    this.t8 = t8;
  }

  static of(first: Grid): Layers {
    closeTo(first, 1);
    return new Layers([null, first, null, null, null, null, null, null], null);
  }

  get(L: number): Grid {
    let g = this.g[L];
    if (!g) {
      g = this.get(L - 1).clone();
      closeTo(g, L);
      this.g[L] = g;
    }
    return g;
  }

  /** Whether level L (1 to 8) solves cell c. */
  solves(L: number, c: number): boolean {
    if (L < 8) return this.get(L).isSolved(c);
    if (!this.t8) {
      const g7 = this.get(7);
      const t8 = new Uint8Array(g7.m.N);
      for (const c8 of tier8Proofs(g7, g7.limits).keys()) t8[c8] = 1;
      this.t8 = t8;
    }
    return this.get(7).isSolved(c) || this.t8[c] === 1;
  }

  /** The smallest level below t that solves cell c, or t when none does. */
  tierBelow(c: number, t: number): number {
    for (let L = 1; L < t; L++) if (this.solves(L, c)) return L;
    return t;
  }

  /** The smallest level that solves cell c, or 0 when no chain or forcing chain proves it either. */
  tierOf(c: number): number {
    for (let L = 1; L <= 8; L++) if (this.solves(L, c)) return L;
    return 0;
  }

  /** Places digit d at c, found at tier T (0 for a guess). */
  place(c: number, d: number, T: number): void {
    const top = T === 0 || T === 8 ? 7 : T - 1;
    for (let L = 1; L <= top; L++) {
      const g = this.g[L];
      if (!g) break;
      g.place(c, d);
      closeTo(g, L);
    }
    if (top === 7) this.t8 = null;
  }

  clone(): Layers {
    return new Layers(this.g.map((g) => (g ? g.clone() : null)), this.t8);
  }

  /** Takes over the layers of a trial copy. */
  adopt(other: Layers): void {
    for (let L = 1; L <= 7; L++) this.g[L] = other.g[L];
    this.t8 = other.t8;
  }
}

export interface Profile {
  typical: number[];
  expert: number[];
}

/**
 * Plays a board from its givens twice. The typical player always takes the
 * easiest placement available: the lowest tier, the first such cell in
 * reading order. The expert looks at that move first. When it would make
 * other cells easier (a hidden single whose cascade turns its neighbours
 * into singles, say), it also weighs placing one of those cells first, while
 * it is still hard: up to EXPERT_LOOK of them, hardest first, each tier
 * worth twice the one below, and it plays whichever keeps the most. Both
 * count placements per tier (0 to 8), where 0 is a placement nothing in the
 * library proves: a guess. Deterministic.
 */
export function profile(p: ClassifyInput & { solution: Digit[] }, limits: Tier8Limits = TIER8): Profile {
  const { start, open } = startLayers(p, limits);
  const tally = (moves: Move[]) => {
    const counts = new Array<number>(9).fill(0);
    for (const mv of moves) counts[mv.tier]++;
    return counts;
  };
  return {
    typical: tally(play(start.clone(), p, open, false)),
    expert: tally(play(start.clone(), p, open, true)),
  };
}

/** One placement of a simulated playthrough: the cell and the tier it had when placed (0 for a guess). */
export interface Move {
  cell: number;
  tier: number;
}

/** The placements of one simulated player in order, the moves profile() counts. */
export function playOrder(p: ClassifyInput & { solution: Digit[] }, expert = false, limits: Tier8Limits = TIER8): Move[] {
  const { start, open } = startLayers(p, limits);
  return play(start, p, open, expert);
}

function startLayers(p: ClassifyInput & { solution: Digit[] }, limits: Tier8Limits): { start: Layers; open: number[] } {
  const { m, cages } = kitFor(p);
  const start = Layers.of(Grid.of(m, cages, p.givens, limits));
  // Compute the levels both players need up front, so they share the work.
  const open: number[] = [];
  for (let c = 0; c < m.N; c++) if (!p.givens[c]) open.push(c);
  for (let L = 1; L <= 8; L++) if (open.every((c) => start.solves(L, c))) break;
  return { start, open };
}

/** Value of a placement by tier, for the expert's choices. */
const WEIGHT = [0, 1, 2, 4, 8, 16, 32, 64, 128];
/** Most cells the expert weighs before a placement that would make others easier. */
export const EXPERT_LOOK = 8;

function play(layers: Layers, p: { solution: Digit[] }, open: number[], expert: boolean): Move[] {
  const moves: Move[] = [];
  let left = open.slice();
  const count = (c: number, T: number) => {
    moves.push({ cell: c, tier: T });
    left = left.filter((x) => x !== c);
  };
  for (let guard = 0; left.length && guard < 2 * open.length; guard++) {
    // A cell a single proves stays a single however the others are filled, and placing it changes nothing.
    const g1 = layers.get(1);
    const singles = left.filter((c) => g1.isSolved(c));
    if (singles.length) {
      for (const c of singles) count(c, 1);
      continue;
    }
    let T = 0, X = -1;
    for (let L = 2; L <= 8 && X < 0; L++) {
      X = left.find((c) => layers.solves(L, c)) ?? -1;
      if (X >= 0) T = L;
    }
    if (X < 0) {
      X = guessCell(layers, left);
      count(X, 0);
      layers.place(X, p.solution[X], 0);
      continue;
    }
    if (!expert) {
      count(X, T);
      layers.place(X, p.solution[X], T);
      continue;
    }
    const tiers = new Map<number, number>();
    for (const c of left) tiers.set(c, layers.tierOf(c));
    // What placing Z would cost: the value lost by every cell it makes easier.
    const tryPlace = (Z: number, TZ: number) => {
      const trial = layers.clone();
      trial.place(Z, p.solution[Z], TZ);
      let lost = 0;
      const easier: number[] = [];
      for (const [c, t] of tiers) {
        if (c === Z || t < 2) continue;
        const nt = trial.tierBelow(c, t);
        if (nt < t) {
          lost += WEIGHT[t] - WEIGHT[nt];
          easier.push(c);
        }
      }
      return { trial, net: WEIGHT[TZ] - lost, easier };
    };
    const base = tryPlace(X, T);
    let best = { cell: X, tier: T, trial: base.trial, net: base.net };
    const others = base.easier.sort((a, b) => tiers.get(b)! - tiers.get(a)! || a - b).slice(0, EXPERT_LOOK);
    for (const c of others) {
      const t = tiers.get(c)!;
      const r = tryPlace(c, t);
      if (r.net > best.net) best = { cell: c, tier: t, trial: r.trial, net: r.net };
    }
    count(best.cell, best.tier);
    layers.adopt(best.trial);
  }
  return moves;
}

/** The open cell with the fewest candidates at the highest level reached, for a guess. */
function guessCell(layers: Layers, left: number[]): number {
  let top = 1;
  while (top < 7 && layers.g[top + 1]) top++;
  const g = layers.get(top);
  let best = left[0], bc = 99;
  for (const c of left) {
    let k = 0;
    for (let v = g.masks[c]; v; v &= v - 1) k++;
    if (k < bc) {
      bc = k;
      best = c;
    }
  }
  return best;
}
