import { Injectable } from '@nestjs/common';
import { createReadableId, EntityIdPrefix, PaymentProviderName } from '@bumpa/events-sdk';
import type { CashbackPaymentRequest, CashbackPaymentResult, PaymentProvider } from './payment-provider';

@Injectable()
export class PaystackPaymentProvider implements PaymentProvider {
  readonly name = PaymentProviderName.Paystack;

  async sendCashback(request: CashbackPaymentRequest): Promise<CashbackPaymentResult> {
    if (!process.env.PAYSTACK_SECRET_KEY) {
      return {
        provider: this.name,
        reference: `${this.name}_dry_run_${createReadableId(EntityIdPrefix.Cashback)}`,
      };
    }

    if (!request.bankAccountNumber || !request.bankCode) {
      throw new Error('Bank account number and bank code are required for Paystack cashback');
    }

    return {
      provider: this.name,
      reference: `${this.name}_ready_${createReadableId(EntityIdPrefix.Cashback)}`,
    };
  }
}
