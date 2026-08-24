import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateAchievementConfigDto, UpdateAchievementConfigDto } from './achievement-config.dto';

describe('CreateAchievementConfigDto', () => {
  const validPayload = {
    id: 'ach_20_purchases',
    name: '20 Purchases',
    description: 'Unlocked after 20 purchases',
    groupKey: 'purchases',
    sortOrder: 4,
    rule: { type: 'COUNT', field: 'purchase_count', operator: 'GTE', value: 20 },
    imageUrl: 'https://cdn.example.com/achievements/20-purchases.png',
    active: true,
  };

  it('accepts a valid payload', async () => {
    const dto = plainToInstance(CreateAchievementConfigDto, validPayload);
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('accepts a minimal valid payload without optional fields', async () => {
    const { description, imageUrl, active, ...minimal } = validPayload;
    const dto = plainToInstance(CreateAchievementConfigDto, minimal);
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects extra, non-whitelisted top-level properties', async () => {
    const dto = plainToInstance(CreateAchievementConfigDto, { ...validPayload, evil: 'hacker' } as object, {
      excludeExtraneousValues: false,
    });
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    expect(errors.some((error) => error.property === 'evil')).toBe(true);
  });

  it('rejects a missing required field', async () => {
    const { id, ...rest } = validPayload;
    const dto = plainToInstance(CreateAchievementConfigDto, rest);
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'id')).toBe(true);
  });

  it('rejects a wrong-typed sortOrder', async () => {
    const dto = plainToInstance(CreateAchievementConfigDto, { ...validPayload, sortOrder: 'four' });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'sortOrder')).toBe(true);
  });

  it('rejects a rule that is not an object', async () => {
    const dto = plainToInstance(CreateAchievementConfigDto, { ...validPayload, rule: 'not-an-object' });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'rule')).toBe(true);
  });

  it('rejects a rule missing a string type field', async () => {
    const dto = plainToInstance(CreateAchievementConfigDto, {
      ...validPayload,
      rule: { field: 'purchase_count', operator: 'GTE', value: 20 },
    });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'rule')).toBe(true);
  });

  it('rejects a null rule', async () => {
    const dto = plainToInstance(CreateAchievementConfigDto, { ...validPayload, rule: null });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'rule')).toBe(true);
  });

  it('rejects an invalid imageUrl', async () => {
    const dto = plainToInstance(CreateAchievementConfigDto, { ...validPayload, imageUrl: 'not-a-url' });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'imageUrl')).toBe(true);
  });
});

describe('UpdateAchievementConfigDto', () => {
  it('accepts an empty payload since all fields are optional', async () => {
    const dto = plainToInstance(UpdateAchievementConfigDto, {});
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('accepts a partial payload updating only active', async () => {
    const dto = plainToInstance(UpdateAchievementConfigDto, { active: false });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects a malformed rule even when provided partially', async () => {
    const dto = plainToInstance(UpdateAchievementConfigDto, { rule: { type: 42 } });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'rule')).toBe(true);
  });
});
