import { DynamicModule, Inject, Injectable, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression, ScheduleModule } from '@nestjs/schedule';
import { BrokerService } from '@bumpa/broker-sdk';
import { EnvKey, getRequiredEnv } from '@bumpa/config-sdk';
import { type DomainEvent, OutboxStatus } from '@bumpa/events-sdk';
import IORedis from 'ioredis';
import { DataSource, type EntityTarget, type FindOptionsWhere, type ObjectLiteral, type Repository } from 'typeorm';

export interface OutboxRecord extends ObjectLiteral {
  id: string;
  payload: DomainEvent | Record<string, unknown>;
  status: OutboxStatus;
  attempts: number;
  lastError?: string;
  createdAt: Date;
  publishedAt?: Date;
}

export interface OutboxModuleOptions {
  entity: EntityTarget<OutboxRecord>;
  lockKey: string;
  batchSize?: number;
  maxAttempts?: number;
  lockTtlMs?: number;
}

export const OUTBOX_MODULE_OPTIONS = Symbol('OUTBOX_MODULE_OPTIONS');

@Module({})
export class OutboxModule {
  static forRoot(options: OutboxModuleOptions): DynamicModule {
    return {
      module: OutboxModule,
      imports: [ScheduleModule.forRoot()],
      providers: [
        {
          provide: OUTBOX_MODULE_OPTIONS,
          useValue: {
            batchSize: 20,
            maxAttempts: 5,
            lockTtlMs: 5000,
            ...options,
          },
        },
        ScheduledOutboxPublisher,
      ],
      exports: [ScheduledOutboxPublisher],
    };
  }
}

@Injectable()
export class ScheduledOutboxPublisher implements OnModuleInit, OnModuleDestroy {
  private redis!: IORedis;
  private repository!: Repository<OutboxRecord>;

  constructor(
    @Inject(OUTBOX_MODULE_OPTIONS) private readonly options: Required<OutboxModuleOptions>,
    private readonly dataSource: DataSource,
    private readonly brokerService: BrokerService,
  ) {}

  onModuleInit(): void {
    this.redis = new IORedis(getRequiredEnv(EnvKey.RedisUrl), { maxRetriesPerRequest: null });
    this.repository = this.dataSource.getRepository(this.options.entity);
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis?.quit();
  }

  @Cron(CronExpression.EVERY_SECOND)
  async publishPending(): Promise<void> {
    const lockValue = `${process.pid}:${Date.now()}`;
    const hasLock = await this.acquireLock(lockValue);
    if (!hasLock) {
      return;
    }

    try {
      await this.publishBatch();
    } finally {
      await this.releaseLock(lockValue);
    }
  }

  private async publishBatch(): Promise<void> {
    const events = await this.repository.find({
      where: { status: OutboxStatus.Pending } as FindOptionsWhere<OutboxRecord>,
      order: { createdAt: 'ASC' },
      take: this.options.batchSize,
    });

    for (const event of events) {
      try {
        await this.brokerService.publish(event.payload as DomainEvent);
        event.status = OutboxStatus.Published;
        event.publishedAt = new Date();
        await this.repository.save(event);
      } catch (error) {
        event.attempts += 1;
        event.lastError = error instanceof Error ? error.message : String(error);
        event.status = event.attempts >= this.options.maxAttempts ? OutboxStatus.Failed : OutboxStatus.Pending;
        await this.repository.save(event);
      }
    }
  }

  private async acquireLock(lockValue: string): Promise<boolean> {
    // Redis SET NX keeps only one pod publishing a service's outbox batch at a time.
    const result = await this.redis.set(this.options.lockKey, lockValue, 'PX', this.options.lockTtlMs, 'NX');
    return result === 'OK';
  }

  private async releaseLock(lockValue: string): Promise<void> {
    // Compare-and-delete avoids releasing a lock that another pod acquired after TTL expiry.
    await this.redis.eval(
      `
        if redis.call("GET", KEYS[1]) == ARGV[1] then
          return redis.call("DEL", KEYS[1])
        end
        return 0
      `,
      1,
      this.options.lockKey,
      lockValue,
    );
  }
}
