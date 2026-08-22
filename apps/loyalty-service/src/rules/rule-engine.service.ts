import { Injectable } from '@nestjs/common';
import type { AchievementRule, RuleContext } from './rule.types';

@Injectable()
export class RuleEngineService {
  evaluate(rule: AchievementRule, context: RuleContext): boolean {
    if (rule.type === 'COUNT') {
      return this.compare(context.purchaseCount, rule.value, rule.operator);
    }

    if (rule.type === 'SUM') {
      return this.compare(context.totalSpendKobo, rule.value, rule.operator);
    }

    return rule.rules.every((childRule) => this.evaluate(childRule, context));
  }

  private compare(actual: number, expected: number, operator: 'GTE'): boolean {
    if (operator === 'GTE') {
      return actual >= expected;
    }

    return false;
  }
}
