import type { JsonObject } from '@bumpa/events-sdk';
import { PaymentProviderName, PaymentStatus } from '@bumpa/events-sdk';
import { EnvKey } from '../config/env';
import { CashbackPaymentError } from './payment-provider';
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
      reference: 'cbk_test_reference',
      userName: 'Amina Bello',
      badgeName: 'Beginner',
      amountKobo: 30000,
      bankAccountNumber: '0123456789',
      bankCode: '058',
    });

    expect(result.provider).toBe(PaymentProviderName.Paystack);
    expect(result.status).toBe(PaymentStatus.Successful);
    expect(result.reference).toBe('cbk_test_reference');
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
      reference: 'cbk_test_reference',
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
      reference: 'cbk_test_reference',
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

  it('classifies insufficient balance as a retryable failure', async () => {
    process.env[EnvKey.PaystackSecretKey] = 'sk_test_bumpa';
    global.fetch = jest.fn(async (): Promise<Response> =>
      new Response(JSON.stringify({ status: false, message: 'You have insufficient balance for this transaction' }), {
        status: 400,
      }),
    ) as typeof fetch;
    const provider = new PaystackPaymentProvider();

    const error = await provider
      .sendCashback({
        userId: 'usr_test',
        reference: 'cbk_test_reference',
        userName: 'Amina Bello',
        badgeName: 'Beginner',
        amountKobo: 30000,
        bankAccountNumber: '0123456789',
        bankCode: '058',
        providerRecipientCode: 'RCP_existing',
      })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(CashbackPaymentError);
    expect((error as CashbackPaymentError).code).toBe('INSUFFICIENT_BALANCE');
    expect((error as CashbackPaymentError).retryable).toBe(true);
  });

  it('classifies Paystack\'s actual "balance is not enough" wording as insufficient balance too', async () => {
    process.env[EnvKey.PaystackSecretKey] = 'sk_test_bumpa';
    global.fetch = jest.fn(async (): Promise<Response> =>
      new Response(JSON.stringify({ status: false, message: 'Your balance is not enough to fulfil this request' }), {
        status: 400,
      }),
    ) as typeof fetch;
    const provider = new PaystackPaymentProvider();

    const error = await provider
      .sendCashback({
        userId: 'usr_test',
        reference: 'cbk_test_reference',
        userName: 'Amina Bello',
        badgeName: 'Beginner',
        amountKobo: 30000,
        bankAccountNumber: '0123456789',
        bankCode: '058',
        providerRecipientCode: 'RCP_existing',
      })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(CashbackPaymentError);
    expect((error as CashbackPaymentError).code).toBe('INSUFFICIENT_BALANCE');
    expect((error as CashbackPaymentError).retryable).toBe(true);
  });

  // Covers Paystack's code-based error response shape.
  describe('classifies by Paystack\'s error `code` field (not just message wording)', () => {
    const cases: Array<{ paystackCode: string; message: string; expectedCode: string; retryable: boolean }> = [
      { paystackCode: 'insufficient_balance', message: 'Your balance is not enough to fulfil this request', expectedCode: 'INSUFFICIENT_BALANCE', retryable: true },
      { paystackCode: 'invalid_bank_code', message: 'Bank is invalid', expectedCode: 'INVALID_ACCOUNT', retryable: false },
      { paystackCode: 'invalid_account_number', message: 'Account number is invalid', expectedCode: 'INVALID_ACCOUNT', retryable: false },
      { paystackCode: 'invalid_transfer_recipient', message: 'Recipient specified is invalid', expectedCode: 'INVALID_ACCOUNT', retryable: false },
      { paystackCode: 'invalid_Key', message: 'Invalid key', expectedCode: 'PROVIDER_MISCONFIGURED', retryable: false },
      { paystackCode: 'invalid_amount', message: 'Amount must be a positive integer.', expectedCode: 'PROVIDER_REJECTED', retryable: false },
      { paystackCode: 'missing_params', message: 'Either authorization_code or account_number must be passed.', expectedCode: 'PROVIDER_REJECTED', retryable: false },
    ];

    for (const testCase of cases) {
      it(`maps code "${testCase.paystackCode}" to ${testCase.expectedCode} (retryable: ${testCase.retryable})`, async () => {
        process.env[EnvKey.PaystackSecretKey] = 'sk_test_bumpa';
        global.fetch = jest.fn(async (): Promise<Response> =>
          new Response(JSON.stringify({ status: false, message: testCase.message, code: testCase.paystackCode }), { status: 400 }),
        ) as typeof fetch;
        const provider = new PaystackPaymentProvider();

        const error = await provider
          .sendCashback({
            userId: 'usr_test',
            reference: 'cbk_test_reference',
            userName: 'Amina Bello',
            badgeName: 'Beginner',
            amountKobo: 30000,
            bankAccountNumber: '0123456789',
            bankCode: '058',
            providerRecipientCode: 'RCP_existing',
          })
          .catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(CashbackPaymentError);
        expect((error as CashbackPaymentError).code).toBe(testCase.expectedCode);
        expect((error as CashbackPaymentError).retryable).toBe(testCase.retryable);
      });
    }
  });

  it('classifies an unresolvable account as a permanent, non-retryable failure', async () => {
    process.env[EnvKey.PaystackSecretKey] = 'sk_test_bumpa';
    global.fetch = jest.fn(async (): Promise<Response> =>
      new Response(JSON.stringify({ status: false, message: 'Cannot resolve account' }), { status: 422 }),
    ) as typeof fetch;
    const provider = new PaystackPaymentProvider();

    const error = await provider
      .sendCashback({
        userId: 'usr_test',
        reference: 'cbk_test_reference',
        userName: 'Amina Bello',
        badgeName: 'Beginner',
        amountKobo: 30000,
        bankAccountNumber: '0123456789',
        bankCode: '058',
      })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(CashbackPaymentError);
    expect((error as CashbackPaymentError).code).toBe('INVALID_ACCOUNT');
    expect((error as CashbackPaymentError).retryable).toBe(false);
  });

  it('classifies a 5xx/rate-limit response as provider-unavailable, retryable', async () => {
    process.env[EnvKey.PaystackSecretKey] = 'sk_test_bumpa';
    global.fetch = jest.fn(async (): Promise<Response> =>
      new Response(JSON.stringify({ status: false, message: 'Service temporarily unavailable' }), { status: 503 }),
    ) as typeof fetch;
    const provider = new PaystackPaymentProvider();

    const error = await provider
      .sendCashback({
        userId: 'usr_test',
        reference: 'cbk_test_reference',
        userName: 'Amina Bello',
        badgeName: 'Beginner',
        amountKobo: 30000,
        bankAccountNumber: '0123456789',
        bankCode: '058',
        providerRecipientCode: 'RCP_existing',
      })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(CashbackPaymentError);
    expect((error as CashbackPaymentError).code).toBe('PROVIDER_UNAVAILABLE');
    expect((error as CashbackPaymentError).retryable).toBe(true);
  });

  it('classifies a network failure as provider-unavailable, retryable', async () => {
    process.env[EnvKey.PaystackSecretKey] = 'sk_test_bumpa';
    global.fetch = jest.fn(async () => {
      throw new Error('fetch failed');
    }) as typeof fetch;
    const provider = new PaystackPaymentProvider();

    const error = await provider
      .sendCashback({
        userId: 'usr_test',
        reference: 'cbk_test_reference',
        userName: 'Amina Bello',
        badgeName: 'Beginner',
        amountKobo: 30000,
        bankAccountNumber: '0123456789',
        bankCode: '058',
        providerRecipientCode: 'RCP_existing',
      })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(CashbackPaymentError);
    expect((error as CashbackPaymentError).code).toBe('PROVIDER_UNAVAILABLE');
    expect((error as CashbackPaymentError).retryable).toBe(true);
  });

  it('requires bank details when Paystack is enabled', async () => {
    process.env[EnvKey.PaystackSecretKey] = 'sk_test_bumpa';
    const provider = new PaystackPaymentProvider();

    await expect(
      provider.sendCashback({
        userId: 'usr_test',
        reference: 'cbk_test_reference',
        userName: 'Amina Bello',
        badgeName: 'Beginner',
        amountKobo: 30000,
      }),
    ).rejects.toThrow('Bank account number and bank code are required for Paystack cashback');
  });
});
