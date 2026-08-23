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
      await this.publishRecord(event);
    }
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
      event.status = event.attempts >= this.options.maxAttempts ? OutboxStatus.Failed : OutboxStatus.Pending;
      await this.repository.save(event);
      return false;
    }
  }
}
