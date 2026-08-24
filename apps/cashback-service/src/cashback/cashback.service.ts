import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import {
  createDomainEvent,
  createReadableId,
  DomainEventName,
  EntityIdPrefix,
  JobName,
  JobQueueName,
  PaymentStatus,
  ServiceName,
  type BadgeUnlockedEvent,
  type CashbackProcessedEvent,
} from '@bumpa/events-sdk';
import { OutboxService } from '@bumpa/outbox-sdk';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { Brackets, DataSource, EntityManager, Repository } from 'typeorm';
import { EnvKey, getNumberEnv, getRedisConfig } from '../config/env';
import { CashbackProcessingStatus, CashbackTransaction } from '../entities/cashback-transaction.entity';
import { OutboxEvent } from '../entities/outbox-event.entity';
import { PayoutAccount } from '../entities/payout-account.entity';
import { ProcessedEvent } from '../entities/processed-event.entity';
import { MissingBankDetailsError } from '../payments/payment-provider';
import { PaymentProviderFactory } from '../payments/payment-provider.factory';
import type { ListCashbacksQueryDto } from './dto/list-cashbacks-query.dto';
import type { PaginatedCashbacksResponseDto } from './dto/paginated-cashbacks-response.dto';

interface CashbackJob {
  transactionId: string;
  event: BadgeUnlockedEvent;
}

export interface RetryBankDetailsOverride {
  bankAccountNumber?: string;
  bankCode?: string;
}

