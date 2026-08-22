import { RuleEngineService } from './rule-engine.service';

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
});
