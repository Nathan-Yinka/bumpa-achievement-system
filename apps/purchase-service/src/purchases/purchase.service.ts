import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  createDomainEvent,
  createReadableId,
  DomainEventName,
  EntityIdPrefix,
  type PurchaseCompletedEvent,
  type UserSnapshot,
} from '@bumpa/events-sdk';
import { OutboxService } from '@bumpa/outbox-sdk';
import { DataSource, QueryFailedError } from 'typeorm';
import { OutboxEvent } from '../entities/outbox-event.entity';
import { Purchase } from '../entities/purchase.entity';
import { User } from '../entities/user.entity';
import type { CreatePurchaseDto } from './dto/create-purchase.dto';

// Postgres error code for a unique_violation (e.g. our UQ_purchases_idempotencyKey constraint).
const POSTGRES_UNIQUE_VIOLATION = '23505';

@Injectable()
export class PurchaseService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly outboxService: OutboxService,
  ) {}

  async createPurchase(
    dto: CreatePurchaseDto,
    correlationId: string,
    idempotencyKey?: string,
  ): Promise<{ purchaseId: string }> {
    if (idempotencyKey) {
      const existing = await this.findByIdempotencyKey(idempotencyKey);
      if (existing) {
        return { purchaseId: existing.id };
      }
    }

    const purchaseId = createReadableId(EntityIdPrefix.Purchase);
    const eventId = createReadableId(EntityIdPrefix.Event);
    const outboxEventIds: string[] = [];

    try {
      await this.dataSource.transaction(async (manager) => {
        const userSnapshot = this.buildUserSnapshot(dto);

        const user = manager.create(User, userSnapshot as Partial<User>);
        await manager.save(User, user);

        const purchase = manager.create(Purchase, {
          id: purchaseId,
          userId: dto.userId,
          amountKobo: dto.amountKobo,
          idempotencyKey,
        });
        await manager.save(Purchase, purchase);

        const event = this.buildPurchaseCompletedEvent(dto, userSnapshot, purchaseId, correlationId, eventId);

        await manager.save(
          OutboxEvent,
          manager.create(OutboxEvent, {
            id: event.eventId,
            eventType: event.type,
            routingKey: event.type,
            payload: event,
          }),
        );
        outboxEventIds.push(event.eventId);
      });
    } catch (error) {
      // A concurrent request with the same idempotency key can hit the unique constraint
      // directly instead of the pre-check above; treat it the same way.
      if (idempotencyKey && this.isUniqueViolation(error)) {
        const existing = await this.findByIdempotencyKey(idempotencyKey);
        if (existing) {
          return { purchaseId: existing.id };
        }
      }
      throw error;
    }

    await this.outboxService.publishMany(outboxEventIds);

    return { purchaseId };
  }

  private findByIdempotencyKey(idempotencyKey: string): Promise<Purchase | null> {
    return this.dataSource.getRepository(Purchase).findOne({ where: { idempotencyKey } });
  }

  private isUniqueViolation(error: unknown): boolean {
    return error instanceof QueryFailedError && (error as unknown as { code?: string }).code === POSTGRES_UNIQUE_VIOLATION;
  }

  private buildUserSnapshot(dto: CreatePurchaseDto): UserSnapshot {
    return {
      id: dto.userId,
      email: dto.email,
      name: dto.name,
      bankAccountNumber: dto.bankAccountNumber,
      bankCode: dto.bankCode,
    };
  }

  private buildPurchaseCompletedEvent(
    dto: CreatePurchaseDto,
    userSnapshot: UserSnapshot,
    purchaseId: string,
    correlationId: string,
    eventId: string,
  ): PurchaseCompletedEvent {
    return createDomainEvent(
      DomainEventName.PurchaseCompleted,
      {
        userId: dto.userId,
        purchaseId,
        amountKobo: dto.amountKobo,
        user: userSnapshot,
      },
      correlationId,
      eventId,
    );
  }
}
