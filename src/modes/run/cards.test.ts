import { describe, expect, it } from 'vitest';
import { EM_DASH } from '../../test/copy';
import { BOARD_COUNT, BOARD_SPECS, basePlan, rulesFor } from './boards';
import {
  ALL_KINDS,
  CARDS,
  MAX_HEARTS,
  MAX_SHIELD,
  STEP_LONGER,
  STEP_SHORTER,
  applyCards,
  cardText,
  cardById,
  cardPool,
  multiplierOf,
  type BoardPlan,
} from './cards';
import { clockOf, scaleWindow } from './scale';

const plan = (index = 1, hearts = 3, shield = 0): BoardPlan => basePlan('t:seed', index, hearts, shield);
const card = (id: string) => cardById(id)!;
/** The boards a card can be picked for: board 2 to the final. */
const OFFERED = Array.from({ length: BOARD_COUNT - 1 }, (_, k) => k + 1);

describe('card set', () => {
  it('has enough boons, curses and bargains', () => {
    expect(CARDS.filter((c) => c.kind === 'boon').length).toBeGreaterThanOrEqual(6);
    expect(CARDS.filter((c) => c.kind === 'curse').length).toBeGreaterThanOrEqual(5);
    expect(CARDS.filter((c) => c.kind === 'bargain').length).toBeGreaterThanOrEqual(3);
  });

  it('gives every card a name, one line of text with no em dash, and a unique id', () => {
    const ids = new Set<string>();
    for (const c of CARDS) {
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.text).not.toMatch(/\n/);
      expect(c.text).not.toContain(EM_DASH);
      expect(ids.has(c.id)).toBe(false);
      ids.add(c.id);
    }
  });

  it('keeps card text to a line or two a player can take in at a glance', () => {
    for (const c of CARDS) {
      const lines = [c.text, ...OFFERED.map((i) => cardText(c, c.effect(plan(i))))];
      for (const t of lines) {
        expect(t.length, c.id).toBeLessThanOrEqual(90);
        expect(t.endsWith('.'), c.id).toBe(true);
      }
      expect(c.name.length).toBeLessThanOrEqual(14);
    }
  });

  it('warns on every card with a clock that a time out ends the run', () => {
    for (const c of CARDS.filter((x) => x.effect(plan()).mods.timeLimitMs !== undefined)) expect(c.text).toMatch(/run ends/);
  });

  it('says so in the card text when a card lasts the whole run', () => {
    const runCards = CARDS.filter((c) => c.lasts === 'run');
    expect(runCards.length).toBeGreaterThan(0);
    for (const c of runCards) expect(c.text).toContain('rest of the run');
    for (const c of CARDS.filter((x) => x.lasts === 'board')) expect(c.text).not.toContain('rest of the run');
  });

  it('raises the multiplier for curses and bargains only', () => {
    for (const c of CARDS) {
      if (c.kind === 'boon') expect(c.mult).toBe(0);
      else expect(c.mult).toBeGreaterThan(0);
    }
  });

  it('never mutates the plan it is given', () => {
    for (const c of CARDS) {
      const p = plan();
      const copy = JSON.parse(JSON.stringify(p));
      c.effect(p);
      expect(JSON.parse(JSON.stringify(p))).toEqual(copy);
    }
  });
});

describe('boon effects', () => {
  it('Lantern reveals four cells and Beacon eight', () => {
    expect(card('lantern').effect(plan()).mods.reveal).toBe(4);
    expect(card('beacon').effect(plan()).mods.reveal).toBe(8);
  });

  it('Second wind adds a heart, and a shield at the cap', () => {
    expect(card('second-wind').effect(plan(1, 3)).mods.hearts).toBe(4);
    const capped = card('second-wind').effect(plan(1, MAX_HEARTS, 0));
    expect(capped.mods.hearts).toBe(MAX_HEARTS);
    expect(capped.mods.shield).toBe(1);
  });

  it('Shield adds one shield up to the cap', () => {
    expect(card('shield').effect(plan(1, 3, 1)).mods.shield).toBe(2);
    expect(card('shield').effect(plan(1, 3, MAX_SHIELD)).mods.shield).toBe(MAX_SHIELD);
  });

  it('Insight turns on auto notes', () => {
    expect(card('insight').effect(plan()).mods.autoNotes).toBe(true);
  });

  it('Easy road takes the board one level down and makes it shorter, but not below level 1', () => {
    const before = plan(3);
    const after = card('easy-road').effect(before);
    expect(after.options.difficulty).toBe(BOARD_SPECS[3].difficulty - 1);
    expect(after.options.minutes).toEqual(scaleWindow(BOARD_SPECS[3].minutes, STEP_SHORTER));
    // The first board is already gentle: nothing changes.
    expect(card('easy-road').effect(plan(0))).toEqual(plan(0));
  });

  it('Steady hand guarantees a shield', () => {
    expect(card('steady-hand').effect(plan(1, 3, 0)).mods.shield).toBe(1);
    expect(card('steady-hand').effect(plan(1, 3, 2)).mods.shield).toBe(2);
  });
});

