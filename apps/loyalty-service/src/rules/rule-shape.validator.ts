import { registerDecorator, type ValidationOptions } from 'class-validator';
import type { AchievementRule } from './rule.types';

/** Checks that a value matches one of the supported achievement rule shapes: COUNT, SUM, COMBINATION, or ACHIEVEMENT_SET. */
export function isValidAchievementRuleShape(value: unknown): value is AchievementRule {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const rule = value as Record<string, unknown>;

  switch (rule.type) {
    case 'COUNT':
    case 'SUM':
      return (
        typeof rule.field === 'string' &&
        rule.operator === 'GTE' &&
        typeof rule.value === 'number' &&
        Number.isFinite(rule.value)
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

/** class-validator decorator that validates a `rule` field against the supported achievement rule shapes. */
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
