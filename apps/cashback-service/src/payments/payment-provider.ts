import { CashbackFailureCode, type PaymentStatus } from '@bumpa/events-sdk';

export class CashbackPaymentError extends Error {
  constructor(
    message: string,
    readonly code: CashbackFailureCode,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'CashbackPaymentError';
  }
}

export class MissingBankDetailsError extends CashbackPaymentError {
  constructor(message = 'User payout account is required before cashback can be processed') {
    super(message, CashbackFailureCode.MissingBankDetails, false);
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
  // Saved before provider calls so webhooks can find the transaction.
  reference: string;
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

export function classifyCashbackFailure(error: unknown): CashbackPaymentError {
  if (error instanceof CashbackPaymentError) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (/insufficient (balance|funds)|balance is not enough|not enough (balance|funds)/.test(lower)) {
    return new CashbackPaymentError(message, CashbackFailureCode.InsufficientBalance, true);
  }

  if (/cannot resolve account|invalid account|invalid bank|could not resolve/.test(lower)) {
    return new CashbackPaymentError(message, CashbackFailureCode.InvalidAccount, false);
  }

  if (/duplicate.*reference/.test(lower)) {
    return new CashbackPaymentError(message, CashbackFailureCode.DuplicateReference, true);
  }

  if (/timed out|timeout|econnrefused|enotfound|fetch failed|network|5\d\d|too many requests|rate limit/.test(lower)) {
    return new CashbackPaymentError(message, CashbackFailureCode.ProviderUnavailable, true);
  }

  // Unknown provider failures stop for manual review.
  return new CashbackPaymentError(message, CashbackFailureCode.ProviderRejected, false);
}