describe('curse effects', () => {
  it('Fog asks the generator for a fog layout', () => {
    expect(card('fog').effect(plan()).options.fog).toBe(true);
  });

  it('Blank cages hides totals and always puts a cage on the board', () => {
    for (let i = 0; i < 20; i++) {
      const p = basePlan('t:cages' + i, 1, 3, 0);
      const out = card('blank-cages').effect(p);
      expect(out.options.hiddenCageTotals).toBe(true);
      expect(out.options.rules).toContain('cage');
      expect(out.options.rules.length).toBe(p.options.rules.length);
    }
  });

  it('No notes, Dim and Tight clock set their modifiers', () => {
    expect(card('no-notes').effect(plan()).mods.noNotes).toBe(true);
    expect(card('dim').effect(plan()).mods.noHighlights).toBe(true);
    expect(card('tight-clock').effect(plan()).mods.timeLimitMs).toBe(clockOf(BOARD_SPECS[1].minutes));
  });

  it('gives the Tight clock and Sprint the top of each board\'s time window, and names those minutes on the card', () => {
    const minutes = OFFERED.map((i) => clockOf(BOARD_SPECS[i].minutes) / 60_000);
    for (const id of ['tight-clock', 'sprint']) {
      OFFERED.forEach((i, k) => {
        const board = card(id).effect(plan(i));
        expect(board.mods.timeLimitMs, `${id} board ${i + 1}`).toBe(minutes[k] * 60_000);
        // The clock always leaves more time than par.
        expect(minutes[k] * 60_000).toBeGreaterThan((BOARD_SPECS[i].minutes[0] + BOARD_SPECS[i].minutes[1]) * 30_000);
        expect(cardText(card(id), board), id).toContain(`${minutes[k]} minutes`);
        expect(cardText(card(id), board), id).toMatch(/run ends/);
      });
      // The Collection's line covers every board a card can be picked for.
      expect(cardText(card(id))).toContain(`${Math.min(...minutes)} to ${Math.max(...minutes)} minutes`);
    }
    // Later boards get more time.
    expect([...minutes].sort((a, b) => a - b)).toEqual(minutes);
    expect(cardText(card('lantern'), card('lantern').effect(plan(2)))).toBe(card('lantern').text);
  });

  it('Crowded adds one more rule and is deterministic', () => {
    const p = plan(2);
    const a = card('crowded').effect(p);
    const b = card('crowded').effect(p);
    expect(a).toEqual(b);
    expect(a.options.rules.length).toBe(p.options.rules.length + 1);
    expect(new Set(a.options.rules).size).toBe(a.options.rules.length);
    expect(a.options.maxKinds).toBe((p.options.maxKinds ?? 0) + 1);
  });

  it('Hard turn takes the board one level up and makes it longer, up to level 4', () => {
    const hard = card('hard-turn');
    for (const i of OFFERED) {
      const after = hard.effect(plan(i));
      expect(after.options.difficulty, `board ${i + 1}`).toBe(BOARD_SPECS[i].difficulty + 1);
      expect(after.options.minutes, `board ${i + 1}`).toEqual(scaleWindow(BOARD_SPECS[i].minutes, STEP_LONGER));
    }
    // A second step would pass level 4: the board stays as the first step left it.
    const once = hard.effect(plan(BOARD_COUNT - 1));
    expect(once.options.difficulty).toBe(4);
    expect(hard.effect(once)).toEqual(once);
  });
});