@Injectable()
export class CashbackService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CashbackService.name);
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
      this.logger.log(`Skipping duplicate BadgeUnlocked event ${event.eventId} (already processed)`);
      return;
    }

    // A reward amount of 0 on the payload should be respected, so this checks for
    // null/undefined only, not falsy.
    const amountKobo = event.payload.rewardAmountKobo ?? getNumberEnv(EnvKey.CashbackAmountKobo, 30000);
    const transactionId = createReadableId(EntityIdPrefix.Cashback);
    const providerName = this.providerFactory.getProvider().name;

    await this.dataSource.transaction(async (manager) => {
      // Saved before queueing so the job always has a transaction row to work from.
      const existing = await manager.findOne(CashbackTransaction, {
        where: { userId: event.payload.user.id, badgeName: event.payload.badge_name },
      });

      const transaction =
        existing ??
        manager.create(CashbackTransaction, {
          id: transactionId,
          userId: event.payload.user.id,
          badgeName: event.payload.badge_name,
          amountKobo,
          provider: providerName,
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

    this.logger.log(
      `Received BadgeUnlocked event ${event.eventId} for user ${event.payload.user.id}, badge ${event.payload.badge_name}; queued cashback transaction ${transactionId}`,
    );
  }

  async listTransactions(query: ListCashbacksQueryDto): Promise<PaginatedCashbacksResponseDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const qb = this.transactionRepository.createQueryBuilder('transaction').orderBy('transaction.createdAt', 'DESC');

    if (query.userId) {
      qb.andWhere('transaction.userId = :userId', { userId: query.userId });
    }
    if (query.status) {
      qb.andWhere('transaction.status = :status', { status: query.status });
    }
    if (query.search) {
      const search = `%${query.search}%`;
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where('transaction.badgeName ILIKE :search', { search })
            .orWhere('transaction.userId ILIKE :search', { search })
            .orWhere('transaction.providerReference ILIKE :search', { search });
        }),
      );
    }

    const [items, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      items,
      meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  /** Resumes a FAILED transaction, optionally updating the payout account's bank details first. */
  async retryFailedTransaction(transactionId: string, override?: RetryBankDetailsOverride): Promise<void> {
    const transaction = await this.transactionRepository.findOneBy({ id: transactionId });
    if (!transaction) {
      throw new NotFoundException(`Cashback transaction ${transactionId} was not found`);
    }
    if (transaction.status !== PaymentStatus.Failed) {
      throw new BadRequestException(`Cashback transaction ${transactionId} is not FAILED (status: ${transaction.status})`);
    }

    let payoutAccount = await this.payoutAccountRepository.findOneBy({ userId: transaction.userId });
    if (override?.bankAccountNumber && override.bankCode) {
      const providerName = this.providerFactory.getProvider().name;
      payoutAccount = await this.payoutAccountRepository.save(
        this.payoutAccountRepository.create({
          ...payoutAccount,
          id: payoutAccount?.id ?? createReadableId(EntityIdPrefix.PayoutAccount),
          userId: transaction.userId,
          userName: payoutAccount?.userName ?? transaction.userId,
          bankAccountNumber: override.bankAccountNumber,
          bankCode: override.bankCode,
          provider: providerName,
        }),
      );
    }

    if (!payoutAccount?.bankAccountNumber || !payoutAccount.bankCode) {
      throw new BadRequestException(
        `Cannot retry cashback transaction ${transactionId}: no bank details on file. Supply bankAccountNumber and bankCode.`,
      );
    }

    const event: BadgeUnlockedEvent = createDomainEvent(
      DomainEventName.BadgeUnlocked,
      {
        badge_name: transaction.badgeName,
        rewardAmountKobo: transaction.amountKobo,
        rewardCurrency: 'NGN',
        user: {
          id: transaction.userId,
          email: '',
          name: payoutAccount.userName,
          bankAccountNumber: payoutAccount.bankAccountNumber,
          bankCode: payoutAccount.bankCode,
        },
      },
      transaction.correlationId ?? createReadableId(EntityIdPrefix.Event),
      createReadableId(EntityIdPrefix.Event),
    );

    await this.retryPayment(transactionId, event);
  }

  private async processPayment(transactionId: string, event: BadgeUnlockedEvent): Promise<void> {
    const transaction = await this.transactionRepository.findOneByOrFail({ id: transactionId });
    if (transaction.status !== PaymentStatus.Pending) {
      // Already claimed, already terminal, or a replayed event — don't call the provider again.
      this.logger.log(
        `Skipping cashback payment for transaction ${transactionId}; status is already "${transaction.status}"`,
      );
      return;
    }

    // Flips the transaction to PROCESSING before calling the provider; only one caller can
    // win this update, so two workers on the same transaction can't both trigger a payment.
    const claim = await this.transactionRepository.update(
      { id: transactionId, status: PaymentStatus.Pending },
      { status: CashbackProcessingStatus },
    );
    if (!claim.affected) {
      this.logger.log(`Skipping cashback payment for transaction ${transactionId}; lost the claim race`);
      return;
    }
    transaction.status = CashbackProcessingStatus;

    const provider = this.providerFactory.getProvider();
    this.logger.log(
      `Attempting cashback payment for transaction ${transactionId} via provider "${provider.name}" (amount ${transaction.amountKobo} kobo)`,
    );

    try {
      const payoutAccount = await this.upsertPayoutAccount(event);
      const result = await provider.sendCashback({
        userId: event.payload.user.id,
        userName: event.payload.user.name,
        badgeName: event.payload.badge_name,
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
          const eventId = await this.saveCashbackProcessedEvent(manager, transaction, event, PaymentStatus.Successful);
          outboxEventIds.push(eventId);
        }
      });
      await this.outboxService.publishMany(outboxEventIds);
      this.logger.log(`Cashback payment for transaction ${transactionId} completed with status ${result.status}`);
    } catch (error) {
      const isMissingBankDetails = error instanceof MissingBankDetailsError;
      const message = error instanceof Error ? error.message : String(error);

      transaction.status = PaymentStatus.Failed;
      transaction.failureReason = message;

      let outboxEventId: string | undefined;
      await this.dataSource.transaction(async (manager) => {
        await manager.save(CashbackTransaction, transaction);
        outboxEventId = await this.saveCashbackProcessedEvent(manager, transaction, event, PaymentStatus.Failed);
      });
      if (outboxEventId) {
        await this.outboxService.publishById(outboxEventId);
      }

      if (isMissingBankDetails) {
        // Missing bank details won't change on retry, so mark the job done instead of
        // retrying. Call retryPayment() once the user's bank details are on file.
        this.logger.error(
          `Cashback payment for transaction ${transactionId} failed permanently: missing bank details for user ${event.payload.user.id}. Not retrying; requires a manual/ops-triggered retry once bank details are added.`,
        );
        return;
      }

      this.logger.error(`Cashback payment for transaction ${transactionId} failed: ${message}`);
      throw error;
    }
  }

  /** Resets a failed transaction to pending and reprocesses it. Not wired to an endpoint yet. */
  async retryPayment(transactionId: string, event: BadgeUnlockedEvent): Promise<void> {
    const transaction = await this.transactionRepository.findOneByOrFail({ id: transactionId });
    if (transaction.status !== PaymentStatus.Failed) {
      this.logger.log(`Refusing to retry transaction ${transactionId}; status is "${transaction.status}", not FAILED`);
      return;
    }

    await this.transactionRepository.update(
      { id: transactionId, status: PaymentStatus.Failed },
      { status: PaymentStatus.Pending, failureReason: undefined },
    );
    await this.processPayment(transactionId, event);
  }

  private async saveCashbackProcessedEvent(
    manager: EntityManager,
    transaction: CashbackTransaction,
    event: BadgeUnlockedEvent,
    status: PaymentStatus.Successful | PaymentStatus.Failed,
  ): Promise<string> {
    const processedEvent: CashbackProcessedEvent = createDomainEvent(
      DomainEventName.CashbackProcessed,
      {
        badgeName: transaction.badgeName,
        userId: transaction.userId,
        amountKobo: transaction.amountKobo,
        providerReference: transaction.providerReference ?? '',
        status,
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

    return processedEvent.eventId;
  }

  private async upsertPayoutAccount(event: BadgeUnlockedEvent): Promise<PayoutAccount> {
    const { bankAccountNumber, bankCode, id, name } = event.payload.user;
    if (!bankAccountNumber || !bankCode) {
      throw new MissingBankDetailsError();
    }

    const providerName = this.providerFactory.getProvider().name;
    const existing = await this.payoutAccountRepository.findOneBy({ userId: id });
    if (existing) {
      existing.userName = name;
      existing.bankAccountNumber = bankAccountNumber;
      existing.bankCode = bankCode;
      existing.provider = providerName;
      return this.payoutAccountRepository.save(existing);
    }

    return this.payoutAccountRepository.save(
      this.payoutAccountRepository.create({
        id: createReadableId(EntityIdPrefix.PayoutAccount),
        userId: id,
        userName: name,
        bankAccountNumber,
        bankCode,
        provider: providerName,
      }),
    );
  }
}
