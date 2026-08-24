import { QueryFailedError } from 'typeorm';
import { OutboxEvent } from '../entities/outbox-event.entity';
import { Purchase } from '../entities/purchase.entity';
import { User } from '../entities/user.entity';
import type { CreatePurchaseDto } from './dto/create-purchase.dto';
import { PurchaseService } from './purchase.service';

describe('PurchaseService', () => {
  const dto: CreatePurchaseDto = {
    userId: 'usr_1',
    email: 'amina@getbumpa.com',
    name: 'Amina Bello',
    amountKobo: 500000,
  };

  let purchases: Array<Record<string, unknown>>;
  let users: Array<Record<string, unknown>>;
  let outboxEvents: Array<Record<string, unknown>>;
  let publishMany: jest.Mock;
  let transactionImpl: (cb: (manager: unknown) => Promise<void>) => Promise<void>;
  let dataSource: { transaction: jest.Mock; getRepository: jest.Mock };
  let service: PurchaseService;

  const manager = {
    create: (_entity: unknown, data: Record<string, unknown>) => ({ ...data }),
    save: async (entity: unknown, data: Record<string, unknown>) => {
      if (entity === Purchase) purchases.push(data);
      if (entity === User) users.push(data);
      if (entity === OutboxEvent) outboxEvents.push(data);
      return data;
    },
  };

  beforeEach(() => {
    purchases = [];
    users = [];
    outboxEvents = [];
    publishMany = jest.fn().mockResolvedValue(undefined);

    transactionImpl = async (cb) => {
      await cb(manager);
    };

    dataSource = {
      transaction: jest.fn((cb) => transactionImpl(cb)),
      getRepository: jest.fn(() => ({
        findOne: async ({ where }: { where: { idempotencyKey: string } }) =>
          purchases.find((purchase) => purchase.idempotencyKey === where.idempotencyKey) ?? null,
      })),
    };

    service = new PurchaseService(dataSource as never, { publishMany } as never);
  });

  it('creates a purchase, persists a single outbox event and publishes it', async () => {
    const result = await service.createPurchase(dto, 'corr_1');

    expect(purchases).toHaveLength(1);
    expect(users).toHaveLength(1);
    expect(outboxEvents).toHaveLength(1);
    expect(result.purchaseId).toBe(purchases[0].id);
    expect(publishMany).toHaveBeenCalledTimes(1);
    expect(publishMany).toHaveBeenCalledWith([outboxEvents[0].id]);
  });

  it('does not set an idempotencyKey when none is supplied (backward compatible)', async () => {
    await service.createPurchase(dto, 'corr_1');

    expect(purchases[0].idempotencyKey).toBeUndefined();
  });

  describe('idempotency key short-circuit', () => {
    it('returns the original purchaseId and does not create a duplicate row or event on a repeat submission', async () => {
      const first = await service.createPurchase(dto, 'corr_1', 'idem_key_1');
      const second = await service.createPurchase(dto, 'corr_2', 'idem_key_1');

      expect(second.purchaseId).toBe(first.purchaseId);
      expect(purchases).toHaveLength(1);
      expect(outboxEvents).toHaveLength(1);
      expect(publishMany).toHaveBeenCalledTimes(1);
    });

    it('allows two different idempotency keys to create two separate purchases', async () => {
      const first = await service.createPurchase(dto, 'corr_1', 'idem_key_1');
      const second = await service.createPurchase(dto, 'corr_2', 'idem_key_2');

      expect(second.purchaseId).not.toBe(first.purchaseId);
      expect(purchases).toHaveLength(2);
      expect(outboxEvents).toHaveLength(2);
      expect(publishMany).toHaveBeenCalledTimes(2);
    });

    it('falls back to the existing purchase when a concurrent retry loses the pre-check race and hits the unique constraint', async () => {
      // Simulate a losing concurrent transaction: the pre-check found nothing, but by the time this
      // transaction commits, another request already inserted the row for this idempotency key.
      const winningPurchase = { id: 'pur_winner', idempotencyKey: 'idem_race' };
      purchases.push(winningPurchase);

      dataSource.transaction.mockImplementationOnce(async () => {
        throw new QueryFailedError('insert', [], { code: '23505', message: 'duplicate key' } as never);
      });

      const result = await service.createPurchase(dto, 'corr_1', 'idem_race');

      expect(result.purchaseId).toBe('pur_winner');
      expect(publishMany).not.toHaveBeenCalled();
    });

    it('re-throws non-unique-violation errors even when an idempotency key is supplied', async () => {
      dataSource.transaction.mockImplementationOnce(async () => {
        throw new Error('boom');
      });

      await expect(service.createPurchase(dto, 'corr_1', 'idem_other')).rejects.toThrow('boom');
    });
  });
});
