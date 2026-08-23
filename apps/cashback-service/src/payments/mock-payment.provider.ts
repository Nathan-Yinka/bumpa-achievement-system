import { Injectable } from '@nestjs/common';
import { createReadableId, EntityIdPrefix, PaymentProviderName, PaymentStatus } from '@bumpa/events-sdk';
import type { CashbackPaymentRequest, CashbackPaymentResult, PaymentProvider } from './payment-provider';

@Injectable()
export class MockPaymentProvider implements PaymentProvider {
  readonly name = PaymentProviderName.Mock;

  async sendCashback(_request: CashbackPaymentRequest): Promise<CashbackPaymentResult> {
    return {
      provider: this.name,
      reference: `${this.name}_${createReadableId(EntityIdPrefix.Cashback)}`,
      status: PaymentStatus.Successful,
    };
  }
}
