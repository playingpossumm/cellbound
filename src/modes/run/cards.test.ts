import { describe, expect, it } from 'vitest';
import { EM_DASH } from '../../test/copy';
import { BOARD_SPECS, basePlan, rulesFor } from './boards';
import {
  ALL_KINDS,
  CARDS,
  MAX_HEARTS,
  MAX_SHIELD,
  TIGHT_CLOCK_MS,
  applyCards,
  cardText,
  clockFor,
  cardById,
  cardPool,
  multiplierOf,
  type BoardPlan,
} from './cards';

const plan = (index = 1, hearts = 3, shield = 0): BoardPlan => basePlan('t:seed', index, hearts, shield);
const card = (id: string) => cardById(id)!;

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
      expect(c.text.length).toBeLessThanOrEqual(90);
      expect(c.name.length).toBeLessThanOrEqual(14);
      expect(c.text.endsWith('.')).toBe(true);
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
  it('Lantern reveals three cells and Beacon six', () => {
    expect(card('lantern').effect(plan()).mods.reveal).toBe(3);
    expect(card('beacon').effect(plan()).mods.reveal).toBe(6);
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

  it('Easy road lowers difficulty but not below 1', () => {
    expect(card('easy-road').effect(plan(3)).options.difficulty).toBe(BOARD_SPECS[3].difficulty - 1);
    expect(card('easy-road').effect(plan(0)).options.difficulty).toBe(1);
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
    expect(card('tight-clock').effect(plan()).mods.timeLimitMs).toBe(TIGHT_CLOCK_MS);
    expect(TIGHT_CLOCK_MS).toBe(240_000);
  });

  it('scales the Tight clock with the board: 4 minutes on a 6x6, 9 on the final 9x9', () => {
    expect(clockFor(6)).toBe(240_000);
    expect(clockFor(9)).toBe(540_000);
    const final = plan(BOARD_SPECS.length - 1);
    expect(final.options.size).toBe(9);
    for (const id of ['tight-clock', 'sprint']) {
      expect(card(id).effect(final).mods.timeLimitMs).toBe(540_000);
      // The offer names the minutes of the board it is for; the Collection covers both.
      expect(cardText(card(id), 6)).toContain('4 minutes');
      expect(cardText(card(id), 9)).toContain('9 minutes');
      expect(cardText(card(id))).toMatch(/4 minutes.*9/);
      expect(cardText(card(id), 9)).toMatch(/run ends/);
    }
    expect(cardText(card('lantern'), 9)).toBe(card('lantern').text);
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

  it('Hard turn raises difficulty and stops at 4', () => {
    const hard = card('hard-turn');
    expect(hard.effect(plan(1)).options.difficulty).toBe(BOARD_SPECS[1].difficulty + 1);
    expect(hard.effect(plan(4)).options.difficulty).toBe(BOARD_SPECS[4].difficulty + 1);
    expect(hard.effect(hard.effect(plan(3))).options.difficulty).toBe(4);
  });
});

describe('bargains', () => {
  it('pair a curse with a boon', () => {
    const night = card('night-walk').effect(plan(1, 3));
    expect(night.options.fog).toBe(true);
    expect(night.mods.hearts).toBe(4);
    const blind = card('blind-faith').effect(plan(1));
    expect(blind.options.hiddenCageTotals).toBe(true);
    expect(blind.mods.reveal).toBe(5);
    const hush = card('hush').effect(plan(1));
    expect(hush.mods.noNotes).toBe(true);
    expect(hush.mods.shield).toBe(1);
    const sprint = card('sprint').effect(plan(1, 3));
    expect(sprint.mods.timeLimitMs).toBe(TIGHT_CLOCK_MS);
    expect(sprint.mods.hearts).toBe(4);
    const dusk = card('dusk').effect(plan(1));
    expect(dusk.mods.noHighlights).toBe(true);
    expect(dusk.mods.reveal).toBe(3);
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
