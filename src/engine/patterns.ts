// Pattern deductions for the technique ladder (ladder.ts), tiers 4 to 8.
// The detectors of tiers 4 to 7 return the first instance they find, scanning
// houses, digits and cells in a fixed order, or null; tier 8 lists the cells
// that one chain or forcing chain within its limits proves. All of them only use facts that hold in
// any solution: a house holds each digit once, two peers never share a digit,
// a cell with two candidates holds one of them, and the sums of the cages.
// That keeps them sound on any board whose candidates still include the
// solution, closed by the cheaper tiers or not.
import { POP, support, type Model } from './model';
import type { Deduction, Elim, Grid } from './ladder';
/** Most open cells in one cage rule sum. */
export const CAGE_RULE_CELLS = 5;

const single = (v: number) => v !== 0 && (v & (v - 1)) === 0;
const bitIndex = (b: number) => 31 - Math.clz32(b);

/** Candidates per house: pos[h * 16 + d] has bit i set when cell i of house h can hold d. */
export interface Scan {
  pos: Int32Array;
  /** Digits held by solved cells of each house. */
  solved: Int32Array;
}

export function scan(g: Grid): Scan {
  const { houses } = g.m;
  const masks = g.masks;
  const pos = new Int32Array(houses.length * 16);
  const solved = new Int32Array(houses.length);
  for (let h = 0; h < houses.length; h++) {
    const cells = houses[h];
    for (let i = 0; i < cells.length; i++) {
      let v = masks[cells[i]];
      if (single(v)) solved[h] |= v;
      while (v) {
        const b = v & -v;
        v ^= b;
        pos[h * 16 + bitIndex(b)] |= 1 << i;
      }
    }
  }
  return { pos, solved };
}

/** Cells of a house at the positions in pm. */
function cellsAt(house: number[], pm: number): number[] {
  const out: number[] = [];
  for (let i = 0; pm; i++, pm >>= 1) if (pm & 1) out.push(house[i]);
  return out;
}

/** Removes the digits in bits from every open cell, other than cells, that sees all of cells. Null when there is none. */
function seenByAll(g: Grid, cells: number[], bits: number): Elim[] | null {
  const { m, masks } = g;
  const N = m.N;
  let out: Elim[] | null = null;
  const pc = m.peers[cells[0]];
  for (let i = 0; i < pc.length; i++) {
    const x = pc[i];
    const v = masks[x] & bits;
    if (!v || single(masks[x])) continue;
    let ok = true;
    for (let j = 1; j < cells.length; j++) {
      const c = cells[j];
      if (c === x || !m.peerOf[x * N + c]) {
        ok = false;
        break;
      }
    }
    if (ok) (out ??= []).push({ cell: x, mask: v });
  }
  return out;
}

type Detector = (g: Grid, s: Scan) => Deduction | null;

// Tier 4 -------------------------------------------------------------------

/**
 * Locked candidates: when a digit's places in a house all see one cell, that
 * cell cannot hold it. On a classic board this is pointing (box to line) and
 * claiming (line to box); diagonals, knight moves and cages add their own.
 */
export const lockedCandidates: Detector = (g, s) => {
  const { houses, n } = g.m;
  for (let h = 0; h < houses.length; h++) {
    for (let d = 1; d <= n; d++) {
      const b = 1 << d;
      if (s.solved[h] & b) continue;
      const pm = s.pos[h * 16 + d];
      if (POP[pm] < 2) continue;
      const cells = cellsAt(houses[h], pm);
      const elim = seenByAll(g, cells, b);
      if (elim) return { technique: 'lockedCandidates', tier: 4, elim, focus: cells };
    }
  }
  return null;
};

interface CageRegion {
  /** Digit total of the region: its houses times 1 + 2 + ... + n. */
  total: number;
  /** Cages fully inside. */
  inside: number[];
  /** Cages partly inside: their cells inside and outside the region. */
  partial: { cage: number; inCells: number[]; outCells: number[] }[];
  /** Region cells in no cage with a known total. */
  free: number[];
}

const regionCache = new WeakMap<object, CageRegion[]>();

