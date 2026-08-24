import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { BrokerService } from '@bumpa/broker-sdk';
import { OutboxStatus } from '@bumpa/events-sdk';
import { DataSource, type FindOptionsWhere, type Repository } from 'typeorm';
import { OUTBOX_MODULE_OPTIONS } from './outbox.constants';
import type { OutboxRecord, ResolvedOutboxModuleOptions } from './outbox.types';

@Injectable()
export class OutboxService implements OnModuleInit {
  private repository!: Repository<OutboxRecord>;

  constructor(
    @Inject(OUTBOX_MODULE_OPTIONS) private readonly options: ResolvedOutboxModuleOptions,
    private readonly dataSource: DataSource,
    private readonly brokerService: BrokerService,
  ) {}

  onModuleInit(): void {
    this.repository = this.dataSource.getRepository(this.options.entity);
  }

  /** Attempts to publish a freshly committed outbox row without waiting for the retry scanner. */
  async publishById(id: string): Promise<boolean> {
    const event = await this.repository.findOne({ where: { id } as FindOptionsWhere<OutboxRecord> });
    if (!event || event.status === OutboxStatus.Published || event.attempts >= this.options.maxAttempts) {
      return false;
    }

    // Claims the row so the scheduled poller can't publish it too.
    const claimed = await this.claimForPublishing(event.id);
    if (!claimed) {
      return false;
    }

    event.status = OutboxStatus.Publishing;
    return this.publishRecord(event);
  }

  async publishMany(ids: string[]): Promise<void> {
    for (const id of ids) {
      await this.publishById(id);
    }
  }

  /** Retries pending rows left behind by transient broker failures or process crashes. */
  async publishPendingBatch(): Promise<void> {
    const events = await this.repository.find({
      where: { status: OutboxStatus.Pending } as FindOptionsWhere<OutboxRecord>,
      order: { createdAt: 'ASC' },
      take: this.options.batchSize,
    });

    for (const event of events) {
      // Another process may have already claimed this row.
      const claimed = await this.claimForPublishing(event.id);
      if (!claimed) {
        continue;
      }

      event.status = OutboxStatus.Publishing;
      await this.publishRecord(event);
    }
  }

  /** Flips a row from Pending to Publishing in one update. Returns whether this call won the claim. */
  private async claimForPublishing(id: string): Promise<boolean> {
    const result = await this.repository
      .createQueryBuilder()
      .update()
      // TypeORM's QueryDeepPartialEntity type doesn't fit OutboxRecord's index signature here.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .set({ status: OutboxStatus.Publishing } as any)
      .where('id = :id', { id })
      .andWhere('status = :pending', { pending: OutboxStatus.Pending })
      .execute();

    return (result.affected ?? 0) > 0;
  }

  private async publishRecord(event: OutboxRecord): Promise<boolean> {
    try {
      await this.brokerService.publish(event.payload);
      event.status = OutboxStatus.Published;
      event.publishedAt = new Date();
      event.lastError = undefined;
      await this.repository.save(event);
      return true;
    } catch (error) {
      event.attempts += 1;
      event.lastError = error instanceof Error ? error.message : String(error);
      // Back to Pending for another retry, or Failed once attempts run out.
      event.status = event.attempts >= this.options.maxAttempts ? OutboxStatus.Failed : OutboxStatus.Pending;
      await this.repository.save(event);
      return false;
    }
  }
}
