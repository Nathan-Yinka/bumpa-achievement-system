import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { BrokerService } from '@bumpa/broker-sdk';
import { OutboxStatus } from '@bumpa/events-sdk';
import { Repository } from 'typeorm';
import { OutboxEvent } from '../entities/outbox-event.entity';

@Injectable()
export class OutboxPublisherService implements OnModuleInit, OnModuleDestroy {
  private interval?: NodeJS.Timeout;

  constructor(
    @InjectRepository(OutboxEvent)
    private readonly outboxRepository: Repository<OutboxEvent>,
    private readonly brokerService: BrokerService,
  ) {}

  onModuleInit(): void {
    this.interval = setInterval(() => {
      void this.publishPending();
    }, 1000);
  }

  onModuleDestroy(): void {
    if (this.interval) {
      clearInterval(this.interval);
    }
  }

  async publishPending(): Promise<void> {
    const events = await this.outboxRepository.find({
      where: { status: OutboxStatus.Pending },
      order: { createdAt: 'ASC' },
      take: 20,
    });

    for (const event of events) {
      try {
        await this.brokerService.publish(event.payload as never);
        event.status = OutboxStatus.Published;
        event.publishedAt = new Date();
        await this.outboxRepository.save(event);
      } catch (error) {
        event.attempts += 1;
        event.lastError = error instanceof Error ? error.message : String(error);
        event.status = event.attempts >= 5 ? OutboxStatus.Failed : OutboxStatus.Pending;
        await this.outboxRepository.save(event);
      }
    }
  }
}
