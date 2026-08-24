import { z } from 'zod';

export enum EnvKey {
  NodeEnv = 'NODE_ENV',
  RabbitmqHost = 'RABBITMQ_HOST',
  RabbitmqPort = 'RABBITMQ_PORT',
  RabbitmqUser = 'RABBITMQ_USER',
  RabbitmqPassword = 'RABBITMQ_PASSWORD',
  RedisHost = 'REDIS_HOST',
  RedisPort = 'REDIS_PORT',
  OutboxBatchSize = 'OUTBOX_BATCH_SIZE',
  OutboxMaxAttempts = 'OUTBOX_MAX_ATTEMPTS',
  OutboxLockTtlMs = 'OUTBOX_LOCK_TTL_MS',
  OutboxPollIntervalMs = 'OUTBOX_POLL_INTERVAL_MS',
  LoyaltyServicePort = 'LOYALTY_SERVICE_PORT',
  DatabaseHost = 'DATABASE_HOST',
  DatabasePort = 'DATABASE_PORT',
  DatabaseUser = 'DATABASE_USER',
  DatabasePassword = 'DATABASE_PASSWORD',
  LoyaltyDatabaseName = 'LOYALTY_DATABASE_NAME',
}

const envSchema = z.object({
  [EnvKey.NodeEnv]: z.enum(['development', 'test', 'production']).default('development'),
  [EnvKey.RabbitmqHost]: z.string().min(1),
  [EnvKey.RabbitmqPort]: z.coerce.number().int().positive().default(5672),
  [EnvKey.RabbitmqUser]: z.string().min(1),
  [EnvKey.RabbitmqPassword]: z.string().min(1),
  [EnvKey.RedisHost]: z.string().min(1),
  [EnvKey.RedisPort]: z.coerce.number().int().positive().default(6379),
  [EnvKey.OutboxBatchSize]: z.coerce.number().int().positive().default(20),
  [EnvKey.OutboxMaxAttempts]: z.coerce.number().int().positive().default(5),
  [EnvKey.OutboxLockTtlMs]: z.coerce.number().int().positive().default(5000),
  [EnvKey.OutboxPollIntervalMs]: z.coerce.number().int().positive().default(30000),
  [EnvKey.LoyaltyServicePort]: z.coerce.number().int().positive().default(3002),
  [EnvKey.DatabaseHost]: z.string().min(1),
  [EnvKey.DatabasePort]: z.coerce.number().int().positive().default(5432),
  [EnvKey.DatabaseUser]: z.string().min(1),
  [EnvKey.DatabasePassword]: z.string().min(1),
  [EnvKey.LoyaltyDatabaseName]: z.string().min(1),
});

export type ValidatedEnv = Record<string, string | number | undefined>;

export function validateEnv(env: NodeJS.ProcessEnv = process.env): void {
  envSchema.parse(env);
}

export function validateConfig(env: NodeJS.ProcessEnv): ValidatedEnv {
  return envSchema.parse(env);
}

export interface PostgresConnectionConfig {
  type: 'postgres';
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
}

export interface RabbitMqConnectionConfig {
  protocol: 'amqp';
  hostname: string;
  port: number;
  username: string;
  password: string;
}

export interface RedisConnectionConfig {
  host: string;
  port: number;
}

export interface OutboxRuntimeConfig {
  batchSize: number;
  maxAttempts: number;
  lockTtlMs: number;
  pollIntervalMs: number;
}

export function getRequiredEnv(name: EnvKey, env: NodeJS.ProcessEnv = process.env): string {
  validateEnv(env);
  const value = env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getNumberEnv(name: EnvKey, fallback: number, env: NodeJS.ProcessEnv = process.env): number {
  validateEnv(env);
  const raw = env[name];
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Environment variable ${name} must be numeric`);
  }

  return parsed;
}

export function getPostgresConfig(databaseNameEnv: EnvKey, env: NodeJS.ProcessEnv = process.env): PostgresConnectionConfig {
  return {
    type: 'postgres',
    host: getRequiredEnv(EnvKey.DatabaseHost, env),
    port: getNumberEnv(EnvKey.DatabasePort, 5432, env),
    username: getRequiredEnv(EnvKey.DatabaseUser, env),
    password: getRequiredEnv(EnvKey.DatabasePassword, env),
    database: getRequiredEnv(databaseNameEnv, env),
  };
}

export function getRabbitMqConfig(env: NodeJS.ProcessEnv = process.env): RabbitMqConnectionConfig {
  return {
    protocol: 'amqp',
    hostname: getRequiredEnv(EnvKey.RabbitmqHost, env),
    port: getNumberEnv(EnvKey.RabbitmqPort, 5672, env),
    username: getRequiredEnv(EnvKey.RabbitmqUser, env),
    password: getRequiredEnv(EnvKey.RabbitmqPassword, env),
  };
}

export function getRedisConfig(env: NodeJS.ProcessEnv = process.env): RedisConnectionConfig {
  return {
    host: getRequiredEnv(EnvKey.RedisHost, env),
    port: getNumberEnv(EnvKey.RedisPort, 6379, env),
  };
}

export function getOutboxRuntimeConfig(env: NodeJS.ProcessEnv = process.env): OutboxRuntimeConfig {
  return {
    batchSize: getNumberEnv(EnvKey.OutboxBatchSize, 20, env),
    maxAttempts: getNumberEnv(EnvKey.OutboxMaxAttempts, 5, env),
    lockTtlMs: getNumberEnv(EnvKey.OutboxLockTtlMs, 5000, env),
    pollIntervalMs: getNumberEnv(EnvKey.OutboxPollIntervalMs, 30000, env),
  };
}
