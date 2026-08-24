import { ScheduledOutboxPublisher } from './scheduled-outbox.publisher';
import type { OutboxService } from './outbox.service';
import type { ResolvedOutboxModuleOptions } from './outbox.types';

const redisInstances: FakeRedis[] = [];

class FakeRedis {
  public store = new Map<string, string>();
  public setCalls: unknown[][] = [];
  public evalCalls: unknown[][] = [];
  private expireHandledByEval = new Map<string, boolean>();

  constructor() {
    redisInstances.push(this);
  }

  async set(key: string, value: string, ..._rest: unknown[]): Promise<string | null> {
    this.setCalls.push([key, value, ..._rest]);
    if (this.store.has(key)) {
      return null;
    }
    this.store.set(key, value);
    return 'OK';
  }

  async eval(script: string, _numKeys: number, key: string, ...args: unknown[]): Promise<number> {
    this.evalCalls.push([key, ...args]);
    const current = this.store.get(key);
    const expectedValue = args[0];
    if (current !== expectedValue) {
      return 0;
    }

    if (script.includes('DEL')) {
      this.store.delete(key);
      return 1;
    }

    // PEXPIRE branch; TTL renewal is a no-op for this fake.
    return 1;
  }

  async quit(): Promise<void> {
    this.store.clear();
  }
}

jest.mock('ioredis', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => new FakeRedis()),
  };
});

function createOptions(overrides: Partial<ResolvedOutboxModuleOptions> = {}): ResolvedOutboxModuleOptions {
  return {
    entity: class {} as never,
    lockKey: 'outbox:test-lock',
    redis: { host: 'localhost', port: 6379 },
    batchSize: 20,
    maxAttempts: 5,
    lockTtlMs: 1000,
    pollIntervalMs: 30000,
    ...overrides,
  };
}

describe('ScheduledOutboxPublisher', () => {
  beforeEach(() => {
    redisInstances.length = 0;
    jest.useFakeTimers();
  });

  afterEach(async () => {
    jest.useRealTimers();
  });

  function currentRedis(): FakeRedis {
    expect(redisInstances).toHaveLength(1);
    return redisInstances[0];
  }

  it('acquires the lock and delegates to publishPendingBatch', async () => {
    const outboxService = { publishPendingBatch: jest.fn().mockResolvedValue(undefined) } as unknown as OutboxService;
    const publisher = new ScheduledOutboxPublisher(createOptions(), outboxService);
    publisher.onModuleInit();

    await publisher.publishPending();

    expect(outboxService.publishPendingBatch).toHaveBeenCalledTimes(1);
    // Lock should be released after the batch completes.
    expect(currentRedis().store.has('outbox:test-lock')).toBe(false);

    await publisher.onModuleDestroy();
  });

  it('does not run a batch if the lock is already held', async () => {
    const outboxService = { publishPendingBatch: jest.fn().mockResolvedValue(undefined) } as unknown as OutboxService;
    const publisher = new ScheduledOutboxPublisher(createOptions(), outboxService);
    publisher.onModuleInit();
    currentRedis().store.set('outbox:test-lock', 'someone-else');

    await publisher.publishPending();

    expect(outboxService.publishPendingBatch).not.toHaveBeenCalled();

    await publisher.onModuleDestroy();
  });

  it('renews (heartbeats) the lock while a long-running batch is in flight', async () => {
    const lockTtlMs = 1000;
    let resolveBatch: () => void = () => undefined;
    const outboxService = {
      publishPendingBatch: jest.fn().mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveBatch = resolve;
          }),
      ),
    } as unknown as OutboxService;
    const publisher = new ScheduledOutboxPublisher(createOptions({ lockTtlMs }), outboxService);
    publisher.onModuleInit();

    const publishPendingPromise = publisher.publishPending();
    // Let the lock-acquire microtasks settle.
    await Promise.resolve();
    await Promise.resolve();

    const redis = currentRedis();
    const evalCallsBefore = redis.evalCalls.length;

    // Advance past several heartbeat intervals.
    await jest.advanceTimersByTimeAsync(lockTtlMs * 3);

    expect(redis.evalCalls.length).toBeGreaterThan(evalCallsBefore);
    // The heartbeat keeps the lock present.
    expect(redis.store.has('outbox:test-lock')).toBe(true);

    resolveBatch();
    await publishPendingPromise;

    // Once the batch completes, the heartbeat must stop and the lock is released.
    expect(redis.store.has('outbox:test-lock')).toBe(false);

    await publisher.onModuleDestroy();
  });

  it('does not throw when the lock was already lost before a renewal tick fires', async () => {
    const lockTtlMs = 1000;
    let resolveBatch: () => void = () => undefined;
    const outboxService = {
      publishPendingBatch: jest.fn().mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveBatch = resolve;
          }),
      ),
    } as unknown as OutboxService;
    const publisher = new ScheduledOutboxPublisher(createOptions({ lockTtlMs }), outboxService);
    publisher.onModuleInit();

    const publishPendingPromise = publisher.publishPending();
    await Promise.resolve();
    await Promise.resolve();

    const redis = currentRedis();
    // Simulate the lock being lost (e.g. expired and reassigned) out from under us.
    redis.store.set('outbox:test-lock', 'someone-else');

    // Should not throw / reject despite the lock no longer being ours.
    await expect(jest.advanceTimersByTimeAsync(lockTtlMs * 2)).resolves.toBeUndefined();

    resolveBatch();
    await publishPendingPromise;

    await publisher.onModuleDestroy();
  });
});
