import { Injectable, OnModuleInit } from '@nestjs/common';
import { BrokerService } from '@bumpa/broker-sdk';
import { DomainEventName, type PurchaseCompletedEvent } from '@bumpa/events-sdk';
import { LoyaltyService } from '../loyalty/loyalty.service';

const QUEUE = 'loyalty.purchase-completed';

@Injectable()
export class PurchaseCompletedConsumer implements OnModuleInit {
  constructor(
    private readonly brokerService: BrokerService,
    private readonly loyaltyService: LoyaltyService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.brokerService.subscribe<PurchaseCompletedEvent>({
      queue: QUEUE,
      routingKey: DomainEventName.PurchaseCompleted,
      handler: async (event) => {
        await this.loyaltyService.handlePurchaseCompleted(event);
      },
    });
  }
}