/** Regions for the 45 rule: each house, then runs of 2 or more adjacent rows and of adjacent columns. */
function cageRegions(g: Grid): CageRegion[] {
  const hit = regionCache.get(g.cages);
  if (hit) return hit;
  const { m } = g;
  const { n, N, houses, houseKind } = m;
  const cageOf = new Int32Array(N).fill(-1);
  g.cages.forEach((k, i) => k.cells.forEach((c) => (cageOf[c] = i)));
  const sets: { cells: number[]; k: number }[] = houses.map((cells) => ({ cells, k: 1 }));
  for (let size = 2; size < n; size++) {
    for (const kind of ['row', 'column'] as const) {
      const lines = houses.map((_, h) => h).filter((h) => houseKind[h] === kind);
      for (let a = 0; a + size <= lines.length; a++) {
        sets.push({ cells: lines.slice(a, a + size).flatMap((h) => houses[h]), k: size });
      }
    }
  }
  const out: CageRegion[] = [];
  for (const { cells, k } of sets) {
    const inR = new Uint8Array(N);
    for (const c of cells) inR[c] = 1;
    const touched = [...new Set(cells.map((c) => cageOf[c]).filter((i) => i >= 0))].sort((a, b) => a - b);
    if (!touched.length) continue;
    const inside: number[] = [];
    const partial: CageRegion['partial'] = [];
    for (const i of touched) {
      const kc = g.cages[i].cells;
      const inCells = kc.filter((c) => inR[c]);
      if (inCells.length === kc.length) inside.push(i);
      else partial.push({ cage: i, inCells, outCells: kc.filter((c) => !inR[c]) });
    }
    out.push({ total: (k * n * (n + 1)) / 2, inside, partial, free: cells.filter((c) => cageOf[c] < 0) });
  }
  regionCache.set(g.cages, out);
  return out;
}

/**
 * The cage rule (45 rule, innies and outies): the digits of a run of houses
 * add up to a known total, so the cells not covered by whole cages add up to
 * what the cages leave. A cage that sticks out can be counted by its cells
 * inside or, through its total, by its cells outside; every way of counting
 * that leaves at most a few open cells is tried, and the sum rules out every
 * digit that fits no combination.
 */
export const cageRule: Detector = (g) => {
  if (!g.cages.length) return null;
  const { masks } = g;
  for (const R of cageRegions(g)) {
    let base = R.total;
    for (const i of R.inside) base -= g.cages[i].sum;
    // Each cage that sticks out is counted inside (bit clear) or outside (bit set).
    const ways = R.partial.length <= 4 ? 1 << R.partial.length : 1;
    for (let way = 0; way < ways; way++) {
      let rhs = base;
      const cells: number[] = [];
      const coef: number[] = [];
      let tooMany = false;
      const add = (c: number, w: number) => {
        const v = masks[c];
        if (single(v)) rhs -= w * bitIndex(v);
        else if (cells.length >= CAGE_RULE_CELLS) tooMany = true;
        else {
          cells.push(c);
          coef.push(w);
        }
      };
      for (const c of R.free) add(c, 1);
      R.partial.forEach((part, i) => {
        if (!((way >> i) & 1)) for (const c of part.inCells) add(c, 1);
        else {
          rhs -= g.cages[part.cage].sum;
          for (const c of part.outCells) add(c, -1);
        }
      });
      if (tooMany || !cells.length) continue;
      const sup = sumSupport(g, cells, coef, rhs);
      if (!sup) continue;
      const elim: Elim[] = [];
      for (let i = 0; i < cells.length; i++) {
        const gone = masks[cells[i]] & ~sup[i];
        if (gone) elim.push({ cell: cells[i], mask: gone });
      }
      if (elim.length) return { technique: 'cageRule', tier: 4, elim, focus: cells };
    }
  }
  return null;
};

