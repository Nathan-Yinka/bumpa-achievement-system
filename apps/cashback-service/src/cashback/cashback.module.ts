import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CashbackTransaction } from '../entities/cashback-transaction.entity';
import { OutboxEvent } from '../entities/outbox-event.entity';
import { ProcessedEvent } from '../entities/processed-event.entity';
import { BadgeUnlockedConsumer } from '../messaging/badge-unlocked.consumer';
import { OutboxPublisherService } from '../outbox/outbox-publisher.service';
import { MockPaymentProvider } from '../payments/mock-payment.provider';
import { PaymentProviderFactory } from '../payments/payment-provider.factory';
import { PaystackPaymentProvider } from '../payments/paystack-payment.provider';
import { CashbackController } from './cashback.controller';
import { CashbackService } from './cashback.service';

export const cashbackEntities = [CashbackTransaction, OutboxEvent, ProcessedEvent];

@Module({
  imports: [TypeOrmModule.forFeature(cashbackEntities)],
  controllers: [CashbackController],
  providers: [
    CashbackService,
    BadgeUnlockedConsumer,
    OutboxPublisherService,
    MockPaymentProvider,
    PaystackPaymentProvider,
    PaymentProviderFactory,
  ],
})
export class CashbackModule {}
