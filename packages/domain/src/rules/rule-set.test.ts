import { describe, expect, it } from 'vitest';
import { RULE_SET_NAMES, ruledRules, sportbetRules } from './rule-set';

describe('RuleSet', () => {
  it('rules: a set holds only the name its stored rows carry', () => {
    expect(Object.keys(sportbetRules)).toEqual(['name']);
    expect(Object.keys(ruledRules)).toEqual(['name']);
  });

  it('rules: both sets are frozen', () => {
    expect(Object.isFrozen(sportbetRules)).toBe(true);
    expect(Object.isFrozen(ruledRules)).toBe(true);
  });

  it('rules: each set names itself', () => {
    expect(sportbetRules.name).toBe('sportbet');
    expect(ruledRules.name).toBe('ruled');
  });

  it('rules: RULE_SET_NAMES lists every set by name, sportbet first', () => {
    expect(RULE_SET_NAMES).toEqual([sportbetRules.name, ruledRules.name]);
  });
});
