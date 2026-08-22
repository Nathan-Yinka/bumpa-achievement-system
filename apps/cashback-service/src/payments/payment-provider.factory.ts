import { Injectable } from '@nestjs/common';
import { PaymentProviderName } from '@bumpa/events-sdk';
import { MockPaymentProvider } from './mock-payment.provider';
import { PaystackPaymentProvider } from './paystack-payment.provider';
import type { PaymentProvider } from './payment-provider';

@Injectable()
export class PaymentProviderFactory {
  constructor(
    private readonly mockProvider: MockPaymentProvider,
    private readonly paystackProvider: PaystackPaymentProvider,
  ) {}

  getProvider(): PaymentProvider {
    if (process.env.PAYMENT_PROVIDER === PaymentProviderName.Paystack) {
      return this.paystackProvider;
    }

    return this.mockProvider;
  }
}
