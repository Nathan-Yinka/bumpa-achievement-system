import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import IORedis from 'ioredis';
import { OUTBOX_MODULE_OPTIONS } from './outbox.constants';
import { OutboxService } from './outbox.service';
import type { ResolvedOutboxModuleOptions } from './outbox.types';

@Injectable()
export class ScheduledOutboxPublisher implements OnModuleInit, OnModuleDestroy {
  private redis!: IORedis;
  private interval?: NodeJS.Timeout;
  private running = false;

  constructor(
    @Inject(OUTBOX_MODULE_OPTIONS) private readonly options: ResolvedOutboxModuleOptions,
    private readonly outboxService: OutboxService,
  ) {}

  onModuleInit(): void {
    this.redis = new IORedis({ ...this.options.redis, maxRetriesPerRequest: null });
    this.interval = setInterval(() => {
      void this.publishPending();
    }, this.options.pollIntervalMs);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.interval) {
      clearInterval(this.interval);
    }
    await this.redis?.quit();
  }

  async publishPending(): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;
    const lockValue = `${process.pid}:${Date.now()}`;
    const hasLock = await this.acquireLock(lockValue);
    if (!hasLock) {
      this.running = false;
      return;
    }

    const heartbeat = this.startLockHeartbeat(lockValue);
    try {
      await this.outboxService.publishPendingBatch();
    } finally {
      clearInterval(heartbeat);
      await this.releaseLock(lockValue);
      this.running = false;
    }
  }

  /** Keeps the Redis lock alive for as long as the batch is publishing. */
  private startLockHeartbeat(lockValue: string): NodeJS.Timeout {
    return setInterval(() => {
      void this.extendLock(lockValue).catch(() => {
        // Nothing to do if the lock was already lost.
      });
    }, Math.max(1, Math.floor(this.options.lockTtlMs / 2)));
  }

  private async extendLock(lockValue: string): Promise<void> {
    // Only extend the TTL if we still hold the lock (compare-and-set).
    await this.redis.eval(
      `
        if redis.call("GET", KEYS[1]) == ARGV[1] then
          return redis.call("PEXPIRE", KEYS[1], ARGV[2])
        end
        return 0
      `,
      1,
      this.options.lockKey,
      lockValue,
      this.options.lockTtlMs,
    );
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
