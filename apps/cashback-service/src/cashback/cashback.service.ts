import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import {
  createDomainEvent,
  createReadableId,
  DomainEventName,
  EntityIdPrefix,
  JobName,
  JobQueueName,
  PaymentProviderName,
  PaymentStatus,
  ServiceName,
  type BadgeUnlockedEvent,
  type CashbackProcessedEvent,
} from '@bumpa/events-sdk';
import { OutboxService } from '@bumpa/outbox-sdk';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { DataSource, Repository } from 'typeorm';
import { EnvKey, getNumberEnv, getRedisConfig } from '../config/env';
import { CashbackTransaction } from '../entities/cashback-transaction.entity';
import { OutboxEvent } from '../entities/outbox-event.entity';
import { PayoutAccount } from '../entities/payout-account.entity';
import { ProcessedEvent } from '../entities/processed-event.entity';
import { PaymentProviderFactory } from '../payments/payment-provider.factory';

interface CashbackJob {
  transactionId: string;
  event: BadgeUnlockedEvent;
}

@Injectable()
export class CashbackService implements OnModuleInit, OnModuleDestroy {
  private queue!: Queue<CashbackJob>;
  private worker!: Worker<CashbackJob>;
  private redis!: IORedis;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(CashbackTransaction)
    private readonly transactionRepository: Repository<CashbackTransaction>,
    @InjectRepository(PayoutAccount)
    private readonly payoutAccountRepository: Repository<PayoutAccount>,
    private readonly providerFactory: PaymentProviderFactory,
    private readonly outboxService: OutboxService,
  ) {}

  onModuleInit(): void {
    this.redis = new IORedis({ ...getRedisConfig(), maxRetriesPerRequest: null });
    this.queue = new Queue<CashbackJob>(JobQueueName.CashbackPayments, { connection: this.redis });
    this.worker = new Worker<CashbackJob>(
      JobQueueName.CashbackPayments,
      async (job) => {
        await this.processPayment(job.data.transactionId, job.data.event);
      },
      {
        connection: this.redis,
        concurrency: 5,
      },
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
    await this.redis?.quit();
  }

  async handleBadgeUnlocked(event: BadgeUnlockedEvent): Promise<void> {
    const alreadyProcessed = await this.dataSource.getRepository(ProcessedEvent).exists({
      where: { eventId: event.eventId },
    });
    if (alreadyProcessed) {
      return;
    }

    const amountKobo = getNumberEnv(EnvKey.CashbackAmountKobo, 30000);
    const transactionId = createReadableId(EntityIdPrefix.Cashback);

    await this.dataSource.transaction(async (manager) => {
      // Persist before queueing so retries always have a durable transaction to resume from.
      const existing = await manager.findOne(CashbackTransaction, {
        where: { userId: event.payload.user.id, badgeName: event.payload.badgeName },
      });

      const transaction =
        existing ??
        manager.create(CashbackTransaction, {
          id: transactionId,
          userId: event.payload.user.id,
          badgeName: event.payload.badgeName,
          amountKobo,
          provider: process.env[EnvKey.PaymentProvider] ?? PaymentProviderName.Mock,
          status: PaymentStatus.Pending,
          correlationId: event.correlationId,
        });

      await manager.save(CashbackTransaction, transaction);
      await manager.save(
        ProcessedEvent,
        manager.create(ProcessedEvent, {
          eventId: event.eventId,
          consumer: ServiceName.Cashback,
        }),
      );

      await this.queue.add(
        JobName.SendCashback,
        { transactionId: transaction.id, event },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: true,
          removeOnFail: false,
        },
      );
    });
  }

  async listTransactions(): Promise<CashbackTransaction[]> {
    return this.transactionRepository.find({ order: { createdAt: 'DESC' } });
  }

  private async processPayment(transactionId: string, event: BadgeUnlockedEvent): Promise<void> {
    const transaction = await this.transactionRepository.findOneByOrFail({ id: transactionId });
    if (transaction.status === PaymentStatus.Successful) {
      return;
    }

    const provider = this.providerFactory.getProvider();

    try {
      const payoutAccount = await this.upsertPayoutAccount(event);
      const result = await provider.sendCashback({
        userId: event.payload.user.id,
        userName: event.payload.user.name,
        badgeName: event.payload.badgeName,
        amountKobo: transaction.amountKobo,
        bankAccountNumber: payoutAccount.bankAccountNumber,
        bankCode: payoutAccount.bankCode,
        providerRecipientCode: payoutAccount.providerRecipientCode,
      });

      const outboxEventIds: string[] = [];
      await this.dataSource.transaction(async (manager) => {
        transaction.status = result.status;
        transaction.provider = result.provider;
        transaction.providerReference = result.reference;
        transaction.providerRecipientCode = result.providerRecipientCode;
        transaction.failureReason = undefined;
        await manager.save(CashbackTransaction, transaction);
        if (result.providerRecipientCode) {
          payoutAccount.providerRecipientCode = result.providerRecipientCode;
          await manager.save(PayoutAccount, payoutAccount);
        }

        if (result.status === PaymentStatus.Successful) {
          const processedEvent: CashbackProcessedEvent = createDomainEvent(
            DomainEventName.CashbackProcessed,
            {
              badgeName: event.payload.badgeName,
              userId: event.payload.user.id,
              amountKobo: transaction.amountKobo,
              providerReference: result.reference,
              status: PaymentStatus.Successful,
            },
            event.correlationId,
            createReadableId(EntityIdPrefix.Event),
          );

          await manager.save(
            OutboxEvent,
            manager.create(OutboxEvent, {
              id: processedEvent.eventId,
              eventType: processedEvent.type,
              routingKey: processedEvent.type,
              payload: processedEvent,
            }),
          );
          outboxEventIds.push(processedEvent.eventId);
        }
      });
      await this.outboxService.publishMany(outboxEventIds);
    } catch (error) {
      transaction.status = PaymentStatus.Failed;
      transaction.failureReason = error instanceof Error ? error.message : String(error);
      await this.transactionRepository.save(transaction);
      throw error;
    }
  }

  private async upsertPayoutAccount(event: BadgeUnlockedEvent): Promise<PayoutAccount> {
    const { bankAccountNumber, bankCode, id, name } = event.payload.user;
    if (!bankAccountNumber || !bankCode) {
      throw new Error('User payout account is required before cashback can be processed');
    }

    const existing = await this.payoutAccountRepository.findOneBy({ userId: id });
    if (existing) {
      existing.userName = name;
      existing.bankAccountNumber = bankAccountNumber;
      existing.bankCode = bankCode;
      existing.provider = process.env[EnvKey.PaymentProvider] ?? PaymentProviderName.Mock;
      return this.payoutAccountRepository.save(existing);
    }

    return this.payoutAccountRepository.save(
      this.payoutAccountRepository.create({
        id: createReadableId(EntityIdPrefix.PayoutAccount),
        userId: id,
        userName: name,
        bankAccountNumber,
        bankCode,
        provider: process.env[EnvKey.PaymentProvider] ?? PaymentProviderName.Mock,
      }),
    );
  }
}