describe('bargains', () => {
  it('pair a curse with a boon', () => {
    const night = card('night-walk').effect(plan(1, 3));
    expect(night.options.fog).toBe(true);
    expect(night.mods.hearts).toBe(4);
    const blind = card('blind-faith').effect(plan(1));
    expect(blind.options.hiddenCageTotals).toBe(true);
    expect(blind.mods.reveal).toBe(7);
    const hush = card('hush').effect(plan(1));
    expect(hush.mods.noNotes).toBe(true);
    expect(hush.mods.shield).toBe(1);
    const sprint = card('sprint').effect(plan(1, 3));
    expect(sprint.mods.timeLimitMs).toBe(clockOf(BOARD_SPECS[1].minutes));
    expect(sprint.mods.hearts).toBe(4);
    const dusk = card('dusk').effect(plan(1));
    expect(dusk.mods.noHighlights).toBe(true);
    expect(dusk.mods.reveal).toBe(4);
    const packed = card('packed-house').effect(plan(2));
    expect(packed.mods.autoNotes).toBe(true);
    expect(packed.options.rules.length).toBe(plan(2).options.rules.length + 1);
  });

  it('pay well under the plain curse they contain, because the boon is worth something', () => {
    const pairs: Array<[string, string]> = [
      ['night-walk', 'fog'],
      ['sprint', 'tight-clock'],
      ['hush', 'no-notes'],
      ['dusk', 'dim'],
      ['blind-faith', 'blank-cages'],
      ['packed-house', 'crowded'],
    ];
    for (const [bargain, curse] of pairs) {
      expect(card(bargain).mult).toBeGreaterThan(0);
      expect(card(bargain).mult).toBeLessThanOrEqual(card(curse).mult * 0.75);
    }
  });

  it('keeps the multipliers in a sane range', () => {
    for (const c of CARDS) expect(c.mult).toBeLessThanOrEqual(0.5);
    expect(Math.max(...CARDS.map((c) => c.mult))).toBe(card('fog').mult);
  });
});

describe('wards and order', () => {
  it('Clear sight keeps highlights even when Dim is in force, in either order', () => {
    const a = applyCards(plan(), [card('dim'), card('clear-sight')]);
    const b = applyCards(plan(), [card('clear-sight'), card('dim')]);
    expect(a.mods.noHighlights).toBe(false);
    expect(b.mods.noHighlights).toBe(false);
    // Without the ward, Dim works.
    expect(applyCards(plan(), [card('dim')]).mods.noHighlights).toBe(true);
  });

  it('keeps the multiplier of a warded curse', () => {
    expect(multiplierOf([card('dim'), card('clear-sight')])).toBe(1.3);
  });
});

describe('multiplier', () => {
  it('is 1 with no cards or only boons', () => {
    expect(multiplierOf([])).toBe(1);
    expect(multiplierOf([card('lantern'), card('shield')])).toBe(1);
  });
  it('adds the bonuses and rounds to two places', () => {
    expect(multiplierOf([card('fog')])).toBe(1.5);
    expect(multiplierOf([card('tight-clock'), card('dim')])).toBe(1.7);
  });
});

describe('rules for a board', () => {
  it('is deterministic, distinct and sized by the board spec', () => {
    for (let i = 0; i < BOARD_SPECS.length; i++) {
      const a = rulesFor('t:rules', i);
      expect(a).toEqual(rulesFor('t:rules', i));
      expect(a.length).toBe(BOARD_SPECS[i].kinds);
      expect(new Set(a).size).toBe(a.length);
      a.forEach((k) => expect(ALL_KINDS).toContain(k));
      if (!BOARD_SPECS[i].allowGlobal) expect(a).not.toContain('diagonal');
      expect(a.filter((k) => k === 'diagonal' || k === 'antiKnight').length).toBeLessThanOrEqual(1);
    }
  });

  it('draws from every kind over many seeds', () => {
    const seen = new Set<string>();
    for (let s = 0; s < 200; s++) for (let i = 0; i < BOARD_SPECS.length; i++) rulesFor('t:' + s, i).forEach((k) => seen.add(k));
    expect(seen.size).toBe(ALL_KINDS.length);
  });
});

describe('card pool', () => {
  it('hides locked cards until their milestone, and daily pools are starter only', () => {
    const none = cardPool(new Set(), false);
    expect(none.every((c) => !c.unlock)).toBe(true);
    const all = cardPool(new Set(['first-run', 'board-3', 'full-hearts', 'cursed-board', 'daily-3']), false);
    expect(all.length).toBe(CARDS.length);
    const daily = cardPool(new Set(['first-run', 'board-3', 'full-hearts', 'cursed-board', 'daily-3']), true);
    expect(daily).toEqual(none);
  });

  it('locks at least five cards, one per milestone', () => {
    const locked = CARDS.filter((c) => c.unlock);
    expect(locked.length).toBeGreaterThanOrEqual(5);
    expect(new Set(locked.map((c) => c.unlock)).size).toBe(5);
  });
});
