import { EnvKey } from '../config/env';
import { BanksService } from './banks.service';
import { NIGERIAN_BANKS_FALLBACK } from './nigerian-banks.fallback';

describe('BanksService', () => {
  const originalFetch = global.fetch;
  const originalSecretKey = process.env[EnvKey.PaystackSecretKey];

  afterEach(() => {
    global.fetch = originalFetch;
    process.env[EnvKey.PaystackSecretKey] = originalSecretKey;
  });

  it('serves the static fallback list when no Paystack secret key is configured', async () => {
    process.env[EnvKey.PaystackSecretKey] = '';
    const service = new BanksService();

    const banks = await service.listBanks();

    expect(banks).toEqual(NIGERIAN_BANKS_FALLBACK);
  });

  it('filters the fallback list by name or code, case-insensitively', async () => {
    process.env[EnvKey.PaystackSecretKey] = '';
    const service = new BanksService();

    const byName = await service.listBanks('zenith');
    expect(byName).toEqual([{ name: 'Zenith Bank', code: '057' }]);

    const byCode = await service.listBanks('058');
    expect(byCode).toEqual([{ name: 'Guaranty Trust Bank', code: '058' }]);
  });

  it('fetches and normalizes the bank list from Paystack when a secret key is configured', async () => {
    process.env[EnvKey.PaystackSecretKey] = 'sk_test_bumpa';
    global.fetch = jest.fn(async (): Promise<Response> => {
      return new Response(
        JSON.stringify({
          status: true,
          message: 'Banks retrieved',
          data: [
            { name: 'Guaranty Trust Bank', code: '058', extraField: 'ignored' },
            { name: 'Zenith Bank', code: '057' },
          ],
        }),
        { status: 200 },
      );
    }) as typeof fetch;
    const service = new BanksService();

    const banks = await service.listBanks();

    expect(banks).toEqual([
      { name: 'Guaranty Trust Bank', code: '058' },
      { name: 'Zenith Bank', code: '057' },
    ]);
  });

  it('caches the Paystack response instead of refetching on every call', async () => {
    process.env[EnvKey.PaystackSecretKey] = 'sk_test_bumpa';
    const fetchMock = jest.fn(async (): Promise<Response> => {
      return new Response(
        JSON.stringify({ status: true, message: 'ok', data: [{ name: 'Zenith Bank', code: '057' }] }),
        { status: 200 },
      );
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const service = new BanksService();

    await service.listBanks();
    await service.listBanks();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('serves the static fallback when Paystack is unreachable and nothing is cached yet', async () => {
    process.env[EnvKey.PaystackSecretKey] = 'sk_test_bumpa';
    global.fetch = jest.fn(async () => {
      throw new Error('network unreachable');
    }) as unknown as typeof fetch;
    const service = new BanksService();

    const banks = await service.listBanks();

    expect(banks).toEqual(NIGERIAN_BANKS_FALLBACK);
  });
});
