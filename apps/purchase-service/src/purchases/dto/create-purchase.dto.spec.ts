import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreatePurchaseDto } from './create-purchase.dto';

const validBase = {
  userId: 'usr_amc5k2n9xq01',
  email: 'customer@getbumpa.com',
  name: 'Amina Bello',
  amountKobo: 500000,
};

async function validateDto(overrides: Record<string, unknown>) {
  const dto = plainToInstance(CreatePurchaseDto, { ...validBase, ...overrides });
  return validate(dto);
}

describe('CreatePurchaseDto', () => {
  it('passes with only the required fields', async () => {
    const errors = await validateDto({});
    expect(errors).toHaveLength(0);
  });

  it('passes with valid optional bank details', async () => {
    const errors = await validateDto({ bankAccountNumber: '0123456789', bankCode: '058' });
    expect(errors).toHaveLength(0);
  });

  describe('amountKobo bounds', () => {
    it('rejects amountKobo above the configured ceiling', async () => {
      const errors = await validateDto({ amountKobo: 100_000_000_00 + 1 });
      expect(errors.some((error) => error.property === 'amountKobo')).toBe(true);
    });

    it('accepts amountKobo exactly at the ceiling', async () => {
      const errors = await validateDto({ amountKobo: 100_000_000_00 });
      expect(errors).toHaveLength(0);
    });

    it('rejects amountKobo below the minimum', async () => {
      const errors = await validateDto({ amountKobo: 0 });
      expect(errors.some((error) => error.property === 'amountKobo')).toBe(true);
    });
  });

  describe('userId', () => {
    it('rejects an empty userId', async () => {
      const errors = await validateDto({ userId: '' });
      expect(errors.some((error) => error.property === 'userId')).toBe(true);
    });
  });

  describe('bankAccountNumber format', () => {
    it('rejects a non-10-digit bankAccountNumber', async () => {
      const errors = await validateDto({ bankAccountNumber: '12345' });
      expect(errors.some((error) => error.property === 'bankAccountNumber')).toBe(true);
    });

    it('rejects a non-numeric bankAccountNumber', async () => {
      const errors = await validateDto({ bankAccountNumber: 'abcdefghij' });
      expect(errors.some((error) => error.property === 'bankAccountNumber')).toBe(true);
    });

    it('accepts a valid 10-digit bankAccountNumber', async () => {
      const errors = await validateDto({ bankAccountNumber: '0123456789' });
      expect(errors).toHaveLength(0);
    });
  });

  describe('bankCode format', () => {
    it('rejects a bankCode that is too long', async () => {
      const errors = await validateDto({ bankCode: '1234567' });
      expect(errors.some((error) => error.property === 'bankCode')).toBe(true);
    });

    it('rejects a non-numeric bankCode', async () => {
      const errors = await validateDto({ bankCode: 'abc' });
      expect(errors.some((error) => error.property === 'bankCode')).toBe(true);
    });

    it('accepts a valid numeric bankCode', async () => {
      const errors = await validateDto({ bankCode: '058' });
      expect(errors).toHaveLength(0);
    });
  });
});
