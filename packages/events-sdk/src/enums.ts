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
  PayoutAccount = 'poa',
}

export enum ServiceName {
  ApiGateway = 'api-gateway',
  Purchase = 'purchase-service',
  Loyalty = 'loyalty-service',
  Cashback = 'cashback-service',
}

export enum OutboxStatus {
  Pending = 'PENDING',
  Publishing = 'PUBLISHING',
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
