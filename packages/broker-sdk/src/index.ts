import { DynamicModule, Global, Inject, Injectable, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { getRabbitMqConfig } from '@bumpa/config-sdk';
import type { DomainEvent } from '@bumpa/events-sdk';
import * as amqp from 'amqplib';

export enum BrokerExchange {
  Events = 'bumpa.events',
  DeadLetter = 'bumpa.events.dlx',
}

export interface BrokerModuleOptions {
  serviceName: string;
}

export interface BrokerSubscriptionOptions<TEvent extends DomainEvent = DomainEvent> {
  queue: string;
  routingKey: TEvent['type'];
  handler: (event: TEvent) => Promise<void>;
}

export const BROKER_MODULE_OPTIONS = Symbol('BROKER_MODULE_OPTIONS');

@Global()
@Module({})
export class BrokerModule {
  static forRoot(options: BrokerModuleOptions): DynamicModule {
    return {
      module: BrokerModule,
      providers: [
        {
          provide: BROKER_MODULE_OPTIONS,
          useValue: options,
        },
        BrokerService,
      ],
      exports: [BrokerService],
    };
  }
}

@Injectable()
export class BrokerService implements OnModuleInit, OnModuleDestroy {
  private connection?: amqp.ChannelModel;
  private channel?: amqp.Channel;

  constructor(@Inject(BROKER_MODULE_OPTIONS) private readonly options: BrokerModuleOptions) {}

  async onModuleInit(): Promise<void> {
    this.connection = await amqp.connect(getRabbitMqConfig());
    this.channel = await this.connection.createChannel();
    await this.channel.assertExchange(BrokerExchange.Events, 'topic', { durable: true });
    await this.channel.assertExchange(BrokerExchange.DeadLetter, 'topic', { durable: true });
  }

  async onModuleDestroy(): Promise<void> {
    await this.channel?.close();
    await this.connection?.close();
  }

  async publish(event: DomainEvent): Promise<void> {
    const channel = this.getChannel();
    channel.publish(BrokerExchange.Events, event.type, Buffer.from(JSON.stringify(event)), {
      contentType: 'application/json',
      correlationId: event.correlationId,
      messageId: event.eventId,
      persistent: true,
      appId: this.options.serviceName,
    });
  }

  async subscribe<TEvent extends DomainEvent>(options: BrokerSubscriptionOptions<TEvent>): Promise<void> {
    const channel = this.getChannel();
    await channel.assertQueue(`${options.queue}.dlq`, { durable: true });
    await channel.bindQueue(`${options.queue}.dlq`, BrokerExchange.DeadLetter, options.routingKey);
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
      void this.handleMessage(message, options.handler);
    });
  }

  private async handleMessage<TEvent extends DomainEvent>(
    message: amqp.ConsumeMessage | null,
    handler: (event: TEvent) => Promise<void>,
  ): Promise<void> {
    const channel = this.getChannel();
    if (!message) {
      return;
    }

    try {
      const event = JSON.parse(message.content.toString('utf8')) as TEvent;
      await handler(event);
      channel.ack(message);
    } catch {
      channel.nack(message, false, false);
    }
  }

  private getChannel(): amqp.Channel {
    if (!this.channel) {
      throw new Error('RabbitMQ channel is not initialized');
    }

    return this.channel;
  }
}
