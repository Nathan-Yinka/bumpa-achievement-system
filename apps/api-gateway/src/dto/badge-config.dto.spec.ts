import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateBadgeConfigDto, UpdateBadgeConfigDto } from './badge-config.dto';

describe('CreateBadgeConfigDto', () => {
  const validPayload = {
    id: 'bdg_elite',
    name: 'Elite',
    description: 'Awarded for reaching elite status',
    sortOrder: 4,
    requiredAchievementCount: 8,
    requiredAchievementIds: ['ach_20_purchases', 'ach_big_spender'],
    rewardAmountKobo: 30000,
    rewardCurrency: 'NGN',
    imageUrl: 'https://cdn.example.com/badges/elite.png',
    active: true,
  };

  it('accepts a valid payload', async () => {
    const dto = plainToInstance(CreateBadgeConfigDto, validPayload);
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('accepts a minimal valid payload without optional fields', async () => {
    const { description, requiredAchievementIds, rewardAmountKobo, rewardCurrency, imageUrl, active, ...minimal } =
      validPayload;
    const dto = plainToInstance(CreateBadgeConfigDto, minimal);
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects extra, non-whitelisted top-level properties', async () => {
    const dto = plainToInstance(CreateBadgeConfigDto, { ...validPayload, evil: 'hacker' } as object);
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    expect(errors.some((error) => error.property === 'evil')).toBe(true);
  });

  it('rejects a missing required field', async () => {
    const { requiredAchievementCount, ...rest } = validPayload;
    const dto = plainToInstance(CreateBadgeConfigDto, rest);
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'requiredAchievementCount')).toBe(true);
  });

  it('rejects a wrong-typed requiredAchievementCount', async () => {
    const dto = plainToInstance(CreateBadgeConfigDto, { ...validPayload, requiredAchievementCount: 'eight' });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'requiredAchievementCount')).toBe(true);
  });

  it('rejects a requiredAchievementIds array containing non-strings', async () => {
    const dto = plainToInstance(CreateBadgeConfigDto, { ...validPayload, requiredAchievementIds: ['ok', 42] });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'requiredAchievementIds')).toBe(true);
  });

  it('rejects a negative rewardAmountKobo', async () => {
    const dto = plainToInstance(CreateBadgeConfigDto, { ...validPayload, rewardAmountKobo: -1 });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'rewardAmountKobo')).toBe(true);
  });

  it('rejects an invalid imageUrl', async () => {
    const dto = plainToInstance(CreateBadgeConfigDto, { ...validPayload, imageUrl: 'not-a-url' });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'imageUrl')).toBe(true);
  });
});

describe('UpdateBadgeConfigDto', () => {
  it('accepts an empty payload since all fields are optional', async () => {
    const dto = plainToInstance(UpdateBadgeConfigDto, {});
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('accepts a partial payload updating only rewardAmountKobo', async () => {
    const dto = plainToInstance(UpdateBadgeConfigDto, { rewardAmountKobo: 50000 });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects wrong-typed fields even when provided partially', async () => {
    const dto = plainToInstance(UpdateBadgeConfigDto, { sortOrder: 'high' });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'sortOrder')).toBe(true);
  });
});
