import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OutboxLockKey } from '@bumpa/events-sdk';
import { OutboxModule } from '@bumpa/outbox-sdk';
import { getOutboxRuntimeConfig, getRedisConfig } from '../config/env';
import { CashbackTransaction } from '../entities/cashback-transaction.entity';
import { OutboxEvent } from '../entities/outbox-event.entity';
import { PayoutAccount } from '../entities/payout-account.entity';
import { ProcessedEvent } from '../entities/processed-event.entity';
import { BadgeUnlockedConsumer } from '../messaging/badge-unlocked.consumer';
import { MockPaymentProvider } from '../payments/mock-payment.provider';
import { PaymentProviderFactory } from '../payments/payment-provider.factory';
import { PaystackPaymentProvider } from '../payments/paystack-payment.provider';
import { PaystackWebhookController } from '../payments/paystack-webhook.controller';
import { PaystackWebhookService } from '../payments/paystack-webhook.service';
import { CashbackController } from './cashback.controller';
import { CashbackService } from './cashback.service';

export const cashbackEntities = [CashbackTransaction, OutboxEvent, PayoutAccount, ProcessedEvent];

@Module({
  imports: [
    TypeOrmModule.forFeature(cashbackEntities),
    OutboxModule.forRoot({
      entity: OutboxEvent,
      lockKey: OutboxLockKey.Cashback,
      redis: getRedisConfig(),
      ...getOutboxRuntimeConfig(),
    }),
  ],
  controllers: [CashbackController, PaystackWebhookController],
  providers: [
    CashbackService,
    BadgeUnlockedConsumer,
    MockPaymentProvider,
    PaystackPaymentProvider,
    PaystackWebhookService,
    PaymentProviderFactory,
  ],
})
export class CashbackModule {}
