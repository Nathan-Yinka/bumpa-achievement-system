import type { PaymentStatus } from '@bumpa/events-sdk';

/** Thrown when a cashback payment can't proceed because the user has no bank details on file. */
export class MissingBankDetailsError extends Error {
  constructor(message = 'User payout account is required before cashback can be processed') {
    super(message);
    this.name = 'MissingBankDetailsError';
  }
}

export interface CashbackPaymentRequest {
  userId: string;
  userName: string;
  badgeName: string;
  amountKobo: number;
  bankAccountNumber?: string | null;
  bankCode?: string | null;
  providerRecipientCode?: string | null;
}

export interface CashbackPaymentResult {
  provider: string;
  reference: string;
  status: PaymentStatus.Pending | PaymentStatus.Successful;
  providerRecipientCode?: string;
}

export interface PaymentProvider {
  readonly name: string;
  sendCashback(request: CashbackPaymentRequest): Promise<CashbackPaymentResult>;
}
