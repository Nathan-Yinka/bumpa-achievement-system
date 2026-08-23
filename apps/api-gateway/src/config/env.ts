import { z } from 'zod';

export enum EnvKey {
  ApiGatewayPort = 'API_GATEWAY_PORT',
  PurchaseServiceHost = 'PURCHASE_SERVICE_HOST',
  PurchaseServicePort = 'PURCHASE_SERVICE_PORT',
  LoyaltyServiceHost = 'LOYALTY_SERVICE_HOST',
  LoyaltyServicePort = 'LOYALTY_SERVICE_PORT',
  CashbackServiceHost = 'CASHBACK_SERVICE_HOST',
  CashbackServicePort = 'CASHBACK_SERVICE_PORT',
}

const envSchema = z.object({
  [EnvKey.ApiGatewayPort]: z.coerce.number().int().positive().default(3000),
  [EnvKey.PurchaseServiceHost]: z.string().min(1).default('localhost'),
  [EnvKey.PurchaseServicePort]: z.coerce.number().int().positive().default(3001),
  [EnvKey.LoyaltyServiceHost]: z.string().min(1).default('localhost'),
  [EnvKey.LoyaltyServicePort]: z.coerce.number().int().positive().default(3002),
  [EnvKey.CashbackServiceHost]: z.string().min(1).default('localhost'),
  [EnvKey.CashbackServicePort]: z.coerce.number().int().positive().default(3004),
});

export type ValidatedEnv = Record<string, string | number | undefined>;

export function validateEnv(env: NodeJS.ProcessEnv = process.env): void {
  envSchema.parse(env);
}

export function validateConfig(env: NodeJS.ProcessEnv): ValidatedEnv {
  return envSchema.parse(env);
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

export function getServiceBaseUrl(hostEnv: EnvKey, portEnv: EnvKey, fallbackHost: string, fallbackPort: number): string {
  validateEnv();
  const host = process.env[hostEnv] ?? fallbackHost;
  const port = getNumberEnv(portEnv, fallbackPort);
  return `http://${host}:${port}`;
}
