import { Injectable, OnModuleInit } from '@nestjs/common';
import { BrokerService } from '@bumpa/broker-sdk';
import { BrokerQueueName, DomainEventName, type BadgeUnlockedEvent } from '@bumpa/events-sdk';
import { CashbackService } from '../cashback/cashback.service';

@Injectable()
export class BadgeUnlockedConsumer implements OnModuleInit {
  constructor(
    private readonly brokerService: BrokerService,
    private readonly cashbackService: CashbackService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.brokerService.subscribe<BadgeUnlockedEvent>({
      queue: BrokerQueueName.CashbackBadgeUnlocked,
      routingKey: DomainEventName.BadgeUnlocked,
      handler: async (event) => {
        await this.cashbackService.handleBadgeUnlocked(event);
      },
    });
  }
}
