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

    if (rule.type === 'ACHIEVEMENT_SET') {
      const unlockedAchievementIds = context.unlockedAchievementIds ?? new Set<string>();
      const unlockedRequiredCount = rule.achievementIds.filter((achievementId) =>
        unlockedAchievementIds.has(achievementId),
      ).length;
      return unlockedRequiredCount >= (rule.minRequired ?? rule.achievementIds.length);
    }

    if (rule.type === 'COMBINATION') {
      return rule.rules.every((childRule) => this.evaluate(childRule, context));
    }

    throw new Error('Unsupported achievement rule type: ' + JSON.stringify(rule));
  }

  private compare(actual: number, expected: number, operator: 'GTE'): boolean {
    if (operator === 'GTE') {
      return actual >= expected;
    }

    return false;
  }
}
