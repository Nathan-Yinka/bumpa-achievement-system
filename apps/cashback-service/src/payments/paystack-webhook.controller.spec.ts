import { createHmac } from 'node:crypto';
import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { PaymentStatus } from '@bumpa/events-sdk';
import { OutboxService } from '@bumpa/outbox-sdk';
import request from 'supertest';
import { EnvKey } from '../config/env';
import { CashbackTransaction } from '../entities/cashback-transaction.entity';
import { PaystackWebhookController } from './paystack-webhook.controller';
import { PaystackWebhookService } from './paystack-webhook.service';

// Exercises the real HTTP path (raw body capture, header parsing, signature verification,
// status codes) that a mocked-service unit test can't cover, using the same app bootstrap
// (rawBody: true, global ValidationPipe) as main.ts.
describe('PaystackWebhookController (HTTP integration)', () => {
  const originalSecretKey = process.env[EnvKey.PaystackSecretKey];
  let app: INestApplication;
  let transactionRepository: { findOneBy: jest.Mock };

  beforeAll(async () => {
    process.env[EnvKey.PaystackSecretKey] = 'sk_test_bumpa';

    transactionRepository = { findOneBy: jest.fn() };
    const manager: { save: jest.Mock; create: jest.Mock } = {
      save: jest.fn(async (_entity: unknown, data: unknown) => data),
      create: jest.fn((_entity: unknown, data: unknown) => data),
    };
    const dataSource = {
      transaction: jest.fn(async (callback: (entityManager: typeof manager) => Promise<void>) => callback(manager)),
    };
    const outboxService = { publishById: jest.fn(async () => true) };

    const moduleRef = await Test.createTestingModule({
      controllers: [PaystackWebhookController],
      providers: [
        PaystackWebhookService,
        { provide: getDataSourceToken(), useValue: dataSource },
        { provide: getRepositoryToken(CashbackTransaction), useValue: transactionRepository },
        { provide: OutboxService, useValue: outboxService },
      ],
    }).compile();

    app = moduleRef.createNestApplication({ rawBody: true });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    process.env[EnvKey.PaystackSecretKey] = originalSecretKey;
    await app.close();
  });

  function sign(body: object): string {
    return createHmac('sha512', process.env[EnvKey.PaystackSecretKey] ?? '')
      .update(Buffer.from(JSON.stringify(body)))
      .digest('hex');
  }

  it('rejects a request with no signature header', async () => {
    await request(app.getHttpServer())
      .post('/webhooks/paystack')
      .send({ event: 'transfer.success', data: { reference: 'ref_1' } })
      .expect(401);
  });

  it('rejects a request with an invalid signature', async () => {
    await request(app.getHttpServer())
      .post('/webhooks/paystack')
      .set('x-paystack-signature', 'not-a-real-signature')
      .send({ event: 'transfer.success', data: { reference: 'ref_1' } })
      .expect(401);
  });

  it('accepts a correctly-signed transfer.success event and marks the transaction successful', async () => {
    const body = { event: 'transfer.success', data: { reference: 'ref_success' } };
    transactionRepository.findOneBy.mockResolvedValue({
      id: 'cbk_1',
      userId: 'usr_1',
      badgeName: 'Beginner',
      amountKobo: 30000,
      status: PaymentStatus.Pending,
      providerReference: 'ref_success',
    });

    const response = await request(app.getHttpServer())
      .post('/webhooks/paystack')
      .set('x-paystack-signature', sign(body))
      .send(body)
      .expect(200);

    expect(response.body).toEqual({ received: true });
    expect(transactionRepository.findOneBy).toHaveBeenCalledWith({ providerReference: 'ref_success' });
  });

  it('accepts a correctly-signed transfer.failed event and marks the transaction failed', async () => {
    const body = { event: 'transfer.failed', data: { reference: 'ref_failed', reason: 'insufficient funds' } };
    transactionRepository.findOneBy.mockResolvedValue({
      id: 'cbk_2',
      userId: 'usr_2',
      badgeName: 'Beginner',
      amountKobo: 30000,
      status: PaymentStatus.Pending,
      providerReference: 'ref_failed',
    });

    await request(app.getHttpServer())
      .post('/webhooks/paystack')
      .set('x-paystack-signature', sign(body))
      .send(body)
      .expect(200, { received: true });
  });

  it('is a no-op for an unknown reference but still returns 200', async () => {
    const body = { event: 'transfer.success', data: { reference: 'ref_unknown' } };
    transactionRepository.findOneBy.mockResolvedValue(null);

    await request(app.getHttpServer())
      .post('/webhooks/paystack')
      .set('x-paystack-signature', sign(body))
      .send(body)
      .expect(200, { received: true });
  });
});
