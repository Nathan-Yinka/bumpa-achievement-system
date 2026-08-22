import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { EnvKey, getNumberEnv, getRedisConfig } from '@bumpa/config-sdk';
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
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { DataSource, Repository } from 'typeorm';
import { CashbackTransaction } from '../entities/cashback-transaction.entity';
import { OutboxEvent } from '../entities/outbox-event.entity';
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
    private readonly providerFactory: PaymentProviderFactory,
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
      const result = await provider.sendCashback({
        userId: event.payload.user.id,
        badgeName: event.payload.badgeName,
        amountKobo: transaction.amountKobo,
        bankAccountNumber: event.payload.user.bankAccountNumber,
        bankCode: event.payload.user.bankCode,
      });

      await this.dataSource.transaction(async (manager) => {
        transaction.status = PaymentStatus.Successful;
        transaction.provider = result.provider;
        transaction.providerReference = result.reference;
        transaction.failureReason = undefined;
        await manager.save(CashbackTransaction, transaction);

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
            payload: processedEvent as unknown as Record<string, unknown>,
          }),
        );
      });
    } catch (error) {
      transaction.status = PaymentStatus.Failed;
      transaction.failureReason = error instanceof Error ? error.message : String(error);
      await this.transactionRepository.save(transaction);
      throw error;
    }
  }
}
