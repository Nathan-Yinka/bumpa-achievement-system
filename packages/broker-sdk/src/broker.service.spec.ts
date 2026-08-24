import { EventEmitter } from 'events';
import { BrokerExchange } from './broker.constants';
import type { BrokerModuleOptions } from './broker.types';

class FakeChannel extends EventEmitter {
  public publish = jest.fn();
  public sendToQueue = jest.fn();
  public assertExchange = jest.fn().mockResolvedValue(undefined);
  public assertQueue = jest.fn().mockResolvedValue(undefined);
  public bindQueue = jest.fn().mockResolvedValue(undefined);
  public prefetch = jest.fn().mockResolvedValue(undefined);
  public consume = jest.fn().mockResolvedValue(undefined);
  public ack = jest.fn();
  public nack = jest.fn();
  public close = jest.fn().mockResolvedValue(undefined);
}

class FakeConnection extends EventEmitter {
  public createConfirmChannel = jest.fn();
  public close = jest.fn().mockResolvedValue(undefined);
}

const connectMock = jest.fn();

jest.mock('amqplib', () => ({
  __esModule: true,
  connect: (...args: unknown[]) => connectMock(...args),
}));

// Imported after the mock so BrokerService picks up the mocked amqplib module.
import { BrokerService } from './broker.service';

function makeOptions(): BrokerModuleOptions {
  return {
    serviceName: 'test-service',
    connection: { protocol: 'amqp', hostname: 'localhost', port: 5672, username: 'guest', password: 'guest' },
  };
}

