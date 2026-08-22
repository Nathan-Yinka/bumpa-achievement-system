import { z } from 'zod';

export enum EnvKey {
  NodeEnv = 'NODE_ENV',
  RabbitmqHost = 'RABBITMQ_HOST',
  RabbitmqPort = 'RABBITMQ_PORT',
  RabbitmqUser = 'RABBITMQ_USER',
  RabbitmqPassword = 'RABBITMQ_PASSWORD',
  RedisHost = 'REDIS_HOST',
  RedisPort = 'REDIS_PORT',
  ApiGatewayPort = 'API_GATEWAY_PORT',
  PurchaseServicePort = 'PURCHASE_SERVICE_PORT',
  LoyaltyServicePort = 'LOYALTY_SERVICE_PORT',
  CashbackServicePort = 'CASHBACK_SERVICE_PORT',
  PurchaseServiceHost = 'PURCHASE_SERVICE_HOST',
  LoyaltyServiceHost = 'LOYALTY_SERVICE_HOST',
  DatabaseHost = 'DATABASE_HOST',
  DatabasePort = 'DATABASE_PORT',
  DatabaseUser = 'DATABASE_USER',
  DatabasePassword = 'DATABASE_PASSWORD',
  PurchaseDatabaseName = 'PURCHASE_DATABASE_NAME',
  LoyaltyDatabaseName = 'LOYALTY_DATABASE_NAME',
  CashbackDatabaseName = 'CASHBACK_DATABASE_NAME',
  PaymentProvider = 'PAYMENT_PROVIDER',
  PaystackSecretKey = 'PAYSTACK_SECRET_KEY',
  CashbackAmountKobo = 'CASHBACK_AMOUNT_KOBO',
}

const baseSchema = z.object({
  [EnvKey.NodeEnv]: z.enum(['development', 'test', 'production']).default('development'),
  [EnvKey.RabbitmqHost]: z.string().min(1),
  [EnvKey.RabbitmqPort]: z.coerce.number().int().positive(),
  [EnvKey.RabbitmqUser]: z.string().min(1),
  [EnvKey.RabbitmqPassword]: z.string().min(1),
  [EnvKey.RedisHost]: z.string().min(1),
  [EnvKey.RedisPort]: z.coerce.number().int().positive(),
});

export type BaseConfig = z.infer<typeof baseSchema>;

export function loadBaseConfig(env: NodeJS.ProcessEnv = process.env): BaseConfig {
  return baseSchema.parse(env);
}

export function getRequiredEnv(name: string, env: NodeJS.ProcessEnv = process.env): string {
  const value = env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getNumberEnv(name: string, fallback: number, env: NodeJS.ProcessEnv = process.env): number {
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

export function getServiceBaseUrl(hostEnv: EnvKey, portEnv: EnvKey, fallbackHost: string, fallbackPort: number): string {
  const host = process.env[hostEnv] ?? fallbackHost;
  const port = getNumberEnv(portEnv, fallbackPort);
  return `http://${host}:${port}`;
}
