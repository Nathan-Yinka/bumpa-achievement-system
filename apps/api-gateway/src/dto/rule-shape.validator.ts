import { registerDecorator, type ValidationArguments, type ValidationOptions } from 'class-validator';

/**
 * Validates that a value is a non-null, non-array object with a string `type` field.
 * The deep rule-shape validation (allowed operators, required per-type fields, etc.)
 * lives in loyalty-service — this only stops garbage/wrong-typed top-level payloads
 * from reaching it through the gateway.
 */
export function IsRuleShape(validationOptions?: ValidationOptions): PropertyDecorator {
  return (object: object, propertyName: string | symbol) => {
    registerDecorator({
      name: 'isRuleShape',
      target: object.constructor,
      propertyName: propertyName as string,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          return (
            typeof value === 'object' &&
            value !== null &&
            !Array.isArray(value) &&
            typeof (value as Record<string, unknown>).type === 'string' &&
            (value as Record<string, unknown>).type !== ''
          );
        },
        defaultMessage(args: ValidationArguments): string {
          return `${args.property} must be an object with a non-empty string "type" field`;
        },
      },
    });
  };
}
