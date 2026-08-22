import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  createDomainEvent,
  createReadableId,
  DomainEventName,
  EntityIdPrefix,
  type PurchaseCompletedEvent,
} from '@bumpa/events-sdk';
import { DataSource } from 'typeorm';
import { OutboxEvent } from '../entities/outbox-event.entity';
import { Purchase } from '../entities/purchase.entity';
import { User } from '../entities/user.entity';
import type { CreatePurchaseDto } from './dto/create-purchase.dto';

@Injectable()
export class PurchaseService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async createPurchase(dto: CreatePurchaseDto, correlationId: string): Promise<{ purchaseId: string }> {
    const purchaseId = createReadableId(EntityIdPrefix.Purchase);
    const eventId = createReadableId(EntityIdPrefix.Event);

    await this.dataSource.transaction(async (manager) => {
      const user = manager.create(User, {
        id: dto.userId,
        email: dto.email,
        name: dto.name,
        bankAccountNumber: dto.bankAccountNumber,
        bankCode: dto.bankCode,
      });
      await manager.save(User, user);

      const purchase = manager.create(Purchase, {
        id: purchaseId,
        userId: dto.userId,
        amountKobo: dto.amountKobo,
      });
      await manager.save(Purchase, purchase);

      const event: PurchaseCompletedEvent = createDomainEvent(
        DomainEventName.PurchaseCompleted,
        {
          userId: dto.userId,
          purchaseId,
          amountKobo: dto.amountKobo,
          user: {
            id: dto.userId,
            email: dto.email,
            name: dto.name,
            bankAccountNumber: dto.bankAccountNumber,
            bankCode: dto.bankCode,
          },
        },
        correlationId,
        eventId,
      );

      await manager.save(
        OutboxEvent,
        manager.create(OutboxEvent, {
          id: event.eventId,
          eventType: event.type,
          routingKey: event.type,
          payload: event,
        }),
      );
    });

    return { purchaseId };
  }
}
