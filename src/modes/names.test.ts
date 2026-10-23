import { describe, expect, it } from 'vitest';
import { EM_DASH } from './dev/forbidden';
import { ALL_KINDS } from './run/cards';
import { DIFFICULTY_NAMES, RULE_NAMES, RULE_TEXTS, listRules } from './names';

describe('rule names and texts', () => {
  it('cover every clue kind with the wording from the spec', () => {
    for (const k of ALL_KINDS) {
      expect(RULE_NAMES[k].length).toBeGreaterThan(0);
      expect(RULE_TEXTS[k].length).toBeGreaterThan(0);
      expect(RULE_TEXTS[k]).not.toContain(EM_DASH);
    }
    expect(RULE_NAMES.kropki).toBe('Dots');
    expect(RULE_NAMES.antiKnight).toBe('Anti-knight');
    expect(RULE_TEXTS.thermo).toBe('Digits rise from the round bulb to the far end of the line.');
    expect(RULE_TEXTS.antiKnight).toBe("Equal digits are never a knight's move apart.");
  });

  it('names the five difficulties', () => {
    expect(DIFFICULTY_NAMES.slice(1)).toEqual(['Gentle', 'Easy', 'Medium', 'Hard', 'Fiendish']);
  });

  it('lists rules in plain English', () => {
    expect(listRules(['thermo'])).toBe('Thermo');
    expect(listRules(['thermo', 'kropki'])).toBe('Thermo and Dots');
    expect(listRules(['thermo', 'arrow', 'antiKnight'])).toBe('Thermo, Arrow and Anti-knight');
    expect(listRules([])).toBe('');
  });
});
