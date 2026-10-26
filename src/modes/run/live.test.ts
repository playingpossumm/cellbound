import { describe, expect, it } from 'vitest';
import { LYRA } from '../../engine/fixtures';
import { TECHNIQUES, type PlacementClass, type TechniqueId } from '../../engine/techniques';
import { completedClues, completedUnits, fullGrid } from '../../game/logic';
import { applyPlaced, markFilled, newLive, type Placed } from './live';
import type { RunState } from './model';
import { newRun } from './state';
import { HEARTS } from './tuning';

const P = LYRA;
const empty = P.givens.map((d, i) => (d ? -1 : i)).filter((i) => i >= 0);
const cls = (technique: TechniqueId): PlacementClass => ({ technique, tier: TECHNIQUES[technique].tier, name: TECHNIQUES[technique].name, focus: [] });

/** A run with a board in play on LYRA. */
function onBoard(over: Partial<RunState> = {}, rule: RunState['bosses'][number] | null = null): RunState {
  const run = { ...newRun('t:live', null, 1), ...over };
  const live = newLive(run, { key: 'k', slot: 0, target: 100, rule, stolen: [], fog: false, mods: {} });
  return { ...run, phase: 'board', live };
}

/** The event the game store would send for a digit, given the entries so far. */
function event(values: number[], cell: number, digit: number, over: Partial<Placed> = {}): Placed {
  const after = values.slice();
  after[cell] = digit;
  const grid = fullGrid(P, after);
  const correct = digit === P.solution[cell];
  return {
    key: 'k',
    cell,
    digit,
    correct,
    source: 'player',
    assisted: false,
    units: correct ? completedUnits(P, grid, cell) : [],
    clues: correct ? completedClues(P, grid, cell) : [],
    puzzle: P,
    noted: new Array(36).fill(false),
    missed: new Array(36).fill(false),
    helped: new Array(36).fill(false),
    ...over,
  };
}

/** Plays every empty cell in order, all as singles, and returns the run. */
function playAll(run: RunState, technique: TechniqueId = 'nakedSingle', over: Partial<Placed> = {}) {
  const values = new Array(36).fill(0);
  for (const i of empty) {
    const e = event(values, i, P.solution[i], over);
    values[i] = P.solution[i];
    run = applyPlaced(run, e, cls(technique)).run;
  }
  return run;
}

