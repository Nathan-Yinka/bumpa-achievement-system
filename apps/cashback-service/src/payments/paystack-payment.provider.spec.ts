import type { JsonObject } from '@bumpa/events-sdk';
import { PaymentProviderName, PaymentStatus } from '@bumpa/events-sdk';
import { EnvKey } from '../config/env';
import { PaystackPaymentProvider } from './paystack-payment.provider';

interface FetchCall {
  input: string | URL | Request;
  init?: RequestInit;
}

describe('PaystackPaymentProvider', () => {
  const originalFetch = global.fetch;
  const originalSecretKey = process.env[EnvKey.PaystackSecretKey];
  let calls: FetchCall[];

  beforeEach(() => {
    calls = [];
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env[EnvKey.PaystackSecretKey] = originalSecretKey;
  });

  it('uses dry-run mode when no Paystack secret key is configured', async () => {
    process.env[EnvKey.PaystackSecretKey] = '';
    const provider = new PaystackPaymentProvider();

    const result = await provider.sendCashback({
      userId: 'usr_test',
      userName: 'Amina Bello',
      badgeName: 'Beginner',
      amountKobo: 30000,
      bankAccountNumber: '0123456789',
      bankCode: '058',
    });

    expect(result.provider).toBe(PaymentProviderName.Paystack);
    expect(result.status).toBe(PaymentStatus.Successful);
    expect(result.reference).toMatch(/^paystack_dry_run_cbk_[a-f0-9]{12}$/);
  });

  it('creates a recipient and initiates a Paystack transfer', async () => {
    process.env[EnvKey.PaystackSecretKey] = 'sk_test_bumpa';
    global.fetch = jest.fn(async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      calls.push({ input, init });
      const response =
        calls.length === 1
          ? { status: true, message: 'Recipient created', data: { recipient_code: 'RCP_test_recipient' } }
          : { status: true, message: 'Transfer queued', data: { reference: 'paystack_cbk_reference' } };

      return new Response(JSON.stringify(response), { status: 200 });
    }) as typeof fetch;
    const provider = new PaystackPaymentProvider();

    const result = await provider.sendCashback({
      userId: 'usr_test',
      userName: 'Amina Bello',
      badgeName: 'Beginner',
      amountKobo: 30000,
      bankAccountNumber: '0123456789',
      bankCode: '058',
    });

    const recipientPayload = JSON.parse(String(calls[0].init?.body)) as JsonObject;
    const transferPayload = JSON.parse(String(calls[1].init?.body)) as JsonObject;

    expect(result.reference).toBe('paystack_cbk_reference');
    expect(result.providerRecipientCode).toBe('RCP_test_recipient');
    expect(result.status).toBe(PaymentStatus.Pending);
    expect(calls[0].input).toBe('https://api.paystack.co/transferrecipient');
    expect(recipientPayload).toMatchObject({
      type: 'nuban',
      name: 'Amina Bello',
      account_number: '0123456789',
      bank_code: '058',
      currency: 'NGN',
    });
    expect(calls[1].input).toBe('https://api.paystack.co/transfer');
    expect(transferPayload).toMatchObject({
      source: 'balance',
      amount: 30000,
      recipient: 'RCP_test_recipient',
      reason: 'Bumpa cashback for Beginner',
    });
  });

  it('reuses an existing Paystack recipient code', async () => {
    process.env[EnvKey.PaystackSecretKey] = 'sk_test_bumpa';
    global.fetch = jest.fn(async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      calls.push({ input, init });
      return new Response(
        JSON.stringify({ status: true, message: 'Transfer queued', data: { reference: 'paystack_reused_reference' } }),
        { status: 200 },
      );
    }) as typeof fetch;
    const provider = new PaystackPaymentProvider();

    const result = await provider.sendCashback({
      userId: 'usr_test',
      userName: 'Amina Bello',
      badgeName: 'Beginner',
      amountKobo: 30000,
      bankAccountNumber: '0123456789',
      bankCode: '058',
      providerRecipientCode: 'RCP_existing',
    });

    const transferPayload = JSON.parse(String(calls[0].init?.body)) as JsonObject;

    expect(calls).toHaveLength(1);
    expect(calls[0].input).toBe('https://api.paystack.co/transfer');
    expect(transferPayload.recipient).toBe('RCP_existing');
    expect(result.providerRecipientCode).toBe('RCP_existing');
  });

  it('requires bank details when Paystack is enabled', async () => {
    process.env[EnvKey.PaystackSecretKey] = 'sk_test_bumpa';
    const provider = new PaystackPaymentProvider();

    await expect(
      provider.sendCashback({
        userId: 'usr_test',
        userName: 'Amina Bello',
        badgeName: 'Beginner',
        amountKobo: 30000,
      }),
    ).rejects.toThrow('Bank account number and bank code are required for Paystack cashback');
  });
});
