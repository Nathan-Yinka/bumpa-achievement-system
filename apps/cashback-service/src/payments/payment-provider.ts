import type { PaymentStatus } from '@bumpa/events-sdk';

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
