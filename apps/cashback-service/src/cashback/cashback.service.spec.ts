import { Logger } from '@nestjs/common';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import { EventVersion, PaymentProviderName, PaymentStatus, type BadgeUnlockedEvent } from '@bumpa/events-sdk';
import { OutboxService } from '@bumpa/outbox-sdk';
import { CashbackTransaction, CashbackProcessingStatus } from '../entities/cashback-transaction.entity';
import { OutboxEvent } from '../entities/outbox-event.entity';
import { PayoutAccount } from '../entities/payout-account.entity';
import { ProcessedEvent } from '../entities/processed-event.entity';
import { MissingBankDetailsError } from '../payments/payment-provider';
import { PaymentProviderFactory } from '../payments/payment-provider.factory';
import { CashbackService } from './cashback.service';

function buildEvent(overrides: Partial<BadgeUnlockedEvent['payload']['user']> = {}): BadgeUnlockedEvent {
  return {
    eventId: 'evt_test',
    type: 'BadgeUnlocked.v1' as BadgeUnlockedEvent['type'],
    version: EventVersion.V1,
    occurredAt: new Date().toISOString(),
    correlationId: 'corr_test',
    payload: {
      badge_name: 'Beginner',
      rewardAmountKobo: 30000,
      rewardCurrency: 'NGN',
      user: {
        id: 'usr_test',
        email: 'user@example.com',
        name: 'Amina Bello',
        bankAccountNumber: '0123456789',
        bankCode: '058',
        ...overrides,
      },
    },
  };
}

/**
 * In-memory fake modelling the single conditional UPDATE the fix relies on:
 * `UPDATE ... SET status = 'PROCESSING' WHERE id = :id AND status = 'PENDING'`.
 * Only one caller can ever flip a given row from PENDING, mirroring what Postgres guarantees
 * for a real row-level compare-and-swap.
 */
function createFakeTransactionRepository(initial: CashbackTransaction) {
  let record: CashbackTransaction = { ...initial };

  return {
    findOneByOrFail: jest.fn(async () => ({ ...record })),
    findOneBy: jest.fn(async () => ({ ...record })),
    update: jest.fn(async (where: Partial<CashbackTransaction>, partial: Partial<CashbackTransaction>) => {
      if (where.id === record.id && where.status === record.status) {
        record = { ...record, ...partial };
        return { affected: 1 };
      }
      return { affected: 0 };
    }),
    save: jest.fn(async (entity: CashbackTransaction) => {
      record = { ...record, ...entity };
      return record;
    }),
    find: jest.fn(async () => [record]),
    getRecord: () => record,
  };
}

