import { EventVersion } from './enums';
import type { CashbackFailureCode, DomainEventName, PaymentStatus } from './enums';

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
  achievement_name: string;
  user: UserSnapshot;
}

export interface BadgeUnlockedPayload {
  badge_name: string;
  rewardAmountKobo: number;
  rewardCurrency: string;
  user: UserSnapshot;
}

export interface CashbackProcessedPayload {
  badgeName: string;
  userId: string;
  amountKobo: number;
  providerReference: string;
  status: PaymentStatus.Successful | PaymentStatus.Failed;
  // Set only when status is Failed.
  failureCode?: CashbackFailureCode;
  failureReason?: string;
  retryable?: boolean;
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
