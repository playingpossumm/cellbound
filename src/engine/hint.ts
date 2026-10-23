// Hints: run the logical solver from the player's grid to the next placement,
// then explain it in three steps (where to look, which rule, the move).
import { Logic, type Step } from './logic';
import { bitsOf, buildModel, knightCells, type Con, type Model } from './model';
import type { CellIndex, Digit, HintRule, HintStep, Puzzle } from './types';

function joinWith(items: string[], word: string): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} ${word} ${items[items.length - 1]}`;
}

const list = (ds: number[]) => joinWith(ds.map(String), 'and');
/** "a 5", but "an 8". */
const aDigit = (d: number) => (d === 8 ? `an ${d}` : `a ${d}`);
const listOr = (ds: number[]) => joinWith(ds.map(String), 'or');
const joinAnd = (xs: string[]) => joinWith(xs, 'and');

/** Joins clauses that may contain their own "and": a comma before the last one. */
function clauses(parts: string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function cellName(n: number, c: CellIndex): string {
  return `row ${Math.floor(c / n) + 1}, column ${(c % n) + 1}`;
}

function houseName(m: Model, h: number): string {
  const k = m.houseKind[h];
  if (k === 'diagonal') return m.houseNum[h] === 0 ? 'the falling diagonal' : 'the rising diagonal';
  return `${k} ${m.houseNum[h] + 1}`;
}

function houseRule(m: Model, h: number): HintRule {
  const k = m.houseKind[h];
  return k === 'diagonal' ? 'diagonal' : k;
}

function clueName(p: Puzzle, con: Con): string {
  if (con.kind === 'negKropki') return 'the missing dot';
  const clue = p.clues[con.clue];
  switch (clue.kind) {
    case 'thermo': return 'the thermometer';
    case 'arrow': return 'the arrow';
    case 'cage': return clue.sum == null ? 'the cage' : `the ${clue.sum} cage`;
    case 'renban': return 'the renban line';
    case 'whisper': return 'the whisper line';
    case 'kropki': return clue.color === 'white' ? 'the white dot' : 'the black dot';
    case 'xv': return clue.sum === 10 ? 'the X' : 'the V';
    default: return 'the clue';
  }
}

function conRule(con: Con): HintRule {
  return con.kind === 'negKropki' ? 'kropki' : con.kind;
}

const HOUSE_RULES: HintRule[] = ['row', 'column', 'box', 'region', 'cell'];

interface PeerGroup {
  label: string;
  rule: HintRule;
  /** Verb when this is the only group: "row 3 already has", "the cage already holds". */
  verb: string;
  ds: number[];
}

/** Digits held by cells that see c, each credited to the first group holding it: houses, knight cells, shared clues. */
function peerGroups(p: Puzzle, m: Model, grid: Digit[], c: CellIndex): PeerGroup[] {
  const taken = new Set<number>();
  const out: PeerGroup[] = [];
  const collect = (cells: CellIndex[]) => {
    const ds: number[] = [];
    for (const q of cells) {
      const d = grid[q];
      if (q !== c && d && !taken.has(d)) { taken.add(d); ds.push(d); }
    }
    return ds.sort((a, b) => a - b);
  };
  for (const h of m.cellHouses[c]) {
    const ds = collect(m.houses[h]);
    if (ds.length) out.push({ label: houseName(m, h), rule: houseRule(m, h), verb: 'has', ds });
  }
  if (m.hasAntiKnight) {
    const ds = collect(knightCells(m.n, c));
    if (ds.length) out.push({ label: "the cells a knight's move away", rule: 'antiKnight', verb: 'hold', ds });
  }
  for (const con of m.cons) {
    if (!con.cells.includes(c) || !(con.kind === 'cage' || con.kind === 'renban' || con.kind === 'thermo')) continue;
    const ds = collect(con.cells);
    if (ds.length) out.push({ label: clueName(p, con), rule: conRule(con), verb: 'holds', ds });
  }
  return out;
}

interface StepSource {
  key: string;
  /** Pointing, pairs and tests, as opposed to a clue. */
  tech: boolean;
  rule: HintRule;
  /** Noun phrase naming the reason, for the given digits. */
  label: (ds: number[]) => string;
  /** Clause for the digits this step removed from the cell in question. */
  text: (ds: number[]) => string;
}

/** Describes one solver step. Steps with the same key give the same reason. */
function stepSource(p: Puzzle, m: Model, s: Step, keep: Digit): StepSource {
  switch (s.kind) {
    case 'clue': {
      const con = m.cons[s.con!];
      const name = clueName(p, con);
      return {
        key: `c${s.con}`,
        tech: false,
        label: () => name,
        rule: conRule(con),
        text: (ds) => {
          if (con.kind === 'thermo') {
            const lo = Math.max(...ds), hi = Math.min(...ds);
            if (lo < keep && ds.length === lo) return `${name} needs more than ${lo} here`;
            if (hi > keep && ds.length === m.n - hi + 1) return `${name} needs less than ${hi} here`;
          }
          return `${name} rules out ${list(ds)} here`;
        },
      };
    }
    case 'locked': {
      const from = houseName(m, s.house!), into = houseName(m, s.house2!);
      return {
        key: `l${s.house}:${s.house2}`,
        tech: true,
        rule: houseRule(m, s.house!),
        label: (ds) => `the ${list(ds)} that ${from} must place in ${into}`,
        text: (ds) => `the ${list(ds)} of ${from} must sit in ${into}, which rules ${ds.length > 1 ? 'them' : 'it'} out here`,
      };
    }
    case 'nakedPair': {
      const house = houseName(m, s.house!);
      return {
        key: `np${s.house}:${s.digits!.join('')}`,
        tech: true,
        rule: houseRule(m, s.house!),
        label: () => `the ${list(s.digits!)} pair in ${house}`,
        text: (ds) => `two cells of ${house} can only hold ${list(s.digits!)}, which rules out ${list(ds)} here`,
      };
    }
    case 'hiddenPair': {
      const house = houseName(m, s.house!);
      return {
        key: `hp${s.house}:${s.digits!.join('')}`,
        tech: true,
        rule: houseRule(m, s.house!),
        label: () => `the hidden ${list(s.digits!)} pair in ${house}`,
        text: (ds) => `only two cells of ${house} can take ${list(s.digits!)}, which leaves no room for ${list(ds)} here`,
      };
    }
    default:
      return {
        key: 'probe',
        tech: true,
        rule: 'cell',
        label: () => 'a quick test of the options',
        text: (ds) => `putting ${listOr(ds)} here quickly breaks a rule`,
      };
  }
}

/** One sentence for one or two reasons, short sentences for more. */
function conclude(parts: string[], digit: Digit): string {
  if (parts.length <= 2) return `${cap(clauses(parts))}, so this cell is ${digit}.`;
  return `${parts.map((x) => `${cap(x)}.`).join(' ')} So this cell is ${digit}.`;
}

function solutionHint(p: Puzzle, c: CellIndex, why: string): HintStep[] {
  const d = p.solution[c];
  return [
    { level: 1, focus: [c], rule: 'cell', text: `Look at ${cellName(p.size, c)}.` },
    { level: 2, focus: [c], rule: 'cell', text: why },
    { level: 3, focus: [c], rule: 'cell', text: `This cell is ${d}.`, move: { cell: c, digit: d } },
  ];
}

function eliminations(steps: Step[]): { cell: CellIndex; digits: Digit[] }[] | undefined {
  const out: { cell: CellIndex; digits: Digit[] }[] = [];
  for (const st of steps) for (const e of st.elim) out.push({ cell: e.cell, digits: bitsOf(e.mask) });
  return out.length ? out : undefined;
}

function nakedHint(p: Puzzle, m: Model, grid: Digit[], pre: Step[], cell: CellIndex, digit: Digit): HintStep[] {
  const groups = peerGroups(p, m, grid, cell);
  const seen = new Set(groups.flatMap((g) => g.ds));
  const bySource = new Map<string, { src: StepSource; ds: number[] }>();
  const unexplained: number[] = [];
  for (let d = 1; d <= m.n; d++) {
    if (d === digit || seen.has(d)) continue;
    const st = pre.find((x) => x.elim.some((e) => e.cell === cell && e.mask & (1 << d)));
    if (!st) { unexplained.push(d); continue; }
    const src = stepSource(p, m, st, digit);
    const hit = bySource.get(src.key);
    if (hit) hit.ds.push(d);
    else bySource.set(src.key, { src, ds: [d] });
  }
  // Clues first, then pointing and pairs, and a quick test last.
  const rank = (k: string) => (k.startsWith('c') ? 0 : k.startsWith('l') ? 1 : k === 'probe' ? 3 : 2);
  const reasons = [...bySource.values()].sort((a, b) => rank(a.src.key) - rank(b.src.key));
  const parts: string[] = [];
  if (groups.length === 1) parts.push(`${groups[0].label} already ${groups[0].verb} ${list(groups[0].ds)}`);
  else if (groups.length > 1) parts.push(`${joinAnd(groups.map((g) => g.label))} already hold ${list([...seen].sort((a, b) => a - b))}`);
  for (const { src, ds } of reasons) parts.push(src.text(ds));
  if (unexplained.length) parts.push(`${list(unexplained)} cannot fit here`);
  const clueSrc = reasons.find((r) => !HOUSE_RULES.includes(r.src.rule))?.src ?? groups.find((g) => !HOUSE_RULES.includes(g.rule));
  const rule: HintRule = clueSrc?.rule ?? groups[0]?.rule ?? reasons[0]?.src.rule ?? 'cell';
  const main = [...new Set([...groups.map((g) => g.label), ...reasons.filter((r) => !r.src.tech).map((r) => r.src.label(r.ds))])];
  const tech = reasons.filter((r) => r.src.tech).map((r) => r.src.label(r.ds));
  const use = main.length ? `Use ${joinAnd(main)} to rule out every digit but one.` : 'Rule out every digit but one.';
  const also = tech.length ? ` You will also need ${joinAnd(tech)}.` : '';
  return [
    { level: 1, focus: [cell], rule, text: `Look at ${cellName(m.n, cell)}. Only one digit fits there.` },
    { level: 2, focus: [cell], rule, text: use + also },
    { level: 3, focus: [cell], rule, text: conclude(parts, digit), move: { cell, digit }, eliminate: eliminations(pre) },
  ];
}

function hiddenHint(p: Puzzle, m: Model, grid: Digit[], pre: Step[], h: number, cell: CellIndex, digit: Digit): HintStep[] {
  const hName = houseName(m, h);
  const others = m.houses[h].filter((q) => q !== cell && !grid[q]);
  const blockers = new Map<string, StepSource>();
  for (const q of others) {
    if (m.peers[q].some((x) => grid[x] === digit)) continue;
    const st = pre.find((x) => x.elim.some((e) => e.cell === q && e.mask & (1 << digit)));
    if (!st) continue;
    const src = stepSource(p, m, st, digit);
    blockers.set(src.key, src);
  }
  const srcs = [...blockers.values()];
  const labels = [...new Set(srcs.map((s) => s.label([digit])))];
  const rule: HintRule = srcs.find((s) => !s.tech)?.rule ?? srcs[0]?.rule ?? houseRule(m, h);
  const text = !others.length
    ? `${cap(hName)} is missing only ${aDigit(digit)}, so this cell is ${digit}.`
    : labels.length
      ? `${cap(hName)} needs ${aDigit(digit)}. The other empty cells in it either see ${aDigit(digit)} already or are blocked by ${joinAnd(labels)}, so this cell is ${digit}.`
      : `${cap(hName)} needs ${aDigit(digit)}. Every other empty cell in it already sees ${aDigit(digit)}, so this cell is ${digit}.`;
  const why = labels.length ? ` Use ${joinAnd(labels)} to find it.` : '';
  return [
    { level: 1, focus: m.houses[h].slice(), rule, text: `Look at ${hName}.` },
    { level: 2, focus: m.houses[h].slice(), rule, text: `${cap(hName)} has only one place left for one of its digits.${why}` },
    { level: 3, focus: [cell], rule, text, move: { cell, digit }, eliminate: eliminations(pre) },
  ];
}

export function hintFor(p: Puzzle, values: Digit[], notes?: number[]): HintStep[] | null {
  const n = p.size;
  const N = n * n;
  for (let c = 0; c < N; c++) {
    if (values[c] && !p.givens[c] && values[c] !== p.solution[c]) {
      return solutionHint(p, c, `The ${values[c]} in ${cellName(n, c)} is not right. Clear it and look again.`);
    }
  }
  if (notes) {
    for (let c = 0; c < N; c++) {
      if (!values[c] && !p.givens[c] && notes[c] && !(notes[c] & (1 << p.solution[c]))) {
        return solutionHint(p, c, `Your notes in ${cellName(n, c)} leave out the digit that belongs there.`);
      }
    }
  }
  const grid = values.map((v, i) => p.givens[i] || v || 0);
  if (grid.every((v) => v)) return null;
  const m = buildModel(p);
  const L = new Logic(m, grid);
  L.probeWidth = n;
  const pre: Step[] = [];
  let s: Step | null = null;
  for (let i = 0; i < 400; i++) {
    const st = L.next(4);
    if (!st) break;
    if (st.place) { s = st; break; }
    pre.push(st);
  }
  if (!s || s.place!.digit !== p.solution[s.place!.cell]) {
    // No clean deduction: point at the most constrained empty cell.
    let best = -1, bc = 99;
    for (let c = 0; c < N; c++) {
      if (grid[c]) continue;
      const k = bitsOf(L.masks[c]).length;
      if (k < bc) { bc = k; best = c; }
    }
    return best < 0 ? null : solutionHint(p, best, 'This cell has the fewest options left. Test each one against the clues around it.');
  }
  const { cell, digit } = s.place!;
  return s.kind === 'naked' ? nakedHint(p, m, grid, pre, cell, digit) : hiddenHint(p, m, grid, pre, s.house!, cell, digit);
}
