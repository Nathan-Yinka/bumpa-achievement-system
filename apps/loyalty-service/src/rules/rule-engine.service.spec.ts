import { RuleEngineService } from './rule-engine.service';
import type { AchievementRule } from './rule.types';

describe('RuleEngineService', () => {
  const engine = new RuleEngineService();

  it('unlocks count achievements when the threshold is reached', () => {
    const result = engine.evaluate(
      { type: 'COUNT', field: 'purchase_count', operator: 'GTE', value: 5 },
      { purchaseCount: 5, totalSpendKobo: 0 },
    );

    expect(result).toBe(true);
  });

  it('keeps count achievements locked below the threshold', () => {
    const result = engine.evaluate(
      { type: 'COUNT', field: 'purchase_count', operator: 'GTE', value: 5 },
      { purchaseCount: 4, totalSpendKobo: 0 },
    );

    expect(result).toBe(false);
  });

  it('unlocks sum achievements when total spend reaches the configured value', () => {
    const result = engine.evaluate(
      { type: 'SUM', field: 'total_spend_kobo', operator: 'GTE', value: 10000000 },
      { purchaseCount: 1, totalSpendKobo: 10000000 },
    );

    expect(result).toBe(true);
  });

  it('supports combination rules', () => {
    const result = engine.evaluate(
      {
        type: 'COMBINATION',
        operator: 'AND',
        rules: [
          { type: 'COUNT', field: 'purchase_count', operator: 'GTE', value: 5 },
          { type: 'SUM', field: 'total_spend_kobo', operator: 'GTE', value: 10000000 },
        ],
      },
      { purchaseCount: 5, totalSpendKobo: 10000000 },
    );

    expect(result).toBe(true);
  });

  it('supports achievement-set rules', () => {
    const result = engine.evaluate(
      {
        type: 'ACHIEVEMENT_SET',
        achievementIds: ['ach_first_purchase', 'ach_5_purchases', 'ach_big_spender'],
        minRequired: 2,
      },
      {
        purchaseCount: 5,
        totalSpendKobo: 2500000,
        unlockedAchievementIds: new Set(['ach_first_purchase', 'ach_5_purchases']),
      },
    );

    expect(result).toBe(true);
  });

  it('supports complex achievements with metric and achievement requirements', () => {
    const result = engine.evaluate(
      {
        type: 'COMBINATION',
        operator: 'AND',
        rules: [
          { type: 'COUNT', field: 'purchase_count', operator: 'GTE', value: 5 },
          { type: 'SUM', field: 'total_spend_kobo', operator: 'GTE', value: 2500000 },
          { type: 'ACHIEVEMENT_SET', achievementIds: ['ach_first_purchase', 'ach_5_purchases'] },
        ],
      },
      {
        purchaseCount: 5,
        totalSpendKobo: 2500000,
        unlockedAchievementIds: new Set(['ach_first_purchase', 'ach_5_purchases']),
      },
    );

    expect(result).toBe(true);
  });

  it('explicitly evaluates COMBINATION rules via the dedicated branch, not a fallthrough', () => {
    const unlocked = engine.evaluate(
      {
        type: 'COMBINATION',
        operator: 'AND',
        rules: [{ type: 'COUNT', field: 'purchase_count', operator: 'GTE', value: 1 }],
      },
      { purchaseCount: 1, totalSpendKobo: 0 },
    );
    expect(unlocked).toBe(true);

    const locked = engine.evaluate(
      {
        type: 'COMBINATION',
        operator: 'AND',
        rules: [{ type: 'COUNT', field: 'purchase_count', operator: 'GTE', value: 5 }],
      },
      { purchaseCount: 1, totalSpendKobo: 0 },
    );
    expect(locked).toBe(false);
  });

  it('throws a clear, typed error for an unrecognized rule type instead of an opaque TypeError', () => {
    const unknownRule = { type: 'NOT_A_REAL_TYPE' } as unknown as AchievementRule;

    expect(() => engine.evaluate(unknownRule, { purchaseCount: 0, totalSpendKobo: 0 })).toThrow(
      /Unsupported achievement rule type/,
    );
  });
});
