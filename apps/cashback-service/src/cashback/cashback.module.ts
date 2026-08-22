import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OutboxLockKey } from '@bumpa/events-sdk';
import { OutboxModule } from '@bumpa/outbox-sdk';
import { CashbackTransaction } from '../entities/cashback-transaction.entity';
import { OutboxEvent } from '../entities/outbox-event.entity';
import { ProcessedEvent } from '../entities/processed-event.entity';
import { BadgeUnlockedConsumer } from '../messaging/badge-unlocked.consumer';
import { MockPaymentProvider } from '../payments/mock-payment.provider';
import { PaymentProviderFactory } from '../payments/payment-provider.factory';
import { PaystackPaymentProvider } from '../payments/paystack-payment.provider';
import { CashbackController } from './cashback.controller';
import { CashbackService } from './cashback.service';

export const cashbackEntities = [CashbackTransaction, OutboxEvent, ProcessedEvent];

@Module({
  imports: [
    TypeOrmModule.forFeature(cashbackEntities),
    OutboxModule.forRoot({ entity: OutboxEvent, lockKey: OutboxLockKey.Cashback }),
  ],
  controllers: [CashbackController],
  providers: [
    CashbackService,
    BadgeUnlockedConsumer,
    MockPaymentProvider,
    PaystackPaymentProvider,
    PaymentProviderFactory,
  ],
})
export class CashbackModule {}
