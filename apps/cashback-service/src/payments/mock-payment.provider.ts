import { Injectable } from '@nestjs/common';
import { PaymentProviderName, PaymentStatus } from '@bumpa/events-sdk';
import type { CashbackPaymentRequest, CashbackPaymentResult, PaymentProvider } from './payment-provider';

@Injectable()
export class MockPaymentProvider implements PaymentProvider {
  readonly name = PaymentProviderName.Mock;

  async sendCashback(request: CashbackPaymentRequest): Promise<CashbackPaymentResult> {
    return {
      provider: this.name,
      reference: request.reference,
      status: PaymentStatus.Successful,
    };
  }
}
