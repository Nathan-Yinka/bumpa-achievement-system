import { Injectable, OnModuleInit } from '@nestjs/common';
import { BrokerService } from '@bumpa/broker-sdk';
import { BrokerQueueName, DomainEventName, type PurchaseCompletedEvent } from '@bumpa/events-sdk';
import { LoyaltyService } from '../loyalty/loyalty.service';

@Injectable()
export class PurchaseCompletedConsumer implements OnModuleInit {
  constructor(
    private readonly brokerService: BrokerService,
    private readonly loyaltyService: LoyaltyService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.brokerService.subscribe<PurchaseCompletedEvent>({
      queue: BrokerQueueName.LoyaltyPurchaseCompleted,
      routingKey: DomainEventName.PurchaseCompleted,
      handler: async (event) => {
        await this.loyaltyService.handlePurchaseCompleted(event);
      },
    });
  }
}