describe('BrokerService', () => {
  let connections: FakeConnection[];
  let channels: FakeChannel[];

  beforeEach(() => {
    jest.useFakeTimers();
    connections = [];
    channels = [];
    connectMock.mockReset();
    connectMock.mockImplementation(async () => {
      const connection = new FakeConnection();
      const channel = new FakeChannel();
      connection.createConfirmChannel.mockResolvedValue(channel);
      connections.push(connection);
      channels.push(channel);
      return connection;
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  async function initService(): Promise<BrokerService> {
    const service = new BrokerService(makeOptions());
    await service.onModuleInit();
    return service;
  }

  describe('publish', () => {
    it('resolves once the confirm channel invokes its callback without an error', async () => {
      const service = await initService();
      const channel = channels[0];
      channel.publish.mockImplementation((_exchange, _routingKey, _content, _options, callback) => {
        callback(null);
      });

      await expect(
        service.publish({ type: 'Test.v1', eventId: 'evt_1', correlationId: 'corr_1' } as never),
      ).resolves.toBeUndefined();

      expect(channel.publish).toHaveBeenCalledWith(
        BrokerExchange.Events,
        'Test.v1',
        expect.any(Buffer),
        expect.objectContaining({ messageId: 'evt_1', correlationId: 'corr_1', persistent: true }),
        expect.any(Function),
      );
    });

    it('rejects when the confirm channel invokes its callback with an error', async () => {
      const service = await initService();
      const channel = channels[0];
      const failure = new Error('nack from broker');
      channel.publish.mockImplementation((_exchange, _routingKey, _content, _options, callback) => {
        callback(failure);
      });

      await expect(service.publish({ type: 'Test.v1', eventId: 'evt_1' } as never)).rejects.toThrow(
        'nack from broker',
      );
    });
  });

  describe('subscribe', () => {
    it('acks the message when the handler succeeds', async () => {
      const service = await initService();
      const channel = channels[0];
      const handler = jest.fn().mockResolvedValue(undefined);

      await service.subscribe({ queue: 'q1', routingKey: 'Test.v1' as never, handler });

      const consumeCallback = channel.consume.mock.calls[0][1];
      const message = { content: Buffer.from(JSON.stringify({ type: 'Test.v1' })), fields: { routingKey: 'Test.v1' } };

      await consumeCallback(message);

      expect(handler).toHaveBeenCalledWith({ type: 'Test.v1' });
      expect(channel.ack).toHaveBeenCalledWith(message);
      expect(channel.nack).not.toHaveBeenCalled();
    });

    it('schedules an escalating-backoff retry via the retry queue on handler failure', async () => {
      const service = await initService();
      const channel = channels[0];
      const handler = jest.fn().mockRejectedValue(new Error('handler exploded'));

      await service.subscribe({ queue: 'q1', routingKey: 'Test.v1' as never, handler });

      const consumeCallback = channel.consume.mock.calls[0][1];
      const message = {
        content: Buffer.from(JSON.stringify({ type: 'Test.v1' })),
        fields: { routingKey: 'Test.v1' },
        properties: { headers: {} },
      };

      await consumeCallback(message);

      expect(channel.sendToQueue).toHaveBeenCalledWith(
        'q1.retry',
        message.content,
        expect.objectContaining({ expiration: '1000', headers: expect.objectContaining({ 'x-bumpa-retry-count': 1 }) }),
      );
      expect(channel.ack).toHaveBeenCalledWith(message);
      expect(channel.nack).not.toHaveBeenCalled();
    });

    it('dead-letters (nacks, no requeue) once the retry budget is exhausted', async () => {
      const service = await initService();
      const channel = channels[0];
      const handler = jest.fn().mockRejectedValue(new Error('handler exploded'));

      await service.subscribe({ queue: 'q1', routingKey: 'Test.v1' as never, handler });
      const consumeCallback = channel.consume.mock.calls[0][1];
      const content = Buffer.from(JSON.stringify({ type: 'Test.v1' }));

      // Simulate the message failing and being redelivered by RabbitMQ from the retry queue,
      // each time carrying an incremented retry-count header, until the budget runs out.
      for (let retryCount = 0; retryCount < 5; retryCount += 1) {
        const message = { content, fields: { routingKey: 'Test.v1' }, properties: { headers: { 'x-bumpa-retry-count': retryCount } } };
        await consumeCallback(message);
      }

      expect(channel.nack).not.toHaveBeenCalled();

      const finalMessage = { content, fields: { routingKey: 'Test.v1' }, properties: { headers: { 'x-bumpa-retry-count': 5 } } };
      await consumeCallback(finalMessage);

      expect(handler).toHaveBeenCalledTimes(6);
      expect(channel.nack).toHaveBeenCalledWith(finalMessage, false, false);
    });

    it('recovers and acks if the handler succeeds on a later redelivery', async () => {
      const service = await initService();
      const channel = channels[0];
      const handler = jest
        .fn()
        .mockRejectedValueOnce(new Error('transient'))
        .mockResolvedValueOnce(undefined);

      await service.subscribe({ queue: 'q1', routingKey: 'Test.v1' as never, handler });
      const consumeCallback = channel.consume.mock.calls[0][1];
      const content = Buffer.from(JSON.stringify({ type: 'Test.v1' }));

      const firstMessage = { content, fields: { routingKey: 'Test.v1' }, properties: { headers: {} } };
      await consumeCallback(firstMessage);
      expect(channel.ack).toHaveBeenCalledWith(firstMessage);

      // The retry queue's TTL "expired" and RabbitMQ redelivered the message.
      const redeliveredMessage = { content, fields: { routingKey: 'Test.v1' }, properties: { headers: { 'x-bumpa-retry-count': 1 } } };
      await consumeCallback(redeliveredMessage);

      expect(handler).toHaveBeenCalledTimes(2);
      expect(channel.ack).toHaveBeenCalledWith(redeliveredMessage);
      expect(channel.nack).not.toHaveBeenCalled();
    });

    it('dead-letters immediately on malformed JSON without retrying the handler', async () => {
      const service = await initService();
      const channel = channels[0];
      const handler = jest.fn();

      await service.subscribe({ queue: 'q1', routingKey: 'Test.v1' as never, handler });

      const consumeCallback = channel.consume.mock.calls[0][1];
      const message = { content: Buffer.from('not json'), fields: { routingKey: 'Test.v1' } };

      await consumeCallback(message);

      expect(handler).not.toHaveBeenCalled();
      expect(channel.nack).toHaveBeenCalledWith(message, false, false);
    });
  });

  describe('reconnect logic', () => {
    it('reconnects with backoff after the channel emits close', async () => {
      const service = await initService();
      expect(connectMock).toHaveBeenCalledTimes(1);

      channels[0].emit('close');

      // First reconnect attempt is scheduled ~1s out.
      await jest.advanceTimersByTimeAsync(1000);

      expect(connectMock).toHaveBeenCalledTimes(2);

      await service.onModuleDestroy();
    });

    it('reconnects after the connection emits an error', async () => {
      const service = await initService();
      expect(connectMock).toHaveBeenCalledTimes(1);

      connections[0].emit('error', new Error('socket reset'));

      await jest.advanceTimersByTimeAsync(1000);

      expect(connectMock).toHaveBeenCalledTimes(2);

      await service.onModuleDestroy();
    });

    it('re-establishes previously registered subscriptions after reconnecting', async () => {
      const service = await initService();
      const handler = jest.fn();
      await service.subscribe({ queue: 'q1', routingKey: 'Test.v1' as never, handler });
      expect(channels[0].consume).toHaveBeenCalledTimes(1);

      channels[0].emit('close');
      await jest.advanceTimersByTimeAsync(1000);

      expect(channels).toHaveLength(2);
      expect(channels[1].assertQueue).toHaveBeenCalledWith('q1', expect.any(Object));
      expect(channels[1].consume).toHaveBeenCalledTimes(1);

      await service.onModuleDestroy();
    });

    it('does not attempt to reconnect after onModuleDestroy has been called', async () => {
      const service = await initService();
      await service.onModuleDestroy();

      channels[0].emit('close');
      await jest.advanceTimersByTimeAsync(60000);

      expect(connectMock).toHaveBeenCalledTimes(1);
    });

    it('keeps retrying with capped backoff if reconnect attempts keep failing', async () => {
      await initService();
      expect(connectMock).toHaveBeenCalledTimes(1);

      connectMock.mockImplementation(async () => {
        throw new Error('still unreachable');
      });

      channels[0].emit('close');

      await jest.advanceTimersByTimeAsync(1000); // 1st retry
      expect(connectMock).toHaveBeenCalledTimes(2);

      await jest.advanceTimersByTimeAsync(2000); // 2nd retry (backoff doubles)
      expect(connectMock).toHaveBeenCalledTimes(3);
    });
  });
});
