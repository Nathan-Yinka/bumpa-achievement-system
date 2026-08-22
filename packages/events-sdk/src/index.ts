import { randomBytes } from 'node:crypto';

export enum DomainEventName {
  PurchaseCompleted = 'PurchaseCompleted.v1',
  AchievementUnlocked = 'AchievementUnlocked.v1',
  BadgeUnlocked = 'BadgeUnlocked.v1',
  CashbackProcessed = 'CashbackProcessed.v1',
}

export enum EventVersion {
  V1 = 1,
}

export enum EntityIdPrefix {
  User = 'usr',
  Purchase = 'pur',
  Achievement = 'ach',
  UserAchievement = 'uach',
  Badge = 'bdg',
  UserBadge = 'ubdg',
  Event = 'evt',
  Cashback = 'cbk',
}

export enum ServiceName {
  ApiGateway = 'api-gateway',
  Purchase = 'purchase-service',
  Loyalty = 'loyalty-service',
  Cashback = 'cashback-service',
}

export enum OutboxStatus {
  Pending = 'PENDING',
  Published = 'PUBLISHED',
  Failed = 'FAILED',
}

export enum PaymentStatus {
  Pending = 'PENDING',
  Successful = 'SUCCESSFUL',
  Failed = 'FAILED',
}

export enum PaymentProviderName {
  Mock = 'mock',
  Paystack = 'paystack',
}

export enum BrokerQueueName {
  LoyaltyPurchaseCompleted = 'loyalty.purchase-completed',
  CashbackBadgeUnlocked = 'cashback.badge-unlocked',
}

export enum OutboxLockKey {
  Purchase = 'outbox:purchase-service',
  Loyalty = 'outbox:loyalty-service',
  Cashback = 'outbox:cashback-service',
}

export enum JobQueueName {
  CashbackPayments = 'cashback-payments',
}

export enum JobName {
  SendCashback = 'send-cashback',
}

export function createReadableId(prefix: EntityIdPrefix): string {
  return `${prefix}_${randomBytes(6).toString('hex')}`;
}

export interface DomainEvent<TPayload extends object = object> {
  eventId: string;
  type: DomainEventName;
  version: EventVersion.V1;
  occurredAt: string;
  correlationId: string;
  payload: TPayload;
}

export interface UserSnapshot {
  id: string;
  email: string;
  name: string;
  bankAccountNumber?: string | null;
  bankCode?: string | null;
}

export interface PurchaseCompletedPayload {
  userId: string;
  purchaseId: string;
  amountKobo: number;
  user: UserSnapshot;
}

export interface AchievementUnlockedPayload {
  achievementName: string;
  user: UserSnapshot;
}

export interface BadgeUnlockedPayload {
  badgeName: string;
  user: UserSnapshot;
}

export interface CashbackProcessedPayload {
  badgeName: string;
  userId: string;
  amountKobo: number;
  providerReference: string;
  status: PaymentStatus.Successful | PaymentStatus.Failed;
}

export type PurchaseCompletedEvent = DomainEvent<PurchaseCompletedPayload>;
export type AchievementUnlockedEvent = DomainEvent<AchievementUnlockedPayload>;
export type BadgeUnlockedEvent = DomainEvent<BadgeUnlockedPayload>;
export type CashbackProcessedEvent = DomainEvent<CashbackProcessedPayload>;

export type BumpaDomainEvent =
  | PurchaseCompletedEvent
  | AchievementUnlockedEvent
  | BadgeUnlockedEvent
  | CashbackProcessedEvent;

export function createDomainEvent<TPayload extends object>(
  type: DomainEventName,
  payload: TPayload,
  correlationId: string,
  eventId: string,
): DomainEvent<TPayload> {
  return {
    eventId,
    type,
    version: EventVersion.V1,
    occurredAt: new Date().toISOString(),
    correlationId,
    payload,
  };
}
