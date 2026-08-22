import { z } from 'zod';

export enum EnvKey {
  NodeEnv = 'NODE_ENV',
  RabbitmqUrl = 'RABBITMQ_URL',
  RedisUrl = 'REDIS_URL',
  ApiGatewayPort = 'API_GATEWAY_PORT',
  PurchaseServicePort = 'PURCHASE_SERVICE_PORT',
  LoyaltyServicePort = 'LOYALTY_SERVICE_PORT',
  CashbackServicePort = 'CASHBACK_SERVICE_PORT',
  PurchaseDatabaseUrl = 'PURCHASE_DATABASE_URL',
  LoyaltyDatabaseUrl = 'LOYALTY_DATABASE_URL',
  CashbackDatabaseUrl = 'CASHBACK_DATABASE_URL',
  PurchaseServiceUrl = 'PURCHASE_SERVICE_URL',
  LoyaltyServiceUrl = 'LOYALTY_SERVICE_URL',
  PaymentProvider = 'PAYMENT_PROVIDER',
  PaystackSecretKey = 'PAYSTACK_SECRET_KEY',
  CashbackAmountKobo = 'CASHBACK_AMOUNT_KOBO',
}

const baseSchema = z.object({
  [EnvKey.NodeEnv]: z.enum(['development', 'test', 'production']).default('development'),
  [EnvKey.RabbitmqUrl]: z.string().url(),
  [EnvKey.RedisUrl]: z.string().url(),
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