/** The digits each cell can take in some assignment where sum(coef * digit) is rhs and peers differ. Null when none. */
function sumSupport(g: Grid, cells: number[], coef: number[], rhs: number): number[] | null {
  const { m, masks } = g;
  const N = m.N;
  const k = cells.length;
  const doms = cells.map((c) => masks[c]);
  const lo = doms.map((v, i) => (coef[i] > 0 ? bitIndex(v & -v) : -bitIndex(v)));
  const hi = doms.map((v, i) => (coef[i] > 0 ? bitIndex(v) : -bitIndex(v & -v)));
  const restLo = new Array<number>(k + 1).fill(0);
  const restHi = new Array<number>(k + 1).fill(0);
  for (let i = k - 1; i >= 0; i--) {
    restLo[i] = restLo[i + 1] + lo[i];
    restHi[i] = restHi[i + 1] + hi[i];
  }
  const sup = new Array<number>(k).fill(0);
  const vals = new Array<number>(k).fill(0);
  let full = false;
  const rec = (i: number, sum: number): void => {
    if (i === k) {
      if (sum !== rhs) return;
      full = true;
      for (let j = 0; j < k; j++) {
        sup[j] |= 1 << vals[j];
        if (sup[j] !== doms[j]) full = false;
      }
      return;
    }
    if (sum + restLo[i] > rhs || sum + restHi[i] < rhs) return;
    let v = doms[i];
    while (v) {
      const b = v & -v;
      v ^= b;
      const d = bitIndex(b);
      let ok = true;
      for (let j = 0; j < i; j++) {
        if (vals[j] === d && m.peerOf[cells[i] * N + cells[j]]) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      vals[i] = d;
      rec(i + 1, sum + coef[i] * d);
      if (full) return;
    }
  };
  rec(0, 0);
  for (let j = 0; j < k; j++) if (!sup[j]) return null;
  return sup;
}

// Tier 5 -------------------------------------------------------------------

/** k open cells of a house with only k digits between them: no other cell that sees them all can hold those digits. */
function nakedSubset(k: 2 | 3): Detector {
  return (g) => {
    const { m, masks } = g;
    for (let h = 0; h < m.houses.length; h++) {
      const open: number[] = [];
      for (const c of m.houses[h]) {
        const p = POP[masks[c]];
        if (p >= 2 && p <= k) open.push(c);
      }
      if (open.length < k) continue;
      for (let i = 0; i < open.length; i++) {
        for (let j = i + 1; j < open.length; j++) {
          const u2 = masks[open[i]] | masks[open[j]];
          if (k === 2) {
            if (POP[u2] !== 2) continue;
            const cells = [open[i], open[j]];
            const elim = seenByAll(g, cells, u2);
            if (elim) return { technique: 'nakedPair', tier: 5, elim, focus: cells };
            continue;
          }
          if (POP[u2] > 3) continue;
          for (let l = j + 1; l < open.length; l++) {
            const u3 = u2 | masks[open[l]];
            if (POP[u3] !== 3) continue;
            const cells = [open[i], open[j], open[l]];
            const elim = seenByAll(g, cells, u3);
            if (elim) return { technique: 'nakedTriple', tier: 5, elim, focus: cells };
          }
        }
      }
    }
    return null;
  };
}

/** k digits of a house with only k places between them: those cells hold nothing else. */
function hiddenSubset(k: 2 | 3): Detector {
  return (g, s) => {
    const { m, masks } = g;
    for (let h = 0; h < m.houses.length; h++) {
      const ds: number[] = [];
      for (let d = 1; d <= m.n; d++) {
        if (s.solved[h] & (1 << d)) continue;
        const p = POP[s.pos[h * 16 + d]];
        if (p >= 2 && p <= k) ds.push(d);
      }
      if (ds.length < k) continue;
      const house = m.houses[h];
      const tryCells = (pm: number, keep: number): Deduction | null => {
        const cells = cellsAt(house, pm);
        let elim: Elim[] | null = null;
        for (const c of cells) if (masks[c] & ~keep) (elim ??= []).push({ cell: c, mask: masks[c] & ~keep });
        return elim ? { technique: k === 2 ? 'hiddenPair' : 'hiddenTriple', tier: 5, elim, focus: cells } : null;
      };
      for (let i = 0; i < ds.length; i++) {
        for (let j = i + 1; j < ds.length; j++) {
          const p2 = s.pos[h * 16 + ds[i]] | s.pos[h * 16 + ds[j]];
          const keep2 = (1 << ds[i]) | (1 << ds[j]);
          if (k === 2) {
            if (POP[p2] !== 2) continue;
            const d = tryCells(p2, keep2);
            if (d) return d;
            continue;
          }
          if (POP[p2] > 3) continue;
          for (let l = j + 1; l < ds.length; l++) {
            const p3 = p2 | s.pos[h * 16 + ds[l]];
            if (POP[p3] !== 3) continue;
            const d = tryCells(p3, keep2 | (1 << ds[l]));
            if (d) return d;
          }
        }
      }
    }
    return null;
  };
}

export const nakedPair = nakedSubset(2);
export const hiddenPair = hiddenSubset(2);
export const nakedTriple = nakedSubset(3);
export const hiddenTriple = hiddenSubset(3);

// Tiers 6 and 7: fish --------------------------------------------------------

/**
 * Basic fish: k rows whose places for a digit lie in only k columns, so those
 * columns hold the digit in these rows and nowhere else (and the same with
 * rows and columns swapped). k = 2 is an X-Wing, k = 3 a Swordfish.
 */
function fish(k: 2 | 3): Detector {
  return (g, s) => {
    const { m, masks } = g;
    const { n } = m;
    for (let orient = 0; orient < 2; orient++) {
      const base = orient === 0 ? 0 : n;
      const cover = orient === 0 ? n : 0;
      for (let d = 1; d <= n; d++) {
        const b = 1 << d;
        const lines: number[] = [];
        for (let i = 0; i < n; i++) {
          const h = base + i;
          if (s.solved[h] & b) continue;
          const p = POP[s.pos[h * 16 + d]];
          if (p >= 2 && p <= k) lines.push(i);
        }
        if (lines.length < k) continue;
        const tryLines = (set: number[]): Deduction | null => {
          let u = 0, inBase = 0;
          for (const i of set) {
            u |= s.pos[(base + i) * 16 + d];
            inBase |= 1 << i;
          }
          if (POP[u] !== k) return null;
          let elim: Elim[] | null = null;
          for (let j = 0; j < n; j++) {
            if (!((u >> j) & 1)) continue;
            const cells = m.houses[cover + j];
            for (let i = 0; i < n; i++) {
              if ((inBase >> i) & 1) continue;
              const c = cells[i];
              if (masks[c] & b && !single(masks[c])) (elim ??= []).push({ cell: c, mask: b });
            }
          }
          if (!elim) return null;
          const focus = set.flatMap((i) => cellsAt(m.houses[base + i], s.pos[(base + i) * 16 + d]));
          return { technique: k === 2 ? 'xWing' : 'swordfish', tier: k === 2 ? 6 : 7, elim, focus };
        };
        for (let a = 0; a < lines.length; a++) {
          for (let c = a + 1; c < lines.length; c++) {
            if (k === 2) {
              const r = tryLines([lines[a], lines[c]]);
              if (r) return r;
              continue;
            }
            for (let e = c + 1; e < lines.length; e++) {
              const r = tryLines([lines[a], lines[c], lines[e]]);
              if (r) return r;
            }
          }
        }
      }
    }
    return null;
  };
}

export const xWing = fish(2);
export const swordfish = fish(3);

// Tier 6: single-digit strong links ------------------------------------------

/**
 * Skyscraper: two rows where a digit has exactly two places, with one place
 * of each in the same column. One of the two other ends holds the digit, so
 * a cell that sees both cannot. Also with rows and columns swapped.
 */
export const skyscraper: Detector = (g, s) => {
  const { m } = g;
  const { n } = m;
  for (let orient = 0; orient < 2; orient++) {
    const base = orient === 0 ? 0 : n;
    for (let d = 1; d <= n; d++) {
      const b = 1 << d;
      const lines: number[] = [];
      for (let i = 0; i < n; i++) {
        const h = base + i;
        if (!(s.solved[h] & b) && POP[s.pos[h * 16 + d]] === 2) lines.push(h);
      }
      for (let i = 0; i < lines.length; i++) {
        for (let j = i + 1; j < lines.length; j++) {
          const pa = s.pos[lines[i] * 16 + d], pb = s.pos[lines[j] * 16 + d];
          const shared = pa & pb;
          if (POP[shared] !== 1) continue;
          const ha = m.houses[lines[i]], hb = m.houses[lines[j]];
          const at = bitIndex(shared);
          const ea = ha[bitIndex(pa & ~shared)], eb = hb[bitIndex(pb & ~shared)];
          const elim = seenByAll(g, [ea, eb], b);
          if (elim) return { technique: 'skyscraper', tier: 6, elim, focus: [ha[at], ea, hb[at], eb] };
        }
      }
    }
  }
  return null;
};

/**
 * 2-String Kite: a digit with exactly two places in a row and two in a
 * column, one end of each in the same box. One of the two far ends holds the
 * digit, so a cell that sees both cannot.
 */
export const kite: Detector = (g, s) => {
  const { m } = g;
  const { n, boxOf } = m;
  for (let d = 1; d <= n; d++) {
    const b = 1 << d;
    const rows: number[][] = [], cols: number[][] = [];
    for (let i = 0; i < n; i++) {
      if (!(s.solved[i] & b) && POP[s.pos[i * 16 + d]] === 2) rows.push(cellsAt(m.houses[i], s.pos[i * 16 + d]));
      const h = n + i;
      if (!(s.solved[h] & b) && POP[s.pos[h * 16 + d]] === 2) cols.push(cellsAt(m.houses[h], s.pos[h * 16 + d]));
    }
    for (const r of rows) {
      for (const c of cols) {
        if (r[0] === c[0] || r[0] === c[1] || r[1] === c[0] || r[1] === c[1]) continue;
        for (let i = 0; i < 2; i++) {
          for (let j = 0; j < 2; j++) {
            if (boxOf[r[i]] !== boxOf[c[j]]) continue;
            const er = r[1 - i], ec = c[1 - j];
            const elim = seenByAll(g, [er, ec], b);
            if (elim) return { technique: 'kite', tier: 6, elim, focus: [r[i], er, c[j], ec] };
          }
        }
      }
    }
  }
  return null;
};

// Tier 7: wings -------------------------------------------------------------

function bivalueCells(g: Grid): number[] {
  const out: number[] = [];
  for (let c = 0; c < g.m.N; c++) if (POP[g.masks[c]] === 2) out.push(c);
  return out;
}

/**
 * XY-Wing: a pivot with candidates xy sees a cell with xz and a cell with yz.
 * Whichever the pivot holds, one of the two holds z, so a cell that sees both
 * cannot.
 */
export const xyWing: Detector = (g) => {
  const { m, masks } = g;
  for (const P of bivalueCells(g)) {
    const mp = masks[P];
    const wings: number[] = [];
    for (const A of m.peers[P]) {
      const ma = masks[A];
      if (POP[ma] === 2 && ma !== mp && POP[ma & mp] === 1) wings.push(A);
    }
    for (let i = 0; i < wings.length; i++) {
      for (let j = i + 1; j < wings.length; j++) {
        const A = wings[i], B = wings[j];
        const ma = masks[A], mb = masks[B];
        if ((ma & mp) === (mb & mp)) continue;
        const z = ma & ~mp;
        if (z !== (mb & ~mp)) continue;
        const elim = seenByAll(g, [A, B], z);
        if (elim) return { technique: 'xyWing', tier: 7, elim, focus: [P, A, B] };
      }
    }
  }
  return null;
};

/**
 * XYZ-Wing: a pivot with candidates xyz sees a cell with xz and a cell with
 * yz. One of the three holds z, so a cell that sees all three cannot.
 */
export const xyzWing: Detector = (g) => {
  const { m, masks } = g;
  for (let P = 0; P < m.N; P++) {
    const mp = masks[P];
    if (POP[mp] !== 3) continue;
    const wings: number[] = [];
    for (const A of m.peers[P]) {
      const ma = masks[A];
      if (POP[ma] === 2 && (ma & ~mp) === 0) wings.push(A);
    }
    for (let i = 0; i < wings.length; i++) {
      for (let j = i + 1; j < wings.length; j++) {
        const A = wings[i], B = wings[j];
        if (masks[A] === masks[B]) continue;
        const z = masks[A] & masks[B];
        const elim = seenByAll(g, [P, A, B], z);
        if (elim) return { technique: 'xyzWing', tier: 7, elim, focus: [P, A, B] };
      }
    }
  }
  return null;
};

/**
 * W-Wing: two cells with the same two candidates xy that do not see each
 * other, joined by a digit x that has only two places in some house, one
 * seeing each cell. They cannot both be x, so one of them is y, and a cell
 * that sees both cannot be y.
 */
export const wWing: Detector = (g, s) => {
  const { m, masks } = g;
  const N = m.N;
  const bi = bivalueCells(g);
  for (let i = 0; i < bi.length; i++) {
    for (let j = i + 1; j < bi.length; j++) {
      const A = bi[i], B = bi[j];
      const mab = masks[A];
      if (masks[B] !== mab || m.peerOf[A * N + B]) continue;
      for (let v = mab; v; v &= v - 1) {
        const wb = v & -v;
        const w = bitIndex(wb);
        const e = mab & ~wb;
        for (let h = 0; h < m.houses.length; h++) {
          if (s.solved[h] & wb) continue;
          const pm = s.pos[h * 16 + w];
          if (POP[pm] !== 2) continue;
          const [E, F] = cellsAt(m.houses[h], pm);
          if (E === A || E === B || F === A || F === B) continue;
          const ok = (m.peerOf[E * N + A] && m.peerOf[F * N + B]) || (m.peerOf[E * N + B] && m.peerOf[F * N + A]);
          if (!ok) continue;
          const elim = seenByAll(g, [A, B], e);
          if (elim) return { technique: 'wWing', tier: 7, elim, focus: [A, B, E, F] };
        }
      }
    }
  }
  return null;
};

// Tier 8 --------------------------------------------------------------------
//
// Tier 8 is held to a human scale and must prove the cell itself: a cell is
// tier 8 when, on the board closed at tier 7, one chain of at most
// TIER8.links links leaves it with only its digit, or one forcing chain
// does: a cell with two or three candidates where every candidate, within
// TIER8.rounds rounds of propagation, either breaks a rule or puts that digit
// in that cell. Nothing cascades after it, so a player who finds the chain
// places its target, and the target's consequences come later as the easier
// placements they then are. Anything else is a guess, tier 0. Both measures
// only shrink as correct digits are added, so whatever the ladder proves
// stays proven as the board fills.

export interface Tier8Limits {
  /** Longest chain, in links. */
  links: number;
  /** Rounds of propagation a forcing chain may take. */
  rounds: number;
}

export const TIER8: Readonly<Tier8Limits> = { links: 9, rounds: 5 };

/** A cell that one tier 8 deduction proves on its own. */
export interface Proof {
  cell: number;
  digit: number;
  technique: 'chain' | 'forcing';
  /** Links of the chain, or rounds of the forcing chain. */
  size: number;
  /** Cells that carry it: the chain, or the forcing cell and the target. */
  focus: number[];
}

/**
 * Cells that one alternating inference chain proves. A candidate is a node.
 * A strong link joins two candidates of which one must be true: the two
 * places of a digit in a house, or the two candidates of a cell. A weak link
 * joins two that cannot both be true: the same digit in peers, or two digits
 * of one cell. Starting from a candidate assumed false, links alternate
 * strong, weak, strong, and every candidate reached as true makes "start or
 * end" true, so the candidates weakly linked to both ends go. When those are
 * every other candidate of a cell, or the chain comes back to the start as
 * true, the chain proves that cell. X-chains (one digit) and XY-chains (cells
 * with two candidates) are the simplest of these. Keeps the shortest chain
 * for each cell; with only set, looks at that cell alone.
 */
export function chainProofs(g: Grid, s: Scan, maxLinks: number, only = -1): Proof[] {
  const { m, masks } = g;
  const { N, houses, peers } = m;
  const nodeAt = new Int32Array(N * 16).fill(-1);
  const cellOf: number[] = [];
  const digOf: number[] = [];
  for (let c = 0; c < N; c++) {
    let v = masks[c];
    if (single(v)) continue;
    while (v) {
      const b = v & -v;
      v ^= b;
      nodeAt[c * 16 + bitIndex(b)] = cellOf.length;
      cellOf.push(c);
      digOf.push(bitIndex(b));
    }
  }
  const V = cellOf.length;
  if (!V) return [];
  const strong: number[][] = Array.from({ length: V }, () => []);
  const link = (a: number, b: number) => {
    if (a < 0 || b < 0 || strong[a].includes(b)) return;
    strong[a].push(b);
    strong[b].push(a);
  };
  for (let c = 0; c < N; c++) {
    const v = masks[c];
    if (POP[v] === 2) link(nodeAt[c * 16 + bitIndex(v & -v)], nodeAt[c * 16 + bitIndex(v)]);
  }
  for (let h = 0; h < houses.length; h++) {
    for (let d = 1; d <= m.n; d++) {
      if (s.solved[h] & (1 << d)) continue;
      const pm = s.pos[h * 16 + d];
      if (POP[pm] !== 2) continue;
      const [p, q] = cellsAt(houses[h], pm);
      link(nodeAt[p * 16 + d], nodeAt[q * 16 + d]);
    }
  }
  const weak: number[][] = new Array(V);
  for (let u = 0; u < V; u++) {
    const c = cellOf[u], b = 1 << digOf[u];
    const list: number[] = [];
    for (let v = masks[c] & ~b; v; v &= v - 1) list.push(nodeAt[c * 16 + bitIndex(v & -v)]);
    const pc = peers[c];
    for (let i = 0; i < pc.length; i++) {
      const x = pc[i];
      if (masks[x] & b && !single(masks[x])) list.push(nodeAt[x * 16 + digOf[u]]);
    }
    weak[u] = list;
  }

  // States: node * 2 for "false", node * 2 + 1 for "true".
  const seen = new Int32Array(2 * V);
  const dist = new Int16Array(2 * V);
  const prev = new Int32Array(2 * V);
  const mark = new Int32Array(V);
  const queue = new Int32Array(2 * V);
  const gone = new Int32Array(N);
  const touched: number[] = [];
  const best = new Map<number, Proof>();
  const record = (cell: number, digit: number, links: number, end: number) => {
    const old = best.get(cell);
    if (old && old.size <= links) return;
    const path: number[] = [];
    for (let t = end; t >= 0; t = prev[t]) path.push(cellOf[t >> 1]);
    path.reverse().push(cell);
    best.set(cell, { cell, digit, technique: 'chain', size: links, focus: [...new Set(path)] });
  };
  for (let s0 = 0; s0 < V; s0++) {
    const stamp = s0 + 1;
    for (const x of weak[s0]) mark[x] = stamp;
    let head = 0, tail = 0;
    seen[2 * s0] = stamp;
    dist[2 * s0] = 0;
    prev[2 * s0] = -1;
    queue[tail++] = 2 * s0;
    while (head < tail) {
      const st = queue[head++];
      const dd = dist[st];
      if (dd >= maxLinks) break;
      const u = st >> 1;
      const on = (st & 1) === 0;
      for (const v of on ? strong[u] : weak[u]) {
        const ns = on ? 2 * v + 1 : 2 * v;
        if (seen[ns] === stamp) continue;
        seen[ns] = stamp;
        dist[ns] = dd + 1;
        prev[ns] = st;
        queue[tail++] = ns;
        if (!on) continue;
        // v is true whenever the start is false.
        if (v === s0) {
          if (only < 0 || cellOf[s0] === only) record(cellOf[s0], digOf[s0], dd + 1, ns);
          continue;
        }
        for (const x of weak[v]) {
          if (mark[x] !== stamp) continue;
          const c = cellOf[x];
          if (only >= 0 && c !== only) continue;
          if (!gone[c]) touched.push(c);
          gone[c] |= 1 << digOf[x];
        }
        for (const c of touched) {
          const left = masks[c] & ~gone[c];
          if (single(left)) record(c, bitIndex(left), dd + 1, ns);
          gone[c] = 0;
        }
        touched.length = 0;
      }
    }
  }
  return [...best.values()];
}

/**
 * One branch of a forcing chain, counted in rounds: put digit d in cell c,
 * then apply, all at once, everything that follows directly from the board as
 * it stood at the start of the round: solved cells clear their peers, a digit
 * with one place left in a house goes there, and each clue rules out what it
 * can on its own. Stops at a fixpoint or after maxRounds rounds. broke is the
 * round in which a cell or a house ran out of options (0 when none did),
 * masks the board where it stopped, and at[x] the round in which cell x came
 * down to one digit. Every rule only removes more from a fuller board, so a
 * branch breaks, and a cell comes down to its digit, no later as correct
 * digits are added, unlike a count of forced cells, which grows with whatever
 * else a fuller board forces on the way.
 */
export function branchRounds(m: Model, start: ArrayLike<number>, cell: number, digit: number, maxRounds: number): { broke: number; masks: Int32Array; at: Uint8Array } {
  const { peers, houses, cellHouses, cellCons, cons, all } = m;
  let cur = Int32Array.from(start);
  const at = new Uint8Array(cur.length);
  cur[cell] = 1 << digit;
  let changed = [cell];
  const houseAt = new Int32Array(houses.length);
  const conAt = new Int32Array(cons.length);
  const fail = (round: number) => ({ broke: round, masks: cur, at });
  for (let round = 1; round <= maxRounds; round++) {
    const next = cur.slice();
    const hs: number[] = [], ks: number[] = [];
    for (const x of changed) {
      const v = cur[x];
      if (single(v)) {
        const pc = peers[x];
        for (let i = 0; i < pc.length; i++) next[pc[i]] &= ~v;
      }
      for (const h of cellHouses[x]) {
        if (houseAt[h] !== round) {
          houseAt[h] = round;
          hs.push(h);
        }
      }
      for (const k of cellCons[x]) {
        if (conAt[k] !== round) {
          conAt[k] = round;
          ks.push(k);
        }
      }
    }
    for (const h of hs) {
      const cells = houses[h];
      let once = 0, twice = 0;
      for (const x of cells) {
        const v = cur[x];
        twice |= once & v;
        once |= v;
      }
      if (once !== all) return fail(round);
      const uniq = once & ~twice;
      if (!uniq) continue;
      for (const x of cells) {
        const u = cur[x] & uniq;
        if (!u) continue;
        if (u & (u - 1)) return fail(round);
        next[x] &= u;
      }
    }
    for (const k of ks) {
      const con = cons[k];
      const sup = support(con, cur);
      if (!sup) return fail(round);
      for (let i = 0; i < sup.length; i++) next[con.cells[i]] &= sup[i];
    }
    const now: number[] = [];
    for (let x = 0; x < next.length; x++) {
      if (next[x] === cur[x]) continue;
      if (!next[x]) return fail(round);
      if (single(next[x])) at[x] = round;
      now.push(x);
    }
    if (!now.length) break;
    cur = next;
    changed = now;
  }
  return { broke: 0, masks: cur, at };
}

/** The round in which putting d in c breaks a rule, or 0 when it does not within maxRounds. */
export function refuteRounds(m: Model, start: ArrayLike<number>, cell: number, digit: number, maxRounds: number): number {
  return branchRounds(m, start, cell, digit, maxRounds).broke;
}

/**
 * Cells that one forcing chain proves: some cell with two or three
 * candidates, possibly the cell itself, where every candidate within
 * maxRounds rounds either breaks a rule or puts the same digit in the cell.
 * Keeps the quickest for each cell; with only set, looks at that cell alone.
 */
export function forcingProofs(g: Grid, maxRounds: number, only = -1): Proof[] {
  const { m, masks } = g;
  const best = new Map<number, Proof>();
  for (let a = 0; a < m.N; a++) {
    const k = POP[masks[a]];
    if (k < 2 || k > 3) continue;
    const live: { masks: Int32Array; at: Uint8Array }[] = [];
    let deep = 0;
    for (let d = 1; d <= m.n; d++) {
      if (!(masks[a] & (1 << d))) continue;
      const b = branchRounds(m, masks, a, d, maxRounds);
      if (b.broke) deep = Math.max(deep, b.broke);
      else live.push(b);
    }
    if (!live.length) continue;
    for (let t = only >= 0 ? only : 0; t < (only >= 0 ? only + 1 : m.N); t++) {
      if (single(masks[t])) continue;
      const v = live[0].masks[t];
      if (!single(v) || !live.every((b) => b.masks[t] === v)) continue;
      let size = deep;
      for (const b of live) size = Math.max(size, b.at[t]);
      const old = best.get(t);
      if (!old || size < old.size) best.set(t, { cell: t, digit: bitIndex(v), technique: 'forcing', size, focus: a === t ? [a] : [a, t] });
    }
  }
  return [...best.values()];
}

/**
 * Every cell a tier 8 deduction proves on its own from the board as it
 * stands, with the simplest proof for each: a chain when there is one, the
 * shortest first, otherwise the quickest forcing chain.
 */
export function tier8Proofs(g: Grid, limits: Tier8Limits, only = -1): Map<number, Proof> {
  const out = new Map<number, Proof>();
  for (const pr of chainProofs(g, scan(g), limits.links, only)) out.set(pr.cell, pr);
  if (only >= 0 && out.has(only)) return out;
  for (const pr of forcingProofs(g, limits.rounds, only)) if (!out.has(pr.cell)) out.set(pr.cell, pr);
  return out;
}

/** Every pattern detector of tiers 4 to 7, in the order the ladder tries them. */
export const PATTERNS: readonly { tier: number; detect: readonly Detector[] }[] = [
  { tier: 4, detect: [lockedCandidates, cageRule] },
  { tier: 5, detect: [nakedPair, hiddenPair, nakedTriple, hiddenTriple] },
  { tier: 6, detect: [xWing, skyscraper, kite] },
  { tier: 7, detect: [swordfish, xyWing, xyzWing, wWing] },
];

/** Detectors of tiers 4 to 7 by technique, for tests. */
export const DETECTORS = {
  lockedCandidates, cageRule, nakedPair, hiddenPair, nakedTriple, hiddenTriple,
  xWing, skyscraper, kite, swordfish, xyWing, xyzWing, wWing,
} as const;

/** The cheapest pattern deduction of tier 4 up to maxTier (at most 7). */
export function findPattern(g: Grid, maxTier: number): Deduction | null {
  const s = scan(g);
  for (const { tier, detect } of PATTERNS) {
    if (tier > maxTier) break;
    for (const f of detect) {
      const d = f(g, s);
      if (d) return d;
    }
  }
  return null;
}
