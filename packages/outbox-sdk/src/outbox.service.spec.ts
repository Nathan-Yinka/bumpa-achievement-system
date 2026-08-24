import { OutboxStatus } from '@bumpa/events-sdk';
import type { BrokerService } from '@bumpa/broker-sdk';
import type { DataSource } from 'typeorm';
import { OutboxService } from './outbox.service';
import type { OutboxRecord, ResolvedOutboxModuleOptions } from './outbox.types';

function createRecord(overrides: Partial<OutboxRecord> = {}): OutboxRecord {
  return {
    id: 'evt_1',
    payload: { type: 'Test.v1' } as unknown as OutboxRecord['payload'],
    status: OutboxStatus.Pending,
    attempts: 0,
    createdAt: new Date(),
    ...overrides,
  } as OutboxRecord;
}

/**
 * A tiny fake TypeORM repository that models the atomic "claim" semantics we
 * depend on: `createQueryBuilder().update().set(...).where(...).andWhere(...)
 * .execute()` only reports rows affected when the row's current status still
 * matches the WHERE clause (i.e. it hasn't already been claimed).
 */
function createFakeRepository(initial: OutboxRecord[]) {
  const rows = new Map<string, OutboxRecord>(initial.map((row) => [row.id, { ...row }]));

  const repository = {
    rows,
    findOne: jest.fn(async ({ where }: { where: { id: string } }) => {
      const row = rows.get(where.id);
      return row ? { ...row } : null;
    }),
    find: jest.fn(async ({ where, take }: { where: { status: OutboxStatus }; take?: number }) => {
      const matches = Array.from(rows.values())
        .filter((row) => row.status === where.status)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      return take ? matches.slice(0, take) : matches;
    }),
    save: jest.fn(async (event: OutboxRecord) => {
      rows.set(event.id, { ...event });
      return event;
    }),
    createQueryBuilder: jest.fn(() => {
      let claimId: string | undefined;
      let requiredStatus: OutboxStatus | undefined;
      let nextStatus: OutboxStatus | undefined;

      interface FakeUpdateBuilder {
        update: () => FakeUpdateBuilder;
        set: (partial: { status: OutboxStatus }) => FakeUpdateBuilder;
        where: (clause: string, params: { id: string }) => FakeUpdateBuilder;
        andWhere: (clause: string, params: { pending: OutboxStatus }) => FakeUpdateBuilder;
        execute: () => Promise<{ affected: number }>;
      }

      const builder: FakeUpdateBuilder = {
        update: jest.fn((): FakeUpdateBuilder => builder),
        set: jest.fn((partial: { status: OutboxStatus }): FakeUpdateBuilder => {
          nextStatus = partial.status;
          return builder;
        }),
        where: jest.fn((_clause: string, params: { id: string }): FakeUpdateBuilder => {
          claimId = params.id;
          return builder;
        }),
        andWhere: jest.fn((_clause: string, params: { pending: OutboxStatus }): FakeUpdateBuilder => {
          requiredStatus = params.pending;
          return builder;
        }),
        execute: jest.fn(async () => {
          const row = claimId ? rows.get(claimId) : undefined;
          if (row && requiredStatus !== undefined && row.status === requiredStatus && nextStatus !== undefined) {
            rows.set(row.id, { ...row, status: nextStatus });
            return { affected: 1 };
          }
          return { affected: 0 };
        }),
      };

      return builder;
    }),
  };

  return repository;
}

function createService(
  repository: ReturnType<typeof createFakeRepository>,
  brokerService: Pick<BrokerService, 'publish'>,
  optionsOverride: Partial<ResolvedOutboxModuleOptions> = {},
): OutboxService {
  const options: ResolvedOutboxModuleOptions = {
    entity: class {} as never,
    lockKey: 'outbox:test',
    redis: { host: 'localhost', port: 6379 },
    batchSize: 20,
    maxAttempts: 5,
    lockTtlMs: 5000,
    pollIntervalMs: 30000,
    ...optionsOverride,
  };

  const dataSource = {
    getRepository: jest.fn(() => repository),
  } as unknown as DataSource;

  const service = new OutboxService(options, dataSource, brokerService as BrokerService);
  service.onModuleInit();
  return service;
}

