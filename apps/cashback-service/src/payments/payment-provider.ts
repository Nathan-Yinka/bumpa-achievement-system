export interface CashbackPaymentRequest {
  userId: string;
  badgeName: string;
  amountKobo: number;
  bankAccountNumber?: string | null;
  bankCode?: string | null;
}

export interface CashbackPaymentResult {
  provider: string;
  reference: string;
}

export interface PaymentProvider {
  readonly name: string;
  sendCashback(request: CashbackPaymentRequest): Promise<CashbackPaymentResult>;
}
