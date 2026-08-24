import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { DomainEvent } from '@bumpa/events-sdk';
import * as amqp from 'amqplib';
import { BrokerExchange, BROKER_MODULE_OPTIONS } from './broker.constants';
import type { BrokerModuleOptions, BrokerSubscriptionOptions } from './broker.types';

// Reconnect backoff bounds: start at 1s, double each failed attempt, cap at 30s.
const INITIAL_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 30000;

// Escalating-backoff retry via a RabbitMQ retry queue (not an in-process timer), so retry state
// survives a process crash or reconnect: start at 1s, double each attempt, cap at 30s, give up
// and dead-letter permanently after 5 attempts.
const MAX_RETRY_ATTEMPTS = 5;
const RETRY_BASE_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 30000;
const RETRY_COUNT_HEADER = 'x-bumpa-retry-count';

@Injectable()
export class BrokerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BrokerService.name);
  private connection?: amqp.ChannelModel;
  private channel?: amqp.ConfirmChannel;
  // Subscriptions registered via subscribe(), replayed after a reconnect.
  private readonly subscriptions: BrokerSubscriptionOptions<any>[] = [];
  private shuttingDown = false;
  private reconnecting = false;
  private reconnectAttempt = 0;
  private reconnectTimer?: NodeJS.Timeout;

  constructor(@Inject(BROKER_MODULE_OPTIONS) private readonly options: BrokerModuleOptions) {}

  async onModuleInit(): Promise<void> {
    // Fails fast if RabbitMQ is unreachable on boot; disconnects after that reconnect instead.
    await this.connectAndSetup();
  }

  async onModuleDestroy(): Promise<void> {
    this.shuttingDown = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    await this.channel?.close().catch(() => undefined);
    await this.connection?.close().catch(() => undefined);
  }

  async publish(event: DomainEvent): Promise<void> {
    const channel = this.getChannel();
    // Confirm channels make outbox publishing depend on RabbitMQ accepting the message.
    await new Promise<void>((resolve, reject) => {
      channel.publish(
        BrokerExchange.Events,
        event.type,
        Buffer.from(JSON.stringify(event)),
        {
          contentType: 'application/json',
          correlationId: event.correlationId,
          messageId: event.eventId,
          persistent: true,
          appId: this.options.serviceName,
        },
        (error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        },
      );
    });
  }

  async subscribe<TEvent extends DomainEvent>(options: BrokerSubscriptionOptions<TEvent>): Promise<void> {
    this.subscriptions.push(options as BrokerSubscriptionOptions<any>);
    await this.bindAndConsume(options);
  }

  /** Declares a subscription's queues and starts consuming. Used on connect and on reconnect. */
  private async bindAndConsume<TEvent extends DomainEvent>(
    options: BrokerSubscriptionOptions<TEvent>,
  ): Promise<void> {
    const channel = this.getChannel();
    await channel.assertQueue(`${options.queue}.dlq`, { durable: true });
    await channel.bindQueue(`${options.queue}.dlq`, BrokerExchange.DeadLetter, options.routingKey);

    // Holds a failed message for an escalating delay, then dead-letters it straight back into
    // the original queue (via the default exchange, routing by queue name) for redelivery.
    await channel.assertQueue(`${options.queue}.retry`, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': '',
        'x-dead-letter-routing-key': options.queue,
      },
    });

    await channel.assertQueue(options.queue, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': BrokerExchange.DeadLetter,
        'x-dead-letter-routing-key': options.routingKey,
      },
    });
    await channel.bindQueue(options.queue, BrokerExchange.Events, options.routingKey);
    await channel.prefetch(10);
    await channel.consume(options.queue, (message) => {
      void this.handleMessage(message, options.queue, options.handler);
    });
  }

  private async handleMessage<TEvent extends DomainEvent>(
    message: amqp.ConsumeMessage | null,
    queue: string,
    handler: (event: TEvent) => Promise<void>,
  ): Promise<void> {
    if (!message) {
      return;
    }

    let event: TEvent;
    try {
      event = JSON.parse(message.content.toString('utf8')) as TEvent;
    } catch (error) {
      // Malformed payload, retrying won't help — dead-letter it now.
      this.logger.error(
        'Failed to parse message payload, dead-lettering',
        error instanceof Error ? error.stack : String(error),
      );
      this.safeNack(message);
      return;
    }

    try {
      await handler(event);
      this.safeAck(message);
    } catch (error) {
      const retryCount = this.readRetryCount(message);
      const routingKey = message.fields.routingKey;
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (retryCount >= MAX_RETRY_ATTEMPTS) {
        this.logger.warn(
          `Handler failed on final attempt (${retryCount}/${MAX_RETRY_ATTEMPTS}) for routing key "${routingKey}", dead-lettering: ${errorMessage}`,
        );
        this.safeNack(message);
        return;
      }

      const delayMs = Math.min(RETRY_BASE_DELAY_MS * 2 ** retryCount, MAX_RETRY_DELAY_MS);
      this.logger.warn(
        `Handler failed on attempt ${retryCount + 1}/${MAX_RETRY_ATTEMPTS} for routing key "${routingKey}", retrying in ${delayMs}ms: ${errorMessage}`,
      );

      if (this.scheduleRedelivery(queue, message, retryCount + 1, delayMs)) {
        this.safeAck(message);
      } else {
        this.safeNack(message);
      }
    }
  }

  /** Republishes a message to the retry queue with an escalating TTL. Returns whether it was scheduled. */
  private scheduleRedelivery(
    queue: string,
    message: amqp.ConsumeMessage,
    nextRetryCount: number,
    delayMs: number,
  ): boolean {
    try {
      this.getChannel().sendToQueue(`${queue}.retry`, message.content, {
        ...message.properties,
        expiration: String(delayMs),
        headers: { ...(message.properties.headers ?? {}), [RETRY_COUNT_HEADER]: nextRetryCount },
      });
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to schedule a retry for routing key "${message.fields.routingKey}", dead-lettering instead: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  private readRetryCount(message: amqp.ConsumeMessage): number {
    const raw = message.properties.headers?.[RETRY_COUNT_HEADER] as unknown;
    return typeof raw === 'number' ? raw : 0;
  }

  private safeAck(message: amqp.ConsumeMessage): void {
    try {
      this.getChannel().ack(message);
    } catch (error) {
      // The channel may already be gone if a reconnect is underway.
      this.logger.warn(`Failed to ack message: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private safeNack(message: amqp.ConsumeMessage): void {
    try {
      this.getChannel().nack(message, false, false);
    } catch (error) {
      this.logger.warn(`Failed to nack message: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** Connects to RabbitMQ, declares the shared exchanges, and re-registers existing subscriptions. */
  private async connectAndSetup(): Promise<void> {
    const connection = await amqp.connect(this.options.connection);
    const channel = await connection.createConfirmChannel();
    await channel.assertExchange(BrokerExchange.Events, 'topic', { durable: true });
    await channel.assertExchange(BrokerExchange.DeadLetter, 'topic', { durable: true });

    connection.on('error', (error) => this.handleConnectionIssue('connection error', error));
    connection.on('close', () => this.handleConnectionIssue('connection closed'));
    channel.on('error', (error) => this.handleConnectionIssue('channel error', error));
    channel.on('close', () => this.handleConnectionIssue('channel closed'));

    this.connection = connection;
    this.channel = channel;

    for (const subscription of this.subscriptions) {
      await this.bindAndConsume(subscription);
    }

    this.reconnectAttempt = 0;
  }

  private handleConnectionIssue(reason: string, error?: unknown): void {
    if (this.shuttingDown) {
      return;
    }

    // Clear the stale references so calls fail fast instead of hitting a dead socket.
    this.channel = undefined;
    this.connection = undefined;

    this.logger.error(
      `RabbitMQ ${reason} — scheduling reconnect`,
      error instanceof Error ? error.stack : error !== undefined ? String(error) : undefined,
    );
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.reconnecting || this.shuttingDown) {
      return;
    }

    this.reconnecting = true;
    const delayMs = Math.min(
      INITIAL_RECONNECT_DELAY_MS * 2 ** this.reconnectAttempt,
      MAX_RECONNECT_DELAY_MS,
    );
    this.reconnectAttempt += 1;

    this.reconnectTimer = setTimeout(() => {
      if (this.shuttingDown) {
        this.reconnecting = false;
        return;
      }

      void this.connectAndSetup()
        .catch((error) => {
          this.logger.error(
            'RabbitMQ reconnect attempt failed',
            error instanceof Error ? error.stack : String(error),
          );
        })
        .finally(() => {
          this.reconnecting = false;
          if (!this.channel && !this.shuttingDown) {
            this.scheduleReconnect();
          }
        });
    }, delayMs);
  }

  private getChannel(): amqp.ConfirmChannel {
    if (!this.channel) {
      throw new Error('RabbitMQ channel is not initialized');
    }

    return this.channel;
  }
}
