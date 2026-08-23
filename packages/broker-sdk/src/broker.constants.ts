export enum BrokerExchange {
  Events = 'bumpa.events',
  DeadLetter = 'bumpa.events.dlx',
}

export const BROKER_MODULE_OPTIONS = Symbol('BROKER_MODULE_OPTIONS');
