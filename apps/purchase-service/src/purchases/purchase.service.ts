import { Injectable, Logger } from '@nestjs/common';
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

// Postgres unique_violation.
const POSTGRES_UNIQUE_VIOLATION = '23505';
const IDEMPOTENCY_KEY_UNIQUE_CONSTRAINT = 'UQ_purchases_idempotencyKey';

@Injectable()
export class PurchaseService {
  private readonly logger = new Logger(PurchaseService.name);

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
        this.logger.log(`Idempotency key ${idempotencyKey} already used; returning existing purchase ${existing.id}`);
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
      // Handles the duplicate path when a concurrent request wins the race.
      if (idempotencyKey && this.isUniqueViolation(error, IDEMPOTENCY_KEY_UNIQUE_CONSTRAINT)) {
        const existing = await this.findByIdempotencyKey(idempotencyKey);
        if (existing) {
          this.logger.log(`Idempotency key ${idempotencyKey} raced to a duplicate; returning existing purchase ${existing.id}`);
          return { purchaseId: existing.id };
        }
      }

      this.logger.error(`Failed to create purchase for user ${dto.userId}: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }

    this.logger.log(`Created purchase ${purchaseId} for user ${dto.userId} (${dto.amountKobo} kobo)`);
    await this.outboxService.publishMany(outboxEventIds);

    return { purchaseId };
  }

  private findByIdempotencyKey(idempotencyKey: string): Promise<Purchase | null> {
    return this.dataSource.getRepository(Purchase).findOne({ where: { idempotencyKey } });
  }

  private isUniqueViolation(error: unknown, constraintName?: string): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }

    const isUniqueViolation = (error as unknown as { code?: string }).code === POSTGRES_UNIQUE_VIOLATION;
    if (!isUniqueViolation || !constraintName) {
      return isUniqueViolation;
    }

    return error.message.includes(`"${constraintName}"`);
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
