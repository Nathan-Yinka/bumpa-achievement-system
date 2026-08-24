# @bumpa/events-sdk

Shared contracts for every domain event in the system. This is the one package every other
service and package depends on — it's what makes "the payload shape loyalty-service emits" and
"the payload shape cashback-service consumes" provably the same type, instead of two services
independently guessing at a JSON shape and drifting apart over time.

## What's in it

- **`DomainEventName`** — the exhaustive list of event types (`PurchaseCompleted.v1`,
  `AchievementUnlocked.v1`, `BadgeUnlocked.v1`, `CashbackProcessed.v1`). The `.v1` suffix is
  deliberate — a breaking payload change ships as `.v2`, old consumers keep reading `.v1` until
  they're migrated, nobody's on-call at 2am over a silent schema change.
- **Event payload interfaces** (`PurchaseCompletedPayload`, `AchievementUnlockedPayload`,
  `BadgeUnlockedPayload`, `CashbackProcessedPayload`) and the generic `DomainEvent<TPayload>`
  envelope (`eventId`, `type`, `version`, `occurredAt`, `correlationId`, `payload`).
- **`createDomainEvent(type, payload, correlationId, eventId)`** — the one place envelope
  fields get filled in, so every event looks the same on the wire regardless of which service
  built it.
- **`createReadableId(prefix)`** — `usr_a1b2c3d4e5f6`-style ids. Prefixes live in
  `EntityIdPrefix` (`User`, `Purchase`, `Achievement`, `Badge`, `Cashback`, `Event`, ...).
  Readable over a raw UUID: you can tell what an id refers to just by glancing at logs.
- **Shared enums**: `PaymentStatus`, `PaymentProviderName`, `OutboxStatus`, `CashbackFailureCode`,
  `ServiceName`, `BrokerQueueName`, `JobQueueName`/`JobName`, `OutboxLockKey`.
- **`JsonValue` / `JsonObject`** — a real recursive JSON type, used anywhere a payload is
  "some JSON we don't have a stricter shape for yet" (e.g. a raw provider webhook body) without
  reaching for `any`.

## Using it in a service

```ts
import {
  createDomainEvent,
  createReadableId,
  DomainEventName,
  EntityIdPrefix,
  type BadgeUnlockedEvent,
} from '@bumpa/events-sdk';

const event: BadgeUnlockedEvent = createDomainEvent(
  DomainEventName.BadgeUnlocked,
  { badge_name: 'Beginner', rewardAmountKobo: 30000, rewardCurrency: 'NGN', user },
  correlationId,
  createReadableId(EntityIdPrefix.Event),
);
```

That event is what gets written to the outbox (see `@bumpa/outbox-sdk`) and, once published,
what a consumer receives via `@bumpa/broker-sdk`'s `subscribe()` — same type on both ends,
checked by the compiler.

## Why a separate package instead of copy-pasting types

Four services agreeing on a wire format by convention is how you get a payload that's
`achievementName` in one service and `achievement_name` in another, discovered in production.
Here it's one interface, imported everywhere, so a payload shape change is a compile error in
every consumer until it's handled — not a runtime surprise.

## Local dev

No build step needed inside the monorepo — every app resolves `@bumpa/events-sdk` straight to
`packages/events-sdk/src` via the workspace's `tsconfig` path mapping and Jest's
`moduleNameMapper`. Editing a type here is immediately visible to every service without a
publish/link step.
