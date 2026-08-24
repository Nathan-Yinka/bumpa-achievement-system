import { Injectable, Logger } from '@nestjs/common';
import { PaymentProviderName } from '@bumpa/events-sdk';
import { EnvKey } from '../config/env';
import { MockPaymentProvider } from './mock-payment.provider';
import { PaystackPaymentProvider } from './paystack-payment.provider';
import type { PaymentProvider } from './payment-provider';

@Injectable()
export class PaymentProviderFactory {
  private readonly logger = new Logger(PaymentProviderFactory.name);
  private readonly providers: Map<PaymentProviderName, PaymentProvider>;

  constructor(
    private readonly mockProvider: MockPaymentProvider,
    private readonly paystackProvider: PaystackPaymentProvider,
  ) {
    // Registry keeps provider selection out of branching logic.
    this.providers = new Map<PaymentProviderName, PaymentProvider>([
      [PaymentProviderName.Mock, this.mockProvider],
      [PaymentProviderName.Paystack, this.paystackProvider],
    ]);
  }

  getProvider(): PaymentProvider {
    const configured = process.env[EnvKey.PaymentProvider] as PaymentProviderName | undefined;
    const provider = configured ? this.providers.get(configured) : undefined;

    if (configured && !provider) {
      this.logger.warn(`Unknown payment provider "${configured}" configured; falling back to mock provider`);
    }

    return provider ?? this.providers.get(PaymentProviderName.Mock)!;
  }
}
