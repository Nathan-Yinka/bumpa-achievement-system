import { isValidAchievementRuleShape } from './rule-shape.validator';

describe('isValidAchievementRuleShape', () => {
  it('accepts a COUNT rule with the correct field', () => {
    expect(isValidAchievementRuleShape({ type: 'COUNT', field: 'purchase_count', operator: 'GTE', value: 5 })).toBe(true);
  });

  it('accepts a SUM rule with the correct field', () => {
    expect(isValidAchievementRuleShape({ type: 'SUM', field: 'total_spend_kobo', operator: 'GTE', value: 5 })).toBe(true);
  });

  // RuleEngineService dispatches purely on `type` and never reads `field` — so a mismatched
  // field would silently evaluate against the wrong stat if this weren't rejected here.
  it('rejects a COUNT rule whose field is actually the SUM field', () => {
    expect(isValidAchievementRuleShape({ type: 'COUNT', field: 'total_spend_kobo', operator: 'GTE', value: 5 })).toBe(false);
  });

  it('rejects a SUM rule whose field is actually the COUNT field', () => {
    expect(isValidAchievementRuleShape({ type: 'SUM', field: 'purchase_count', operator: 'GTE', value: 5 })).toBe(false);
  });

  it('rejects a negative threshold value (always-true, nonsensical)', () => {
    expect(isValidAchievementRuleShape({ type: 'COUNT', field: 'purchase_count', operator: 'GTE', value: -5 })).toBe(false);
  });

  it('accepts a threshold of exactly 0', () => {
    expect(isValidAchievementRuleShape({ type: 'COUNT', field: 'purchase_count', operator: 'GTE', value: 0 })).toBe(true);
  });

  it('rejects a COMBINATION rule with an empty rules array', () => {
    expect(isValidAchievementRuleShape({ type: 'COMBINATION', operator: 'AND', rules: [] })).toBe(false);
  });

  it('rejects an unrecognized rule type', () => {
    expect(isValidAchievementRuleShape({ type: 'NONSENSE' })).toBe(false);
  });
});
