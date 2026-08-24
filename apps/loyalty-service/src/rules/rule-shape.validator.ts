import { registerDecorator, type ValidationOptions } from 'class-validator';
import type { AchievementRule } from './rule.types';

export function isValidAchievementRuleShape(value: unknown): value is AchievementRule {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const rule = value as Record<string, unknown>;

  switch (rule.type) {
    // RuleEngineService dispatches purely on `type`, not `field` — it never reads `field` to
    // decide what to compare against. So `field` has to be checked here against the one
    // literal each type actually means, or an admin could create a COUNT rule labeled
    // "total_spend_kobo" that silently evaluates against purchase count anyway.
    case 'COUNT':
      return (
        rule.field === 'purchase_count' &&
        rule.operator === 'GTE' &&
        typeof rule.value === 'number' &&
        Number.isFinite(rule.value) &&
        rule.value >= 0
      );

    case 'SUM':
      return (
        rule.field === 'total_spend_kobo' &&
        rule.operator === 'GTE' &&
        typeof rule.value === 'number' &&
        Number.isFinite(rule.value) &&
        rule.value >= 0
      );

    case 'COMBINATION':
      return (
        rule.operator === 'AND' &&
        Array.isArray(rule.rules) &&
        rule.rules.length > 0 &&
        rule.rules.every((childRule) => isValidAchievementRuleShape(childRule))
      );

    case 'ACHIEVEMENT_SET':
      return (
        Array.isArray(rule.achievementIds) &&
        rule.achievementIds.length > 0 &&
        rule.achievementIds.every((id) => typeof id === 'string') &&
        (rule.minRequired === undefined ||
          (typeof rule.minRequired === 'number' && Number.isFinite(rule.minRequired)))
      );

    default:
      return false;
  }
}

export function ValidateRuleShape(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'validateRuleShape',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          // @IsOptional()/@IsObject() already cover undefined/non-object cases.
          if (value === undefined) {
            return true;
          }
          return isValidAchievementRuleShape(value);
        },
        defaultMessage(): string {
          return 'rule must be a valid achievement rule (COUNT, SUM, COMBINATION, or ACHIEVEMENT_SET) with the correct shape';
        },
      },
    });
  };
}