describe('OutboxService', () => {
  describe('publishRecord success path (via publishById)', () => {
    it('marks the row Published and sets publishedAt on success', async () => {
      const record = createRecord();
      const repository = createFakeRepository([record]);
      const publish = jest.fn().mockResolvedValue(undefined);
      const service = createService(repository, { publish });

      const result = await service.publishById(record.id);

      expect(result).toBe(true);
      expect(publish).toHaveBeenCalledWith(record.payload);
      const saved = repository.rows.get(record.id)!;
      expect(saved.status).toBe(OutboxStatus.Published);
      expect(saved.publishedAt).toBeInstanceOf(Date);
      expect(saved.lastError).toBeUndefined();
    });
  });

  describe('publishRecord failure path', () => {
    it('increments attempts and keeps status Pending below maxAttempts', async () => {
      const record = createRecord({ attempts: 0 });
      const repository = createFakeRepository([record]);
      const publish = jest.fn().mockRejectedValue(new Error('broker unavailable'));
      const service = createService(repository, { publish }, { maxAttempts: 5 });

      const result = await service.publishById(record.id);

      expect(result).toBe(false);
      const saved = repository.rows.get(record.id)!;
      expect(saved.attempts).toBe(1);
      expect(saved.status).toBe(OutboxStatus.Pending);
      expect(saved.lastError).toBe('broker unavailable');
    });

    it('transitions to Failed exactly when attempts reaches maxAttempts', async () => {
      const record = createRecord({ attempts: 4 });
      const repository = createFakeRepository([record]);
      const publish = jest.fn().mockRejectedValue(new Error('still down'));
      const service = createService(repository, { publish }, { maxAttempts: 5 });

      const result = await service.publishById(record.id);

      expect(result).toBe(false);
      const saved = repository.rows.get(record.id)!;
      expect(saved.attempts).toBe(5);
      expect(saved.status).toBe(OutboxStatus.Failed);
      expect(saved.lastError).toBe('still down');
    });
  });

  describe('claim-before-publish', () => {
    it('is a no-op via publishById for a row that is already Published', async () => {
      const record = createRecord({ status: OutboxStatus.Published, publishedAt: new Date() });
      const repository = createFakeRepository([record]);
      const publish = jest.fn();
      const service = createService(repository, { publish });

      const result = await service.publishById(record.id);

      expect(result).toBe(false);
      expect(publish).not.toHaveBeenCalled();
    });

    it('is a no-op via publishById for a row that has exhausted maxAttempts', async () => {
      const record = createRecord({ status: OutboxStatus.Failed, attempts: 5 });
      const repository = createFakeRepository([record]);
      const publish = jest.fn();
      const service = createService(repository, { publish }, { maxAttempts: 5 });

      const result = await service.publishById(record.id);

      expect(result).toBe(false);
      expect(publish).not.toHaveBeenCalled();
    });

    it('only lets one of two concurrent claim attempts on the same row publish', async () => {
      const record = createRecord();
      const repository = createFakeRepository([record]);
      const publish = jest.fn().mockResolvedValue(undefined);
      const service = createService(repository, { publish });

      const [first, second] = await Promise.all([
        service.publishById(record.id),
        service.publishById(record.id),
      ]);

      // Exactly one of the two concurrent attempts should have won the claim and
      // actually published; the other must short-circuit as a no-op.
      expect([first, second].filter(Boolean)).toHaveLength(1);
      expect(publish).toHaveBeenCalledTimes(1);
    });

    it('lets the scheduled poller publish a row that was not concurrently claimed', async () => {
      const record = createRecord();
      const repository = createFakeRepository([record]);
      const publish = jest.fn().mockResolvedValue(undefined);
      const service = createService(repository, { publish });

      await service.publishPendingBatch();

      expect(publish).toHaveBeenCalledTimes(1);
      expect(repository.rows.get(record.id)!.status).toBe(OutboxStatus.Published);
    });

    it('excludes a row from publishPendingBatch once it has been claimed elsewhere', async () => {
      const claimedElsewhere = createRecord({ id: 'evt_claimed' });
      const stillPending = createRecord({ id: 'evt_pending' });
      const repository = createFakeRepository([claimedElsewhere, stillPending]);
      // Simulate publishById having already won the atomic claim on `evt_claimed`
      // (flipped its status away from Pending) moments before the poller runs.
      repository.rows.set('evt_claimed', {
        ...repository.rows.get('evt_claimed')!,
        status: 'PUBLISHING' as OutboxStatus,
      });

      const publish = jest.fn().mockResolvedValue(undefined);
      const service = createService(repository, { publish });

      await service.publishPendingBatch();

      expect(publish).toHaveBeenCalledTimes(1);
      expect(publish).toHaveBeenCalledWith(stillPending.payload);
      expect(repository.rows.get('evt_pending')!.status).toBe(OutboxStatus.Published);
    });
  });

  describe('publishPendingBatch batching/ordering', () => {
    it('publishes pending rows honoring batchSize and createdAt ASC ordering', async () => {
      const older = createRecord({ id: 'evt_older', createdAt: new Date('2026-01-01T00:00:00Z') });
      const newer = createRecord({ id: 'evt_newer', createdAt: new Date('2026-01-02T00:00:00Z') });
      const extra = createRecord({ id: 'evt_extra', createdAt: new Date('2026-01-03T00:00:00Z') });
      const repository = createFakeRepository([newer, extra, older]);
      const publishOrder: string[] = [];
      const publish = jest.fn().mockImplementation(async (payload: { type: string }) => {
        publishOrder.push(payload.type);
      });
      const service = createService(repository, { publish }, { batchSize: 2 });

      await service.publishPendingBatch();

      expect(publish).toHaveBeenCalledTimes(2);
      // older and newer should be picked (batchSize=2, oldest first); extra is skipped.
      expect(repository.rows.get('evt_older')!.status).toBe(OutboxStatus.Published);
      expect(repository.rows.get('evt_newer')!.status).toBe(OutboxStatus.Published);
      expect(repository.rows.get('evt_extra')!.status).toBe(OutboxStatus.Pending);
    });
  });

  describe('publishMany', () => {
    it('delegates to publishById for each id', async () => {
      const first = createRecord({ id: 'evt_a' });
      const second = createRecord({ id: 'evt_b' });
      const repository = createFakeRepository([first, second]);
      const publish = jest.fn().mockResolvedValue(undefined);
      const service = createService(repository, { publish });

      await service.publishMany(['evt_a', 'evt_b']);

      expect(publish).toHaveBeenCalledTimes(2);
      expect(repository.rows.get('evt_a')!.status).toBe(OutboxStatus.Published);
      expect(repository.rows.get('evt_b')!.status).toBe(OutboxStatus.Published);
    });
  });
});