describe('the board in play', () => {
  it('scores each correct digit once, building the flow, and keeps a tally per technique', () => {
    let run = onBoard();
    const values = new Array(36).fill(0);
    const a = empty[0];
    const first = applyPlaced(run, event(values, a, P.solution[a]), cls('hiddenSingle'));
    expect(first.out.popup).toMatchObject({ cell: a, name: 'Hidden single', points: 20, tier: 2 });
    expect(first.out.tally).toMatchObject({ chips: 20, mult: 1, points: 20 });
    run = first.run;
    expect(run.live!.score).toBe(20);
    // Undone and typed again: the cell has scored already.
    const again = applyPlaced(run, event(values, a, P.solution[a]), cls('hiddenSingle'));
    expect(again.run).toBe(run);
    values[a] = P.solution[a];
    const b = empty[1];
    run = applyPlaced(run, event(values, b, P.solution[b]), cls('nakedSingle')).run;
    expect(run.live!.streak).toBe(2);
    expect(run.live!.tech).toEqual({ hiddenSingle: { n: 1, points: 20, top: 20 }, nakedSingle: { n: 1, points: 11, top: 11 } });
    expect(run.live!.best).toEqual({ technique: 'hiddenSingle', points: 20 });
  });

  it('never names a full house the best placement, though it finishes the most units', () => {
    let run = onBoard();
    const values = new Array(36).fill(0);
    const [a, b] = empty;
    run = applyPlaced(run, event(values, a, P.solution[a]), cls('nakedSingle')).run;
    values[a] = P.solution[a];
    // Worth more than the single, but only the last cell of its units.
    const second = applyPlaced(run, event(values, b, P.solution[b], { units: [{ kind: 'row', index: 0, cells: [] }, { kind: 'column', index: 0, cells: [] }] }), cls('fullHouse'));
    expect(second.run.live!.tech.fullHouse!.points).toBeGreaterThan(second.run.live!.tech.nakedSingle!.points);
    expect(second.run.live!.best).toEqual({ technique: 'nakedSingle', points: run.live!.best!.points });
  });

  it('says when a shield or Second Wind takes a mistake: a popup at the cell, and the hearts as they should be', () => {
    const wrong = (cell: number) => (P.solution[cell] % P.size) + 1;
    const a = empty[0];
    const shielded = applyPlaced(onBoard({ shield: 1 }), event(new Array(36).fill(0), a, wrong(a)), null);
    expect(shielded.out.popup).toMatchObject({ cell: a, name: 'Shield', note: 'No heart lost', points: 0 });
    expect(shielded.run.live).toMatchObject({ hearts: 3, shield: 0, mistakes: 1 });
    const saved = applyPlaced(onBoard({ hearts: 1, perks: { secondWind: 1 } }), event(new Array(36).fill(0), a, wrong(a)), null);
    expect(saved.out.popup).toMatchObject({ cell: a, name: 'Second Wind', note: 'Heart kept' });
    expect(saved.run.live!.hearts).toBe(1);
    expect(saved.run.secondWindUsed).toBe(true);
    // A mistake that costs a heart says nothing: the heart goes.
    const hurt = applyPlaced(onBoard(), event(new Array(36).fill(0), a, wrong(a)), null);
    expect(hurt.out.popup).toBeNull();
    expect(hurt.run.live!.hearts).toBe(2);
    // The ids of such popups never meet a placement's.
    expect(shielded.out.popup!.id).toBeLessThan(0);
  });

  it('counts each unit once, and clean only with no notes, hints or mistakes in it', () => {
    const clean = playAll(onBoard());
    // A 6x6 has 18 units, every one finished clean when nothing was noted.
    expect(clean.live!.units).toHaveLength(18);
    expect(clean.live!.clean).toBe(18);
    expect(clean.live!.cleanBoxes).toBe(6);
    const noted = new Array(36).fill(true);
    const messy = playAll(onBoard(), 'nakedSingle', { noted });
    expect(messy.live!.clean).toBe(0);
    expect(messy.live!.score).toBeLessThan(clean.live!.score);
  });

  it('lets a shield take a mistake first, then takes hearts, and the streak ends either way', () => {
    let run = onBoard({ shield: 1 });
    run = { ...run, live: { ...run.live!, streak: 6 } };
    const values = new Array(36).fill(0);
    const i = empty[0];
    const wrong = P.solution[i] === 1 ? 2 : 1;
    let r = applyPlaced(run, event(values, i, wrong), null);
    expect(r.run.live).toMatchObject({ shield: 0, hearts: 3, mistakes: 1, streak: 0 });
    r = applyPlaced(r.run, event(values, i, wrong), null);
    expect(r.run.live).toMatchObject({ hearts: 2, heartsLost: 1 });
    expect(r.out.fail).toBe(false);
  });

  it('ends the board when the hearts run out, unless Second Wind keeps one, once', () => {
    const values = new Array(36).fill(0);
    const i = empty[0];
    const wrong = P.solution[i] === 1 ? 2 : 1;
    const last = onBoard({ hearts: 1 });
    const out = applyPlaced(last, event(values, i, wrong), null);
    expect(out.run.live!.hearts).toBe(0);
    expect(out.out.fail).toBe(true);
    const saved = applyPlaced(onBoard({ hearts: 1, perks: { secondWind: 1 } }), event(values, i, wrong), null);
    expect(saved.out).toMatchObject({ fail: false, saved: true });
    expect(saved.run.live!.hearts).toBe(1);
    expect(saved.run.secondWindUsed).toBe(true);
    expect(saved.run.perks.secondWind).toBeUndefined();
    const twice = applyPlaced(saved.run, event(values, i, wrong), null);
    expect(twice.out.fail).toBe(true);
  });

  it('breaks a Glass board on the first mistake, two hearts gone, unless a shield takes it', () => {
    const values = new Array(36).fill(0);
    const i = empty[0];
    const wrong = P.solution[i] === 1 ? 2 : 1;
    const broke = applyPlaced(onBoard({}, 'glass'), event(values, i, wrong), null);
    expect(broke.out.fail).toBe(true);
    expect(broke.run.live).toMatchObject({ broken: true, hearts: 3 - HEARTS.glass });
    const held = applyPlaced(onBoard({ shield: 1 }, 'glass'), event(values, i, wrong), null);
    expect(held.out.fail).toBe(false);
    expect(held.run.live!.broken).toBeUndefined();
  });

  it('scores a hint, or a digit typed while a hint pointed at it, as nothing, and a reveal without ending the streak', () => {
    let run = onBoard();
    run = { ...run, live: { ...run.live!, streak: 4 } };
    const values = new Array(36).fill(0);
    const i = empty[0];
    const hint = applyPlaced(run, event(values, i, P.solution[i], { source: 'hint' }), null);
    expect(hint.run.live).toMatchObject({ score: 0, streak: 0 });
    expect(hint.out.popup).toBeNull();
    const typed = applyPlaced(run, event(values, i, P.solution[i], { assisted: true }), cls('nakedSingle'));
    expect(typed.run.live).toMatchObject({ score: 0, streak: 0 });
    const reveal = applyPlaced(run, event(values, i, P.solution[i], { source: 'reveal' }), null);
    expect(reveal.run.live).toMatchObject({ score: 0, streak: 4 });
    expect(reveal.run.live!.scored).toContain(i);
  });

  it('scores a guess as nothing, with a popup that says so', () => {
    const values = new Array(36).fill(0);
    const i = empty[0];
    const g = applyPlaced(onBoard(), event(values, i, P.solution[i]), cls('unproven'));
    expect(g.out.popup).toMatchObject({ name: 'Guess', points: 0, tier: 0 });
    expect(g.out.tally).toBeNull();
  });

  it('heals with Life Link on a clean box and grows Kaleidoscope on every box', () => {
    const run = playAll(onBoard({ hearts: 1, perks: { lifeLink: 1 }, lenses: [{ id: 'kaleidoscope' }] }));
    expect(run.live!.hearts).toBe(3);
    expect(run.lenses[0].n).toBe(6);
  });

  it('brings back Thief givens next to a solved cell', () => {
    // Pretend the givens at 5 and 13 were hidden; 4 sits next to 5, and 7 next to 13.
    let run = onBoard({}, 'thief');
    run = { ...run, live: { ...run.live!, stolen: [5, 13] } };
    const values = new Array(36).fill(0);
    const r = applyPlaced(run, event(values, 4, P.solution[4]), cls('nakedSingle'));
    expect(r.out.reveal).toEqual([5]);
    expect(r.run.live!.stolen).toEqual([13]);
  });

  it('starts the score at a tenth of the run score with Compound', () => {
    const run = { ...newRun('t:c', null, 1), score: 4321, perks: { compound: 1 } };
    const live = newLive(run, { key: 'k', slot: 3, target: 100, rule: null, stolen: [], fog: false, mods: {} });
    expect(live.score).toBe(432);
    expect(live.head).toBe(432);
  });

  it('marks cells already filled as scored, so they never score', () => {
    const run = markFilled(onBoard(), 'k', [empty[0], empty[1]]);
    expect(run.live!.scored).toEqual([empty[0], empty[1]]);
    const values = new Array(36).fill(0);
    expect(applyPlaced(run, event(values, empty[0], P.solution[empty[0]]), cls('nakedSingle')).run).toBe(run);
  });

  it('ignores placements on another board or after the board is over', () => {
    const run = onBoard();
    const values = new Array(36).fill(0);
    expect(applyPlaced(run, event(values, empty[0], P.solution[empty[0]], { key: 'other' }), cls('nakedSingle')).run).toBe(run);
    const over = { ...run, live: { ...run.live!, hearts: 0 } };
    expect(applyPlaced(over, event(values, empty[0], P.solution[empty[0]]), cls('nakedSingle')).run).toBe(over);
  });
});
