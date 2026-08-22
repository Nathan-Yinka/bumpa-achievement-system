export type RuleOperator = 'GTE';

export interface CountRule {
  type: 'COUNT';
  field: 'purchase_count';
  operator: RuleOperator;
  value: number;
}

export interface SumRule {
  type: 'SUM';
  field: 'total_spend_kobo';
  operator: RuleOperator;
  value: number;
}

export interface CombinationRule {
  type: 'COMBINATION';
  operator: 'AND';
  rules: AchievementRule[];
}

export type AchievementRule = CountRule | SumRule | CombinationRule;

export interface RuleContext {
  purchaseCount: number;
  totalSpendKobo: number;
}
