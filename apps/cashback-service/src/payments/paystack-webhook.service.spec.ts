import { createHmac } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { PaymentStatus } from '@bumpa/events-sdk';
import { OutboxService } from '@bumpa/outbox-sdk';
import { EnvKey } from '../config/env';
import { CashbackTransaction } from '../entities/cashback-transaction.entity';
import { OutboxEvent } from '../entities/outbox-event.entity';
import { PaystackWebhookService } from './paystack-webhook.service';

describe('PaystackWebhookService', () => {
  const originalSecretKey = process.env[EnvKey.PaystackSecretKey];
  const transaction: CashbackTransaction = {
    id: 'cbk_test',
    userId: 'usr_test',
    badgeName: 'Beginner',
    amountKobo: 30000,
    status: PaymentStatus.Pending,
    provider: 'paystack',
    providerReference: 'paystack_ref',
    providerRecipientCode: 'RCP_test',
    correlationId: 'corr_test',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const repository = {
    findOneBy: jest.fn<Promise<CashbackTransaction | null>, [{ providerReference: string }]>(),
  };
  const manager = {
    save: jest.fn<Promise<CashbackTransaction | OutboxEvent>, [typeof CashbackTransaction | typeof OutboxEvent, CashbackTransaction | OutboxEvent]>(),
    create: jest.fn((_: typeof OutboxEvent, entity: Partial<OutboxEvent>) => entity as OutboxEvent),
  };
  const dataSource = {
    transaction: jest.fn(async (callback: (entityManager: typeof manager) => Promise<void>) => callback(manager)),
  };
  const outboxService = {
    publishById: jest.fn<Promise<boolean>, [string]>(),
  };
  let service: PaystackWebhookService;

  beforeEach(async () => {
    process.env[EnvKey.PaystackSecretKey] = 'sk_test_bumpa';
    repository.findOneBy.mockReset();
    manager.save.mockClear();
    manager.create.mockClear();
    dataSource.transaction.mockClear();
    outboxService.publishById.mockResolvedValue(true);
    outboxService.publishById.mockClear();

    const moduleRef = await Test.createTestingModule({
      providers: [
        PaystackWebhookService,
        { provide: getDataSourceToken(), useValue: dataSource },
        { provide: getRepositoryToken(CashbackTransaction), useValue: repository },
        { provide: OutboxService, useValue: outboxService },
      ],
    }).compile();

    service = moduleRef.get(PaystackWebhookService);
  });

  afterEach(() => {
    process.env[EnvKey.PaystackSecretKey] = originalSecretKey;
  });

  it('marks a transfer successful when the signature is valid', async () => {
    repository.findOneBy.mockResolvedValue({ ...transaction });
    const body = { event: 'transfer.success', data: { reference: 'paystack_ref' } };
    const rawBody = Buffer.from(JSON.stringify(body));

    await service.handleWebhook(rawBody, body, sign(rawBody));

    expect(manager.save).toHaveBeenCalledWith(CashbackTransaction, expect.objectContaining({ status: PaymentStatus.Successful }));
    expect(manager.save).toHaveBeenCalledWith(OutboxEvent, expect.objectContaining({ eventType: 'CashbackProcessed.v1' }));
  });

  it('marks a PROCESSING transfer successful (PROCESSING is non-terminal, still eligible)', async () => {
    repository.findOneBy.mockResolvedValue({ ...transaction, status: 'PROCESSING' });
    const body = { event: 'transfer.success', data: { reference: 'paystack_ref' } };
    const rawBody = Buffer.from(JSON.stringify(body));

    await service.handleWebhook(rawBody, body, sign(rawBody));

    expect(manager.save).toHaveBeenCalledWith(CashbackTransaction, expect.objectContaining({ status: PaymentStatus.Successful }));
  });

  it('marks a PROCESSING transfer failed (PROCESSING is non-terminal, still eligible)', async () => {
    repository.findOneBy.mockResolvedValue({ ...transaction, status: 'PROCESSING' });
    const body = { event: 'transfer.failed', data: { reference: 'paystack_ref', reason: 'insufficient funds' } };
    const rawBody = Buffer.from(JSON.stringify(body));

    await service.handleWebhook(rawBody, body, sign(rawBody));

    expect(manager.save).toHaveBeenCalledWith(CashbackTransaction, expect.objectContaining({ status: PaymentStatus.Failed }));
  });

  it('rejects an invalid signature', async () => {
    const body = { event: 'transfer.success', data: { reference: 'paystack_ref' } };

    await expect(service.handleWebhook(Buffer.from(JSON.stringify(body)), body, 'invalid')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  function sign(rawBody: Buffer): string {
    return createHmac('sha512', process.env[EnvKey.PaystackSecretKey] ?? '').update(rawBody).digest('hex');
  }
});
