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
import { DataSource, EntityManager, FindOptionsWhere, ILike, IsNull, LessThan, LessThanOrEqual, Repository } from 'typeorm';
import { EnvKey, getCashbackRetryConfig, getNumberEnv, getRedisConfig } from '../config/env';
import { CashbackProcessingStatus, CashbackTransaction } from '../entities/cashback-transaction.entity';
import { OutboxEvent } from '../entities/outbox-event.entity';
import { PayoutAccount } from '../entities/payout-account.entity';
import { ProcessedEvent } from '../entities/processed-event.entity';
import { classifyCashbackFailure, MissingBankDetailsError } from '../payments/payment-provider';
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
  private retryScanTimer?: NodeJS.Timeout;
  private retryScanRunning = false;

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
        const maxAttempts = job.opts.attempts ?? 1;
        const isFinalAttempt = job.attemptsMade + 1 >= maxAttempts;
        await this.processPayment(job.data.transactionId, job.data.event, isFinalAttempt);
      },
      {
        connection: this.redis,
        concurrency: 5,
      },
    );

    // Auto-retry only failed transactions marked retryable.
    const { scanIntervalMs } = getCashbackRetryConfig();
    this.retryScanTimer = setInterval(() => {
      void this.retryEligibleFailedTransactions();
    }, scanIntervalMs);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.retryScanTimer) {
      clearInterval(this.retryScanTimer);
    }
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

    // Keep 0 as a valid configured reward amount.
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
    const [items, total] = await this.transactionRepository.findAndCount({
      where: this.buildTransactionWhere(query),
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      items,
      meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

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

    if (override?.bankAccountNumber && override.bankCode) {
      // New bank details reset the failed-account retry count.
      await this.transactionRepository.update({ id: transactionId }, { retryCount: 0 });
    }

    await this.retryPayment(transactionId, this.buildRetryEvent(transaction, payoutAccount));
  }

  async retryEligibleFailedTransactions(): Promise<number> {
    if (this.retryScanRunning) {
      return 0;
    }

    this.retryScanRunning = true;
    try {
      const { maxAutoRetries } = getCashbackRetryConfig();
      const candidates = await this.transactionRepository.find({
        where: [
          {
            status: PaymentStatus.Failed,
            retryable: true,
            retryCount: LessThan(maxAutoRetries),
            nextRetryAt: IsNull(),
          },
          {
            status: PaymentStatus.Failed,
            retryable: true,
            retryCount: LessThan(maxAutoRetries),
            nextRetryAt: LessThanOrEqual(new Date()),
          },
        ],
      });

      let retried = 0;
      for (const transaction of candidates) {
        const payoutAccount = await this.payoutAccountRepository.findOneBy({ userId: transaction.userId });
        if (!payoutAccount?.bankAccountNumber || !payoutAccount.bankCode) {
          continue;
        }

        try {
          await this.retryPayment(transaction.id, this.buildRetryEvent(transaction, payoutAccount));
          retried += 1;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.warn(`Auto-retry for cashback transaction ${transaction.id} threw unexpectedly: ${message}`);
        }
      }

      if (retried > 0) {
        this.logger.log(`Queued auto-retry for ${retried} cashback transaction(s)`);
      }
      return retried;
    } finally {
      this.retryScanRunning = false;
    }
  }

  private buildRetryEvent(transaction: CashbackTransaction, payoutAccount: PayoutAccount): BadgeUnlockedEvent {
    return createDomainEvent(
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
  }

  private buildTransactionWhere(
    query: ListCashbacksQueryDto,
  ): FindOptionsWhere<CashbackTransaction> | FindOptionsWhere<CashbackTransaction>[] {
    const baseWhere: FindOptionsWhere<CashbackTransaction> = {
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    if (!query.search) {
      return baseWhere;
    }

    const search = ILike(`%${query.search}%`);
    return [
      { ...baseWhere, badgeName: search },
      { ...baseWhere, userId: search },
      { ...baseWhere, providerReference: search },
    ];
  }

  private async processPayment(transactionId: string, event: BadgeUnlockedEvent, isFinalAttempt = true): Promise<void> {
    const transaction = await this.transactionRepository.findOneByOrFail({ id: transactionId });
    if (transaction.status !== PaymentStatus.Pending) {
      // Avoid duplicate provider calls.
      this.logger.log(
        `Skipping cashback payment for transaction ${transactionId}; status is already "${transaction.status}"`,
      );
      return;
    }

    const provider = this.providerFactory.getProvider();
    // Save the reference before calling Paystack so webhooks can find the row.
    const reference = `${provider.name}_${createReadableId(EntityIdPrefix.Cashback)}`;

    // Only one worker can claim a pending transaction.
    const claim = await this.transactionRepository.update(
      { id: transactionId, status: PaymentStatus.Pending },
      { status: CashbackProcessingStatus, providerReference: reference },
    );
    if (!claim.affected) {
      this.logger.log(`Skipping cashback payment for transaction ${transactionId}; lost the claim race`);
      return;
    }
    transaction.status = CashbackProcessingStatus;
    transaction.providerReference = reference;

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
        reference,
      });

      const outboxEventIds: string[] = [];
      await this.dataSource.transaction(async (manager) => {
        transaction.status = result.status;
        transaction.provider = result.provider;
        transaction.providerReference = result.reference;
        transaction.providerRecipientCode = result.providerRecipientCode;
        transaction.failureReason = null;
        transaction.failureCode = null;
        transaction.retryable = null;
        transaction.nextRetryAt = null;
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
      const failure = classifyCashbackFailure(error);

      // Let BullMQ handle short retryable failures first.
      if (failure.retryable && !isFinalAttempt) {
        await this.transactionRepository.update(
          { id: transactionId, status: CashbackProcessingStatus },
          { status: PaymentStatus.Pending },
        );
        this.logger.warn(
          `Cashback payment for transaction ${transactionId} failed (retryable): ${failure.message}. Retrying.`,
        );
        throw failure;
      }

      transaction.status = PaymentStatus.Failed;
      transaction.failureReason = failure.message;
      transaction.failureCode = failure.code;
      transaction.retryable = failure.retryable;
      transaction.retryCount += 1;
      transaction.nextRetryAt = failure.retryable
        ? new Date(Date.now() + this.autoRetryDelayMs(transaction.retryCount))
        : undefined;

      let outboxEventId: string | undefined;
      await this.dataSource.transaction(async (manager) => {
        await manager.save(CashbackTransaction, transaction);
        outboxEventId = await this.saveCashbackProcessedEvent(manager, transaction, event, PaymentStatus.Failed);
      });
      if (outboxEventId) {
        await this.outboxService.publishById(outboxEventId);
      }

      if (!failure.retryable) {
        // Hard failures wait for manual retry.
        this.logger.error(
          `Cashback payment for transaction ${transactionId} failed permanently (${failure.code}): ${failure.message}. Needs a manual retry.`,
        );
        return;
      }

      this.logger.error(
        `Cashback payment for transaction ${transactionId} failed (retryable, attempt ${transaction.retryCount}): ${failure.message}. Will auto-retry.`,
      );
    }
  }

  private autoRetryDelayMs(retryCount: number): number {
    const { baseDelayMs } = getCashbackRetryConfig();
    const oneHourMs = 60 * 60 * 1000;
    return Math.min(baseDelayMs * 2 ** Math.max(0, retryCount - 1), oneHourMs);
  }

  // Queue retries so Paystack calls do not block HTTP requests.
  async retryPayment(transactionId: string, event: BadgeUnlockedEvent): Promise<void> {
    const transaction = await this.transactionRepository.findOneByOrFail({ id: transactionId });
    if (transaction.status !== PaymentStatus.Failed) {
      this.logger.log(`Refusing to retry transaction ${transactionId}; status is "${transaction.status}", not FAILED`);
      return;
    }

    await this.transactionRepository.update(
      { id: transactionId, status: PaymentStatus.Failed },
      { status: PaymentStatus.Pending, failureReason: null, nextRetryAt: null },
    );
    await this.queue.add(
      JobName.SendCashback,
      { transactionId, event },
      { attempts: 3, backoff: { type: 'exponential', delay: 1000 }, removeOnComplete: true, removeOnFail: false },
    );
    this.logger.log(`Queued retry for cashback transaction ${transactionId}`);
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
        ...(status === PaymentStatus.Failed
          ? {
              failureCode: transaction.failureCode ?? undefined,
              failureReason: transaction.failureReason ?? undefined,
              retryable: transaction.retryable ?? undefined,
            }
          : {}),
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
