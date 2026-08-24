import { Test } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { BrokerService } from '@bumpa/broker-sdk';
import { OutboxService } from '@bumpa/outbox-sdk';
import { CashbackTransaction } from '../entities/cashback-transaction.entity';
import { PayoutAccount } from '../entities/payout-account.entity';
import { BadgeUnlockedConsumer } from '../messaging/badge-unlocked.consumer';
import { MockPaymentProvider } from '../payments/mock-payment.provider';
import { PaymentProviderFactory } from '../payments/payment-provider.factory';
import { PaystackPaymentProvider } from '../payments/paystack-payment.provider';
import { CashbackController } from './cashback.controller';
import { CashbackService } from './cashback.service';

describe('CashbackModule wiring', () => {
  it('compiles the cashback controller with mocked infrastructure', async () => {
    const repository = {
      find: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
      exists: jest.fn(),
      findOneBy: jest.fn(),
      update: jest.fn(),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [CashbackController],
      providers: [
        CashbackService,
        BadgeUnlockedConsumer,
        MockPaymentProvider,
        PaystackPaymentProvider,
        PaymentProviderFactory,
        { provide: getDataSourceToken(), useValue: { getRepository: jest.fn(() => repository), transaction: jest.fn() } },
        { provide: getRepositoryToken(CashbackTransaction), useValue: repository },
        { provide: getRepositoryToken(PayoutAccount), useValue: repository },
        { provide: BrokerService, useValue: { subscribe: jest.fn() } },
        { provide: OutboxService, useValue: { publishMany: jest.fn() } },
      ],
    }).compile();

    expect(moduleRef.get(CashbackController)).toBeInstanceOf(CashbackController);
  });
});
