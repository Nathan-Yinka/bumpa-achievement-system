import { Injectable, Logger } from '@nestjs/common';
import type { JsonObject, JsonValue } from '@bumpa/events-sdk';
import { EnvKey } from '../config/env';
import { CashbackPaymentError, classifyCashbackFailure } from './payment-provider';
import { CashbackFailureCode } from '@bumpa/events-sdk';
import { NIGERIAN_BANKS_FALLBACK, type BankListing } from './nigerian-banks.fallback';

// Paystack's bank list barely changes; caching it avoids hitting them on every
// keystroke of a search box.
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

@Injectable()
export class BanksService {
  private readonly baseUrl = 'https://api.paystack.co';
  private readonly logger = new Logger(BanksService.name);
  private cached: { banks: BankListing[]; fetchedAt: number } | null = null;

  async listBanks(search?: string): Promise<BankListing[]> {
    const banks = await this.getBanks();
    if (!search) {
      return banks;
    }

    const needle = search.trim().toLowerCase();
    return banks.filter((bank) => bank.name.toLowerCase().includes(needle) || bank.code.includes(needle));
  }

  private async getBanks(): Promise<BankListing[]> {
    const secretKey = process.env[EnvKey.PaystackSecretKey];
    if (!secretKey) {
      this.logger.warn('No Paystack secret key configured; serving the static bank list fallback');
      return NIGERIAN_BANKS_FALLBACK;
    }

    if (this.cached && Date.now() - this.cached.fetchedAt < CACHE_TTL_MS) {
      return this.cached.banks;
    }

    const banks = await this.fetchFromPaystack(secretKey);
    this.cached = { banks, fetchedAt: Date.now() };
    return banks;
  }

  private async fetchFromPaystack(secretKey: string): Promise<BankListing[]> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/bank?country=nigeria&currency=NGN`, {
        headers: { authorization: `Bearer ${secretKey}` },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Serve the stale cache (or the static fallback) rather than fail the whole request
      // just because Paystack is briefly unreachable.
      if (this.cached) {
        this.logger.warn(`Could not reach Paystack for bank list (${message}); serving stale cache`);
        return this.cached.banks;
      }
      this.logger.warn(`Could not reach Paystack for bank list (${message}); serving static fallback`);
      return NIGERIAN_BANKS_FALLBACK;
    }

    const text = await response.text();
    let body: JsonValue;
    try {
      body = JSON.parse(text) as JsonValue;
    } catch {
      throw new CashbackPaymentError('Paystack returned an invalid bank list response', CashbackFailureCode.ProviderUnavailable, true);
    }

    if (!response.ok || !this.isJsonObject(body) || body.status !== true) {
      const message = this.isJsonObject(body) && typeof body.message === 'string' ? body.message : 'Paystack bank list request failed';
      if (response.status === 429 || response.status >= 500) {
        throw new CashbackPaymentError(message, CashbackFailureCode.ProviderUnavailable, true);
      }
      throw classifyCashbackFailure(new Error(message));
    }

    const data = this.isJsonObject(body) ? body.data : undefined;
    if (!Array.isArray(data)) {
      throw new CashbackPaymentError('Paystack bank list response is missing data', CashbackFailureCode.ProviderUnavailable, true);
    }

    return data
      .filter((entry): entry is JsonObject => this.isJsonObject(entry))
      .map((entry) => ({
        name: typeof entry.name === 'string' ? entry.name : '',
        code: typeof entry.code === 'string' ? entry.code : '',
      }))
      .filter((bank) => bank.name && bank.code);
  }

  private isJsonObject(value: JsonValue | undefined): value is JsonObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
