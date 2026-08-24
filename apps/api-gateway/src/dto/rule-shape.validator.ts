import { registerDecorator, type ValidationArguments, type ValidationOptions } from 'class-validator';

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
