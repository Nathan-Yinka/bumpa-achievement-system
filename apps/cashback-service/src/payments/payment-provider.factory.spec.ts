import { PaymentProviderName } from '@bumpa/events-sdk';
import { EnvKey } from '../config/env';
import { MockPaymentProvider } from './mock-payment.provider';
import { PaymentProviderFactory } from './payment-provider.factory';
import { PaystackPaymentProvider } from './paystack-payment.provider';

describe('PaymentProviderFactory', () => {
  const originalProvider = process.env[EnvKey.PaymentProvider];
  let factory: PaymentProviderFactory;

  beforeEach(() => {
    factory = new PaymentProviderFactory(new MockPaymentProvider(), new PaystackPaymentProvider());
  });

  afterEach(() => {
    process.env[EnvKey.PaymentProvider] = originalProvider;
  });

  it('resolves the mock provider by default', () => {
    delete process.env[EnvKey.PaymentProvider];
    expect(factory.getProvider().name).toBe(PaymentProviderName.Mock);
  });

  it('resolves the paystack provider from the registry when configured', () => {
    process.env[EnvKey.PaymentProvider] = PaymentProviderName.Paystack;
    expect(factory.getProvider().name).toBe(PaymentProviderName.Paystack);
  });

  it('falls back to mock for an unrecognized provider name', () => {
    process.env[EnvKey.PaymentProvider] = 'unknown-provider';
    expect(factory.getProvider().name).toBe(PaymentProviderName.Mock);
  });
});
