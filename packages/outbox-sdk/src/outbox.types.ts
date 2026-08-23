import type { BumpaDomainEvent, OutboxStatus } from '@bumpa/events-sdk';
import type { EntityTarget, ObjectLiteral } from 'typeorm';

export interface OutboxRecord extends ObjectLiteral {
  id: string;
  payload: BumpaDomainEvent;
  status: OutboxStatus;
  attempts: number;
  lastError?: string;
  createdAt: Date;
  publishedAt?: Date;
}

export interface OutboxModuleOptions {
  entity: EntityTarget<OutboxRecord>;
  lockKey: string;
  redis: RedisConnectionOptions;
  batchSize?: number;
  maxAttempts?: number;
  lockTtlMs?: number;
  pollIntervalMs?: number;
}

export interface RedisConnectionOptions {
  host: string;
  port: number;
}

export interface ResolvedOutboxModuleOptions extends OutboxModuleOptions {
  batchSize: number;
  maxAttempts: number;
  lockTtlMs: number;
  pollIntervalMs: number;
}
