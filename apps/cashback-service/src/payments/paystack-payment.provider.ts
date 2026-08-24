import { Injectable, Logger } from '@nestjs/common';
import {
  createReadableId,
  EntityIdPrefix,
  type JsonObject,
  type JsonValue,
  PaymentProviderName,
  PaymentStatus,
} from '@bumpa/events-sdk';
import { EnvKey } from '../config/env';
import { MissingBankDetailsError } from './payment-provider';
import type { CashbackPaymentRequest, CashbackPaymentResult, PaymentProvider } from './payment-provider';

interface PaystackRecipient {
  recipientCode: string;
}

interface PaystackTransfer {
  reference: string;
}

@Injectable()
export class PaystackPaymentProvider implements PaymentProvider {
  readonly name = PaymentProviderName.Paystack;
  private readonly baseUrl = 'https://api.paystack.co';
  private readonly logger = new Logger(PaystackPaymentProvider.name);

  async sendCashback(request: CashbackPaymentRequest): Promise<CashbackPaymentResult> {
    const secretKey = process.env[EnvKey.PaystackSecretKey];
    if (!secretKey) {
      this.logger.warn(`No Paystack secret key configured; dry-running cashback for user ${request.userId}`);
      return {
        provider: this.name,
        reference: `${this.name}_dry_run_${createReadableId(EntityIdPrefix.Cashback)}`,
        status: PaymentStatus.Successful,
      };
    }

    if (!request.bankAccountNumber || !request.bankCode) {
      throw new MissingBankDetailsError('Bank account number and bank code are required for Paystack cashback');
    }

    this.logger.log(`Initiating Paystack cashback transfer for user ${request.userId}, badge ${request.badgeName}`);
    try {
      const recipientCode =
        request.providerRecipientCode ?? (await this.createTransferRecipient(secretKey, request)).recipientCode;
      const transfer = await this.initiateTransfer(secretKey, request, recipientCode);

      return {
        provider: this.name,
        reference: transfer.reference,
        status: PaymentStatus.Pending,
        providerRecipientCode: recipientCode,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Paystack API error for user ${request.userId}: ${message}`);
      throw error;
    }
  }

  private async createTransferRecipient(
    secretKey: string,
    request: CashbackPaymentRequest,
  ): Promise<PaystackRecipient> {
    const accountNumber = this.readRequiredRequestValue(request.bankAccountNumber, 'bank account number');
    const bankCode = this.readRequiredRequestValue(request.bankCode, 'bank code');
    const data = await this.postToPaystack(secretKey, '/transferrecipient', {
      type: 'nuban',
      name: request.userName,
      account_number: accountNumber,
      bank_code: bankCode,
      currency: 'NGN',
      description: `Bumpa cashback recipient for ${request.userId}`,
    });

    return {
      recipientCode: this.readRequiredString(data, 'recipient_code'),
    };
  }

  private async initiateTransfer(
    secretKey: string,
    request: CashbackPaymentRequest,
    recipientCode: string,
  ): Promise<PaystackTransfer> {
    const reference = `paystack_${createReadableId(EntityIdPrefix.Cashback)}`;
    const data = await this.postToPaystack(secretKey, '/transfer', {
      source: 'balance',
      amount: request.amountKobo,
      reference,
      recipient: recipientCode,
      reason: `Bumpa cashback for ${request.badgeName}`,
    });

    return {
      reference: this.readString(data, 'reference') ?? reference,
    };
  }

  private async postToPaystack(secretKey: string, path: string, payload: JsonObject): Promise<JsonObject> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${secretKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const body = this.parseJsonObject(await response.text());
    const message = this.readString(body, 'message') ?? 'Paystack request failed';

    if (!response.ok || this.readBoolean(body, 'status') !== true) {
      throw new Error(message);
    }

    return this.readRequiredObject(body, 'data');
  }

  private parseJsonObject(text: string): JsonObject {
    const parsed = JSON.parse(text) as JsonValue;
    if (!this.isJsonObject(parsed)) {
      throw new Error('Paystack returned an invalid JSON response');
    }

    return parsed;
  }

  private readRequiredObject(source: JsonObject, key: string): JsonObject {
    const value = source[key];
    if (!this.isJsonObject(value)) {
      throw new Error(`Paystack response is missing ${key}`);
    }

    return value;
  }

  private readRequiredString(source: JsonObject, key: string): string {
    const value = this.readString(source, key);
    if (!value) {
      throw new Error(`Paystack response is missing ${key}`);
    }

    return value;
  }

  private readRequiredRequestValue(value: string | null | undefined, label: string): string {
    if (!value) {
      throw new Error(`Paystack cashback requires ${label}`);
    }

    return value;
  }

  private readString(source: JsonObject, key: string): string | undefined {
    const value = source[key];
    return typeof value === 'string' ? value : undefined;
  }

  private readBoolean(source: JsonObject, key: string): boolean | undefined {
    const value = source[key];
    return typeof value === 'boolean' ? value : undefined;
  }

  private isJsonObject(value: JsonValue | undefined): value is JsonObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