describe('CashbackService', () => {
  const baseTransaction: CashbackTransaction = {
    id: 'cbk_test',
    userId: 'usr_test',
    badgeName: 'Beginner',
    amountKobo: 30000,
    status: PaymentStatus.Pending,
    provider: PaymentProviderName.Mock,
    correlationId: 'corr_test',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  let payoutAccountRepository: {
    findOneBy: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
  };
  let providerFactory: { getProvider: jest.Mock };
  let provider: { name: string; sendCashback: jest.Mock };
  let outboxService: { publishMany: jest.Mock; publishById: jest.Mock };
  let dataSource: { transaction: jest.Mock };
  let manager: { save: jest.Mock; create: jest.Mock; findOne: jest.Mock };

  beforeEach(() => {
    provider = { name: PaymentProviderName.Mock, sendCashback: jest.fn() };
    providerFactory = { getProvider: jest.fn(() => provider) };
    outboxService = { publishMany: jest.fn(), publishById: jest.fn() };
    manager = {
      save: jest.fn(async (_entity: unknown, value: unknown) => value),
      create: jest.fn((_entity: unknown, value: unknown) => value),
      findOne: jest.fn(),
    };
    dataSource = {
      transaction: jest.fn(async (callback: (m: typeof manager) => Promise<void>) => callback(manager)),
    };
    payoutAccountRepository = {
      findOneBy: jest.fn(async () => ({
        id: 'poa_test',
        userId: 'usr_test',
        userName: 'Amina Bello',
        bankAccountNumber: '0123456789',
        bankCode: '058',
        provider: PaymentProviderName.Mock,
      })),
      save: jest.fn(async (value: PayoutAccount) => value),
      create: jest.fn((value: Partial<PayoutAccount>) => value as PayoutAccount),
    };
  });

  async function createService(transactionRepository: unknown): Promise<CashbackService> {
    const moduleRef = await Test.createTestingModule({
      providers: [
        CashbackService,
        { provide: getDataSourceToken(), useValue: dataSource },
        { provide: getRepositoryToken(CashbackTransaction), useValue: transactionRepository },
        { provide: getRepositoryToken(PayoutAccount), useValue: payoutAccountRepository },
        { provide: PaymentProviderFactory, useValue: providerFactory },
        { provide: OutboxService, useValue: outboxService },
      ],
    }).compile();

    return moduleRef.get(CashbackService);
  }

  describe('claim-before-pay (double-payment race)', () => {
    it('only calls the provider once when the same transaction is processed concurrently', async () => {
      const fakeRepo = createFakeTransactionRepository(baseTransaction);
      const service = await createService(fakeRepo);
      provider.sendCashback.mockResolvedValue({
        provider: PaymentProviderName.Mock,
        reference: 'mock_ref',
        status: PaymentStatus.Successful,
      });

      const event = buildEvent();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const processPayment = (service as any).processPayment.bind(service);

      await Promise.all([processPayment('cbk_test', event), processPayment('cbk_test', event)]);

      expect(provider.sendCashback).toHaveBeenCalledTimes(1);
      // Both callers attempted the claim; only one could have won it.
      expect(fakeRepo.update).toHaveBeenCalledTimes(2);
      const finalSaveCall = manager.save.mock.calls.find(
        (call) => call[0] === CashbackTransaction && call[1]?.status === PaymentStatus.Successful,
      );
      expect(finalSaveCall).toBeDefined();
    });

    it('is a no-op when the transaction is already PROCESSING', async () => {
      const fakeRepo = createFakeTransactionRepository({ ...baseTransaction, status: CashbackProcessingStatus });
      const service = await createService(fakeRepo);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (service as any).processPayment('cbk_test', buildEvent());

      expect(provider.sendCashback).not.toHaveBeenCalled();
      expect(fakeRepo.update).not.toHaveBeenCalled();
    });

    it('is a no-op when the transaction is already SUCCESSFUL', async () => {
      const fakeRepo = createFakeTransactionRepository({ ...baseTransaction, status: PaymentStatus.Successful });
      const service = await createService(fakeRepo);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (service as any).processPayment('cbk_test', buildEvent());

      expect(provider.sendCashback).not.toHaveBeenCalled();
    });
  });

  describe('synchronous payment failure', () => {
    it('emits a CashbackProcessed Failed event via the outbox and rethrows', async () => {
      const fakeRepo = createFakeTransactionRepository(baseTransaction);
      const service = await createService(fakeRepo);
      provider.sendCashback.mockRejectedValue(new Error('provider exploded'));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await expect((service as any).processPayment('cbk_test', buildEvent())).rejects.toThrow('provider exploded');

      expect(manager.save).toHaveBeenCalledWith(OutboxEvent, expect.objectContaining({ eventType: 'CashbackProcessed.v1' }));
      expect(outboxService.publishById).toHaveBeenCalled();
      expect(manager.save).toHaveBeenCalledWith(
        CashbackTransaction,
        expect.objectContaining({ status: PaymentStatus.Failed, failureReason: 'provider exploded' }),
      );
    });
  });

  describe('missing bank details', () => {
    it('fails without rethrowing (no wasted BullMQ retry) and still emits a Failed outbox event', async () => {
      const fakeRepo = createFakeTransactionRepository(baseTransaction);
      const service = await createService(fakeRepo);
      payoutAccountRepository.findOneBy.mockResolvedValue(null);
      const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

      const event = buildEvent({ bankAccountNumber: null, bankCode: null });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await expect((service as any).processPayment('cbk_test', event)).resolves.toBeUndefined();

      expect(provider.sendCashback).not.toHaveBeenCalled();
      expect(manager.save).toHaveBeenCalledWith(
        CashbackTransaction,
        expect.objectContaining({ status: PaymentStatus.Failed }),
      );
      expect(manager.save).toHaveBeenCalledWith(OutboxEvent, expect.objectContaining({ eventType: 'CashbackProcessed.v1' }));
      expect(outboxService.publishById).toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('missing bank details'));

      errorSpy.mockRestore();
    });

    it('throws a MissingBankDetailsError from upsertPayoutAccount when bank details are absent', async () => {
      const fakeRepo = createFakeTransactionRepository(baseTransaction);
      const service = await createService(fakeRepo);
      payoutAccountRepository.findOneBy.mockResolvedValue(null);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await expect((service as any).upsertPayoutAccount(buildEvent({ bankAccountNumber: null, bankCode: null }))).rejects.toBeInstanceOf(
        MissingBankDetailsError,
      );
    });
  });

  describe('provider name consistency', () => {
    it('persists the provider resolved from the factory rather than raw env', async () => {
      provider = { name: PaymentProviderName.Paystack, sendCashback: jest.fn() };
      providerFactory.getProvider.mockReturnValue(provider);
      const fakeRepo = createFakeTransactionRepository(baseTransaction);
      const service = await createService(fakeRepo);
      provider.sendCashback.mockResolvedValue({
        provider: PaymentProviderName.Paystack,
        reference: 'paystack_ref',
        status: PaymentStatus.Successful,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (service as any).upsertPayoutAccount(buildEvent());

      expect(payoutAccountRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ provider: PaymentProviderName.Paystack }),
      );
    });
  });

  describe('listTransactions (pagination)', () => {
    function createFakeQueryBuilder(items: CashbackTransaction[], total: number) {
      const qb: Record<string, jest.Mock> = {};
      qb.orderBy = jest.fn(() => qb);
      qb.andWhere = jest.fn(() => qb);
      qb.skip = jest.fn(() => qb);
      qb.take = jest.fn(() => qb);
      qb.getManyAndCount = jest.fn(async () => [items, total]);
      return qb;
    }

    it('applies default paging and returns meta with total pages', async () => {
      const qb = createFakeQueryBuilder([baseTransaction], 45);
      const fakeRepo = { createQueryBuilder: jest.fn(() => qb) };
      const service = await createService(fakeRepo);

      const result = await service.listTransactions({});

      expect(qb.skip).toHaveBeenCalledWith(0);
      expect(qb.take).toHaveBeenCalledWith(20);
      expect(result.meta).toEqual({ page: 1, limit: 20, total: 45, totalPages: 3 });
      expect(result.items).toEqual([baseTransaction]);
    });

    it('applies userId, status, and search filters', async () => {
      const qb = createFakeQueryBuilder([], 0);
      const fakeRepo = { createQueryBuilder: jest.fn(() => qb) };
      const service = await createService(fakeRepo);

      await service.listTransactions({ page: 2, limit: 10, userId: 'usr_test', status: PaymentStatus.Successful, search: 'Beginner' });

      expect(qb.skip).toHaveBeenCalledWith(10);
      expect(qb.take).toHaveBeenCalledWith(10);
      expect(qb.andWhere).toHaveBeenCalledWith('transaction.userId = :userId', { userId: 'usr_test' });
      expect(qb.andWhere).toHaveBeenCalledWith('transaction.status = :status', { status: PaymentStatus.Successful });
      expect(qb.andWhere).toHaveBeenCalledWith(expect.anything());
    });
  });

  describe('retryFailedTransaction', () => {
    it('throws NotFoundException for an unknown transaction id', async () => {
      const fakeRepo = { findOneBy: jest.fn(async () => null) };
      const service = await createService(fakeRepo);

      await expect(service.retryFailedTransaction('cbk_missing')).rejects.toThrow('was not found');
    });

    it('throws BadRequestException when the transaction is not FAILED', async () => {
      const fakeRepo = { findOneBy: jest.fn(async () => ({ ...baseTransaction, status: PaymentStatus.Successful })) };
      const service = await createService(fakeRepo);

      await expect(service.retryFailedTransaction('cbk_test')).rejects.toThrow('is not FAILED');
    });

    it('throws BadRequestException when there is no bank account on file and no override is supplied', async () => {
      const fakeRepo = { findOneBy: jest.fn(async () => ({ ...baseTransaction, status: PaymentStatus.Failed })) };
      payoutAccountRepository.findOneBy.mockResolvedValue(null);
      const service = await createService(fakeRepo);

      await expect(service.retryFailedTransaction('cbk_test')).rejects.toThrow('no bank details on file');
    });

    it('resumes payment once bank details are supplied via the override', async () => {
      const fakeRepo = createFakeTransactionRepository({ ...baseTransaction, status: PaymentStatus.Failed });
      payoutAccountRepository.findOneBy.mockResolvedValue(null);
      const service = await createService(fakeRepo);
      provider.sendCashback.mockResolvedValue({
        provider: PaymentProviderName.Mock,
        reference: 'mock_ref',
        status: PaymentStatus.Successful,
      });

      await service.retryFailedTransaction('cbk_test', { bankAccountNumber: '0123456789', bankCode: '058' });

      expect(payoutAccountRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ bankAccountNumber: '0123456789', bankCode: '058' }),
      );
      expect(provider.sendCashback).toHaveBeenCalledTimes(1);
    });
  });
});
