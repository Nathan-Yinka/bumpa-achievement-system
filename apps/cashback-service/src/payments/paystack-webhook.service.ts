import { createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import {
  createDomainEvent,
  createReadableId,
  DomainEventName,
  EntityIdPrefix,
  type JsonObject,
  type JsonValue,
  PaymentStatus,
  type CashbackProcessedEvent,
} from '@bumpa/events-sdk';
import { OutboxService } from '@bumpa/outbox-sdk';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { EnvKey } from '../config/env';
import { CashbackTransaction } from '../entities/cashback-transaction.entity';
import { OutboxEvent } from '../entities/outbox-event.entity';

interface PaystackWebhookEvent {
  event: string;
  data: JsonObject;
}

@Injectable()
export class PaystackWebhookService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(CashbackTransaction)
    private readonly transactionRepository: Repository<CashbackTransaction>,
    private readonly outboxService: OutboxService,
  ) {}

  async handleWebhook(rawBody: Buffer | undefined, body: JsonObject, signature?: string): Promise<void> {
    this.verifySignature(rawBody, signature);
    const event = this.parseEvent(body);

    if (event.event === 'transfer.success') {
      await this.markTransferSuccessful(event.data);
      return;
    }

    if (event.event === 'transfer.failed' || event.event === 'transfer.reversed') {
      await this.markTransferFailed(event.data);
    }
  }

  private verifySignature(rawBody: Buffer | undefined, signature?: string): void {
    const secret = process.env[EnvKey.PaystackWebhookSecret] || process.env[EnvKey.PaystackSecretKey];
    if (!secret || !rawBody || !signature) {
      throw new UnauthorizedException('Paystack webhook signature could not be verified');
    }

    const expected = createHmac('sha512', secret).update(rawBody).digest('hex');
    const expectedBuffer = Buffer.from(expected, 'hex');
    const signatureBuffer = Buffer.from(signature, 'hex');

    if (expectedBuffer.length !== signatureBuffer.length || !timingSafeEqual(expectedBuffer, signatureBuffer)) {
      throw new UnauthorizedException('Invalid Paystack webhook signature');
    }
  }

  private parseEvent(body: JsonObject): PaystackWebhookEvent {
    const event = this.readRequiredString(body, 'event');
    const data = this.readRequiredObject(body, 'data');
    return { event, data };
  }

  private async markTransferSuccessful(data: JsonObject): Promise<void> {
    const reference = this.readRequiredString(data, 'reference');
    const transaction = await this.transactionRepository.findOneBy({ providerReference: reference });
    if (!transaction || transaction.status === PaymentStatus.Successful) {
      return;
    }

    let outboxEventId: string | undefined;
    await this.dataSource.transaction(async (manager) => {
      transaction.status = PaymentStatus.Successful;
      transaction.failureReason = undefined;
      await manager.save(CashbackTransaction, transaction);
      outboxEventId = await this.saveCashbackProcessedEvent(manager, transaction, PaymentStatus.Successful);
    });
    if (outboxEventId) {
      await this.outboxService.publishById(outboxEventId);
    }
  }

  private async markTransferFailed(data: JsonObject): Promise<void> {
    const reference = this.readRequiredString(data, 'reference');
    const transaction = await this.transactionRepository.findOneBy({ providerReference: reference });
    if (!transaction || transaction.status === PaymentStatus.Failed) {
      return;
    }

    let outboxEventId: string | undefined;
    await this.dataSource.transaction(async (manager) => {
      transaction.status = PaymentStatus.Failed;
      transaction.failureReason =
        this.readString(data, 'reason') ?? this.readString(data, 'failure_reason') ?? 'Paystack transfer failed';
      await manager.save(CashbackTransaction, transaction);
      outboxEventId = await this.saveCashbackProcessedEvent(manager, transaction, PaymentStatus.Failed);
    });
    if (outboxEventId) {
      await this.outboxService.publishById(outboxEventId);
    }
  }

  private async saveCashbackProcessedEvent(
    manager: EntityManager,
    transaction: CashbackTransaction,
    status: PaymentStatus.Successful | PaymentStatus.Failed,
  ): Promise<string> {
    const processedEvent: CashbackProcessedEvent = createDomainEvent(
      DomainEventName.CashbackProcessed,
      {
        badgeName: transaction.badgeName,
        userId: transaction.userId,
        amountKobo: transaction.amountKobo,
        providerReference: transaction.providerReference ?? '',
        status,
      },
      transaction.correlationId ?? createReadableId(EntityIdPrefix.Event),
      createReadableId(EntityIdPrefix.Event),
    );

    await manager.save(
      OutboxEvent,
      manager.create(OutboxEvent, {
        id: processedEvent.eventId,
        eventType: processedEvent.type,
        routingKey: processedEvent.type,
        payload: processedEvent,
      }),
    );

    return processedEvent.eventId;
  }

  private readRequiredObject(source: JsonObject, key: string): JsonObject {
    const value = source[key];
    if (!this.isJsonObject(value)) {
      throw new Error(`Paystack webhook is missing ${key}`);
    }

    return value;
  }

  private readRequiredString(source: JsonObject, key: string): string {
    const value = this.readString(source, key);
    if (!value) {
      throw new Error(`Paystack webhook is missing ${key}`);
    }

    return value;
  }

  private readString(source: JsonObject, key: string): string | undefined {
    const value = source[key];
    return typeof value === 'string' ? value : undefined;
  }

  private isJsonObject(value: JsonValue | undefined): value is JsonObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
