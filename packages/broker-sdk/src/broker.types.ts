import type { DomainEvent } from '@bumpa/events-sdk';

export interface BrokerModuleOptions {
  serviceName: string;
  connection: BrokerConnectionOptions;
}

export interface BrokerConnectionOptions {
  protocol: 'amqp';
  hostname: string;
  port: number;
  username: string;
  password: string;
}

export interface BrokerSubscriptionOptions<TEvent extends DomainEvent = DomainEvent> {
  queue: string;
  routingKey: TEvent['type'];
  handler: (event: TEvent) => Promise<void>;
}
