# purchase-service

Owns users and purchases. The start of the whole chain: a purchase here is what eventually
becomes an achievement, a badge, and a cashback payout — but this service knows nothing about
any of that. It just records a purchase and announces it happened.

## What it does

- `POST /purchases` (internal — the gateway is the public entrypoint) creates a `Purchase` row
  and upserts a `User` row (by `userId`, the client-supplied identity key) in one transaction,
  writes a `PurchaseCompleted.v1` event to the outbox in the *same* transaction, then publishes
  it. See the root README's "Outbox pattern" section for why same-transaction matters.
- Supports an idempotency key (`x-idempotency-key` header, forwarded by the gateway): the same
  key submitted twice returns the original `purchaseId` instead of creating a duplicate
  purchase — safe for a client to retry on timeout without double-charging conceptually.

## Data model

- `users` — `id` (the real identity key, client-supplied), `email`, `name`,
  `bankAccountNumber?`, `bankCode?`. **`email` is not unique** — it's contact info, not an
  identity key, so two different `userId`s can share one email (this was a real constraint that
  got added and then deliberately removed — see `2026082400030-DropUsersEmailUnique`).
- `purchases` — `id`, `userId` (FK, cascade delete), `amountKobo`, `idempotencyKey?` (unique
  when present).

## Event emitted

`PurchaseCompleted.v1` — `{ userId, purchaseId, amountKobo, user: UserSnapshot }`. Consumed by
`loyalty-service` to update purchase-count/spend stats and check achievement rules.

## Configuration

| Env var | Default | Purpose |
|---|---|---|
| `PURCHASE_SERVICE_PORT` | `3001` | port the app listens on |
| `DATABASE_HOST`/`_PORT`/`_USER`/`_PASSWORD` | — | Postgres connection |
| `PURCHASE_DATABASE_NAME` | `purchase_db` | database name |
| `RABBITMQ_HOST`/`_PORT`/`_USER`/`_PASSWORD` | — | broker connection |
| `REDIS_HOST`/`_PORT` | — | used only by the outbox scanner's distributed lock |
| `OUTBOX_BATCH_SIZE` / `_MAX_ATTEMPTS` / `_LOCK_TTL_MS` / `_POLL_INTERVAL_MS` | `20` / `5` / `5000` / `30000` | outbox scanner tuning, see `@bumpa/outbox-sdk` |

## Packages it depends on

- `@bumpa/events-sdk` — `PurchaseCompletedEvent`, `createDomainEvent`, `createReadableId`.
- `@bumpa/outbox-sdk` — `OutboxModule.forRoot({ entity: OutboxEvent, lockKey: OutboxLockKey.Purchase, ... })`.
- `@bumpa/broker-sdk` — `BrokerModule.forRoot({ serviceName: ServiceName.Purchase, ... })`; this
  service only *publishes* (via the outbox), it doesn't subscribe to anything.
- `@bumpa/logger-sdk` — `JsonLogger`, `CorrelationIdMiddleware`, `RequestLoggingMiddleware`.

## Migrations

Run automatically on boot (`migrationsRun: true`) — see the root README's "Migrations and
seeding" section. Current history: create schema → add idempotency key → drop the email unique
constraint.

## Run it alone

```bash
npm run start:dev -w apps/purchase-service
```

Needs Postgres, RabbitMQ, and Redis reachable — easiest via `npm run docker:dev` for the
infra, then this in watch mode against it.
