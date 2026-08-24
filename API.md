# API Reference

The full public API surface, event flow, request/response payloads, and error shapes for the
Bumpa Achievement System. For architecture, diagrams, and how everything fits together, see the
root [`README.md`](README.md); for one service's internals, see that service's own `README.md`
under `apps/*/`.

## Response Envelope

All public gateway responses are wrapped.

Successful response:

```json
{
  "success": true,
  "statusCode": 200,
  "data": {},
  "timestamp": "2026-08-23T12:00:00.000Z"
}
```

Error response:

```json
{
  "success": false,
  "statusCode": 400,
  "error": "BadRequestException",
  "errorCode": "VALIDATION_FAILED",
  "message": "amountKobo must not be less than 1",
  "details": ["amountKobo must not be less than 1"],
  "path": "/purchases",
  "timestamp": "2026-08-23T12:00:00.000Z"
}
```

`errorCode` and `details` are optional — present when the downstream service or gateway
supplies them, otherwise omitted.

## Authentication

`/admin/*` and `/cashbacks*` require an `x-api-key` header matching the `ADMIN_API_KEY`
environment variable. `POST /purchases` and `GET /users/{userId}/achievements` are public — no
key required.

```bash
curl -H "x-api-key: bumpa-local-admin-key" http://localhost:3000/cashbacks
```

Docker Compose sets a dev default (`bumpa-local-admin-key`) so the stack works out of the box
locally. Override `ADMIN_API_KEY` for anything beyond local use. This is a shared-secret gate,
not user authentication — there's no user-account/role model in this system.

A missing or wrong key returns:

```json
{
  "success": false,
  "statusCode": 401,
  "error": "UnauthorizedException",
  "message": "A valid x-api-key header is required for this endpoint",
  "path": "/cashbacks",
  "timestamp": "2026-08-23T12:00:00.000Z"
}
```

## Pagination and Search

`GET /admin/achievements`, `GET /admin/badges`, and `GET /cashbacks` are paginated. All three
accept:

| Param | Default | Notes |
|---|---|---|
| `page` | `1` | 1-indexed |
| `limit` | `20` | max `100` |
| `search` | — | case-insensitive; achievements/badges match name+description, cashbacks match badge name, userId, or provider reference |

Endpoint-specific filters:

- `/admin/achievements` also accepts `groupKey`, `active`
- `/admin/badges` also accepts `active`
- `/cashbacks` also accepts `userId`, `status` (`PENDING` | `PROCESSING` | `SUCCESSFUL` | `FAILED`)

Response shape for all three:

```json
{
  "success": true,
  "statusCode": 200,
  "data": {
    "items": [],
    "meta": { "page": 1, "limit": 20, "total": 6, "totalPages": 1 }
  },
  "timestamp": "2026-08-23T12:00:00.000Z"
}
```

## Main Flow

1. A client creates a purchase through the API gateway.
2. Purchase service stores the user and purchase, writes `PurchaseCompleted.v1` to its outbox in
   the same transaction, then publishes it.
3. Loyalty service consumes `PurchaseCompleted.v1`, updates purchase stats, checks every active
   achievement's rule, unlocks whatever qualifies, and emits `AchievementUnlocked.v1` /
   `BadgeUnlocked.v1`.
4. Cashback service consumes `BadgeUnlocked.v1`, creates a cashback transaction, and pays out
   through the configured provider — classifying and, where it makes sense, retrying any
   failure. See [`apps/cashback-service/README.md`](apps/cashback-service/README.md) for the
   full retry/classification design.
5. `GET /users/{userId}/achievements` shows unlocked achievements, next achievements, current
   badge, and next-badge progress at any point in that flow.

If a consumer handler fails partway through, it's retried automatically via a RabbitMQ
delayed-retry queue (escalating 1s → 30s, 5 attempts) before landing in a permanent dead-letter
queue for manual inspection — see [`packages/broker-sdk/README.md`](packages/broker-sdk/README.md).

## Public Gateway Endpoints

Base URL:

```text
http://localhost:3000
```

Swagger (grouped by tag, with request/response examples for every endpoint):

```text
http://localhost:3000/docs
```

### Create Purchase

```http
POST /purchases
```

Headers (both optional):

```text
x-idempotency-key: <client-generated key>
x-correlation-id: <trace id, or one is generated for you>
```

Request:

```json
{
  "userId": "usr_customer_001",
  "email": "customer@getbumpa.com",
  "name": "Amina Bello",
  "bankAccountNumber": "0123456789",
  "bankCode": "058",
  "amountKobo": 500000
}
```

Notes:

- `bankAccountNumber` and `bankCode` are optional for purchase creation. They're required
  before real cashback can be paid out — a badge unlocked for a user with no bank details ends
  up a `FAILED` cashback transaction, classified `MISSING_BANK_DETAILS`, resumable via the
  retry endpoint below.
- `amountKobo` is in kobo, must be at least `1` and at most `10,000,000,000` (₦100,000,000).
- `x-idempotency-key`: if supplied, a repeated request with the same key returns the original
  purchase instead of creating a duplicate — safe to retry on timeout.

Response:

```json
{
  "success": true,
  "statusCode": 201,
  "data": { "purchaseId": "pur_abc123def456" },
  "timestamp": "2026-08-23T12:00:00.000Z"
}
```

Side effect: emits `PurchaseCompleted.v1`.

### Get User Achievements

```http
GET /users/{userId}/achievements
```

Response:

```json
{
  "success": true,
  "statusCode": 200,
  "data": {
    "unlocked_achievements": ["First Purchase", "5 Purchases"],
    "next_available_achievements": ["10 Purchases", "Big Spender"],
    "current_badge": "Beginner",
    "next_badge": "Intermediate",
    "remaining_to_unlock_next_badge": 1
  },
  "timestamp": "2026-08-23T12:00:00.000Z"
}
```

Rules:

- Only the next locked achievement in each achievement group is returned.
- `current_badge` is the highest unlocked badge.
- `remaining_to_unlock_next_badge` is computed from configured badge requirements.
- A user who has never purchased anything gets an empty, non-error response
  (`unlocked_achievements: []`, `current_badge: ""`, `next_badge` = the first configured badge).

### List Cashback Transactions

```http
GET /cashbacks
```

Requires `x-api-key`. Paginated — see [Pagination and Search](#pagination-and-search).

```http
GET /cashbacks?userId=usr_customer_001&status=FAILED&page=1&limit=10
```

Response:

```json
{
  "success": true,
  "statusCode": 200,
  "data": {
    "items": [
      {
        "id": "cbk_abc123def456",
        "userId": "usr_customer_001",
        "badgeName": "Beginner",
        "amountKobo": 30000,
        "status": "FAILED",
        "provider": "paystack",
        "providerReference": "paystack_cbk_abc123def456",
        "providerRecipientCode": null,
        "correlationId": "evt_abc123def456",
        "failureReason": "Your balance is not enough to fulfil this request",
        "failureCode": "INSUFFICIENT_BALANCE",
        "retryable": true,
        "retryCount": 2,
        "nextRetryAt": "2026-08-23T12:10:00.000Z",
        "createdAt": "2026-08-23T12:00:00.000Z",
        "updatedAt": "2026-08-23T12:00:00.000Z"
      }
    ],
    "meta": { "page": 1, "limit": 10, "total": 1, "totalPages": 1 }
  },
  "timestamp": "2026-08-23T12:00:00.000Z"
}
```

`status` can also be `PROCESSING` (claimed, being paid out right now). `failureCode`,
`retryable`, `retryCount`, and `nextRetryAt` are only meaningful once a transaction has failed
at least once — see the failure classification table below. A `SUCCESSFUL` row has all four as
`null`/`0`.

### Retry a Failed Cashback

```http
POST /cashbacks/{id}/retry
```

Requires `x-api-key`. Only works on a transaction currently `FAILED`.

Queues the retry and returns `202` immediately — it doesn't wait for Paystack. Retrying calls
Paystack synchronously (create recipient, then initiate transfer), which can take several
seconds; doing that inside the HTTP request risks the gateway's own request timeout, so it runs
on the same background worker the very first attempt already uses. Poll
`GET /cashbacks?userId=...` to see the outcome.

Request (both fields optional — omit if the payout account already has bank details on file,
e.g. from a later purchase):

```json
{ "bankAccountNumber": "0123456789", "bankCode": "058" }
```

Response:

```json
{
  "success": true,
  "statusCode": 202,
  "data": null,
  "timestamp": "2026-08-23T12:00:00.000Z"
}
```

Errors: `404` if the transaction id doesn't exist, `400` if it isn't currently `FAILED`, or
`400` if no bank details are available even after applying the override.

**It might also retry itself, without you calling this.** A `FAILED` transaction classified
`retryable: true` (see below) gets picked up automatically by a background scanner — this
endpoint is for the ones that need a human (bad account details, missing bank info) or for
forcing an early retry instead of waiting.

### Cashback Failure Classification

Every `FAILED` transaction carries a `failureCode` and a `retryable` flag:

| `failureCode` | Retryable automatically? | Meaning |
|---|---|---|
| `INSUFFICIENT_BALANCE` | yes | provider balance too low right now |
| `PROVIDER_UNAVAILABLE` | yes | network error, rate limit, or the provider's 5xx |
| `DUPLICATE_REFERENCE` | yes | reference collision (shouldn't happen — references are generated fresh per attempt) |
| `INVALID_ACCOUNT` | no | bad bank code, bad account number, or invalid recipient — needs corrected bank details via the retry endpoint |
| `MISSING_BANK_DETAILS` | no | no payout account on file at all |
| `PROVIDER_MISCONFIGURED` | no | the provider rejected our credentials — an operator problem, not a per-transaction one |
| `PROVIDER_REJECTED` | no | anything else unrecognized — treated as a dead end deliberately |

See [`apps/cashback-service/README.md`](apps/cashback-service/README.md) for the full two-tier
retry design (fast in-process BullMQ retry, then a slower interval-based auto-retry scanner).

## Admin Configuration Endpoints

All `/admin/*` endpoints require `x-api-key` — see [Authentication](#authentication). Achievement
and badge rules are explained in depth in
[`apps/loyalty-service/README.md`](apps/loyalty-service/README.md).

### List Achievements

```http
GET /admin/achievements
```

Paginated — see [Pagination and Search](#pagination-and-search). Also accepts `groupKey` and
`active` filters.

```http
GET /admin/achievements?groupKey=purchases&active=true&search=purchase
```

Response:

```json
{
  "success": true,
  "statusCode": 200,
  "data": {
    "items": [
      {
        "id": "ach_first_purchase",
        "name": "First Purchase",
        "description": "Make your first purchase and start your Bumpa loyalty journey.",
        "groupKey": "purchases",
        "sortOrder": 1,
        "rule": { "type": "COUNT", "field": "purchase_count", "operator": "GTE", "value": 1 },
        "imageUrl": "https://placehold.co/512x512/png?text=First+Purchase",
        "active": true
      }
    ],
    "meta": { "page": 1, "limit": 20, "total": 6, "totalPages": 1 }
  },
  "timestamp": "2026-08-23T12:00:00.000Z"
}
```

### Create Achievement

```http
POST /admin/achievements
```

Request:

```json
{
  "id": "ach_20_purchases",
  "name": "20 Purchases",
  "description": "Complete 20 purchases on Bumpa.",
  "groupKey": "purchases",
  "sortOrder": 4,
  "rule": { "type": "COUNT", "field": "purchase_count", "operator": "GTE", "value": 20 },
  "imageUrl": "https://placehold.co/512x512/png?text=20+Purchases",
  "active": true
}
```

`rule` must be one of `COUNT`, `SUM`, `COMBINATION`, or `ACHIEVEMENT_SET` (see [Rule
Types](#rule-types)) — a malformed shape is rejected with `400`, never silently accepted.

`sortOrder` is scoped per `groupKey`. Saving at a position another achievement in the *same
group* already occupies doesn't error — it bumps that achievement (and everything after it, in
that group) up by one. Achievements in other groups are never affected.

Response (`201`): the created resource, same shape as the list items above.

### Update Achievement

```http
PATCH /admin/achievements/{id}
```

Partial update — only supplied fields change. Changing `sortOrder` and/or `groupKey` triggers
the same auto-shift as create; re-saving the same position is a no-op (doesn't reshuffle
anything).

Request:

```json
{ "active": false, "sortOrder": 5 }
```

Response (`200`): the full updated resource.

### List Badges

```http
GET /admin/badges
```

Paginated — see [Pagination and Search](#pagination-and-search). Also accepts `active`.

```json
{
  "success": true,
  "statusCode": 200,
  "data": {
    "items": [
      {
        "id": "bdg_beginner",
        "name": "Beginner",
        "description": "Awarded after the customer makes their first purchase.",
        "sortOrder": 1,
        "requiredAchievementCount": 1,
        "requiredAchievementIds": ["ach_first_purchase"],
        "rewardAmountKobo": 30000,
        "rewardCurrency": "NGN",
        "imageUrl": "https://placehold.co/512x512/png?text=Beginner",
        "active": true
      }
    ],
    "meta": { "page": 1, "limit": 20, "total": 4, "totalPages": 1 }
  },
  "timestamp": "2026-08-23T12:00:00.000Z"
}
```

### Create Badge

```http
POST /admin/badges
```

Request:

```json
{
  "id": "bdg_elite",
  "name": "Elite",
  "description": "Unlocked by customers who complete high-value loyalty milestones.",
  "sortOrder": 4,
  "requiredAchievementCount": 8,
  "requiredAchievementIds": ["ach_first_purchase", "ach_5_purchases"],
  "rewardAmountKobo": 30000,
  "rewardCurrency": "NGN",
  "imageUrl": "https://placehold.co/512x512/png?text=Elite",
  "active": true
}
```

`requiredAchievementIds` must all reference achievements that already exist — an unknown id is
rejected with `400`. `sortOrder` is global for badges (no grouping) — same auto-shift behavior.

Response (`201`): the created resource.

### Update Badge

```http
PATCH /admin/badges/{id}
```

Request:

```json
{ "requiredAchievementCount": 10, "active": true }
```

Response (`200`): the full updated resource.

### Get Catalog

```http
GET /admin/catalog
```

Read-only combined view: every achievement, and every badge with its `requiredAchievementIds`
resolved into full achievement objects.

```json
{
  "success": true,
  "statusCode": 200,
  "data": {
    "achievements": [{ "id": "ach_first_purchase", "name": "First Purchase", "...": "..." }],
    "badges": [
      {
        "id": "bdg_beginner",
        "name": "Beginner",
        "requiredAchievementIds": ["ach_first_purchase"],
        "requiredAchievements": [{ "id": "ach_first_purchase", "name": "First Purchase", "...": "..." }],
        "...": "..."
      }
    ]
  },
  "timestamp": "2026-08-23T12:00:00.000Z"
}
```

### Rule Types

Used in an achievement's `rule` field. A malformed shape (wrong `type`, missing required
fields) is rejected at write time with `400` — it can never be saved and silently break
achievement processing later.

```json
{ "type": "COUNT", "field": "purchase_count", "operator": "GTE", "value": 5 }
```

```json
{ "type": "SUM", "field": "total_spend_kobo", "operator": "GTE", "value": 2500000 }
```

```json
{
  "type": "COMBINATION",
  "operator": "AND",
  "rules": [
    { "type": "COUNT", "field": "purchase_count", "operator": "GTE", "value": 5 },
    { "type": "SUM", "field": "total_spend_kobo", "operator": "GTE", "value": 2500000 }
  ]
}
```

```json
{ "type": "ACHIEVEMENT_SET", "achievementIds": ["ach_first_purchase", "ach_5_purchases"], "minRequired": 2 }
```

## Paystack Webhook

Public — no `x-api-key` — but signature-verified. Reaches the gateway's public URL
(`POST /webhooks/paystack`), which proxies the raw, byte-for-byte request straight to
`cashback-service` (never published directly — see
[`apps/api-gateway/README.md`](apps/api-gateway/README.md) for why the raw-bytes part matters).

```http
POST /webhooks/paystack
```

Headers:

```text
x-paystack-signature: <hmac-sha512 over the raw request body, keyed with PAYSTACK_SECRET_KEY>
```

Example payload:

```json
{ "event": "transfer.success", "data": { "reference": "paystack_cbk_abc123def456" } }
```

Supported events: `transfer.success`, `transfer.failed`, `transfer.reversed`.

Response: `{ "received": true }`.

A missing, invalid, or unverifiable signature returns `401` before any payload parsing happens.
An unknown `reference` (no matching transaction) or a transaction already in a terminal state is
a silent no-op, still returning `{ "received": true }` — this is intentionally idempotent, since
Paystack can and does redeliver.

## Event Contracts

### PurchaseCompleted.v1

```json
{
  "eventId": "evt_abc123def456",
  "type": "PurchaseCompleted.v1",
  "version": 1,
  "correlationId": "evt_corr12345678",
  "occurredAt": "2026-08-23T12:00:00.000Z",
  "payload": {
    "userId": "usr_customer_001",
    "purchaseId": "pur_abc123def456",
    "amountKobo": 500000,
    "user": {
      "id": "usr_customer_001",
      "email": "customer@getbumpa.com",
      "name": "Amina Bello",
      "bankAccountNumber": "0123456789",
      "bankCode": "058"
    }
  }
}
```

### AchievementUnlocked.v1

Payload fields match the assessment spec exactly: `achievement_name` (snake_case) and `user`.

```json
{
  "eventId": "evt_abc123def456",
  "type": "AchievementUnlocked.v1",
  "version": 1,
  "correlationId": "evt_corr12345678",
  "occurredAt": "2026-08-23T12:00:00.000Z",
  "payload": {
    "achievement_name": "First Purchase",
    "user": {
      "id": "usr_customer_001",
      "email": "customer@getbumpa.com",
      "name": "Amina Bello",
      "bankAccountNumber": "0123456789",
      "bankCode": "058"
    }
  }
}
```

### BadgeUnlocked.v1

Payload fields match the assessment spec: `badge_name` (snake_case) and `user`, plus the reward
amount/currency so cashback-service doesn't need to look up badge config separately.

```json
{
  "eventId": "evt_abc123def456",
  "type": "BadgeUnlocked.v1",
  "version": 1,
  "correlationId": "evt_corr12345678",
  "occurredAt": "2026-08-23T12:00:00.000Z",
  "payload": {
    "badge_name": "Beginner",
    "rewardAmountKobo": 30000,
    "rewardCurrency": "NGN",
    "user": {
      "id": "usr_customer_001",
      "email": "customer@getbumpa.com",
      "name": "Amina Bello",
      "bankAccountNumber": "0123456789",
      "bankCode": "058"
    }
  }
}
```

### CashbackProcessed.v1

Not consumed by any service today — published for audit/observability (e.g. a future
notifications service, or just `npm run watch:events` while debugging). `failureCode`,
`failureReason`, and `retryable` are only present when `status` is `FAILED`.

Successful:

```json
{
  "eventId": "evt_abc123def456",
  "type": "CashbackProcessed.v1",
  "version": 1,
  "correlationId": "evt_corr12345678",
  "occurredAt": "2026-08-23T12:00:00.000Z",
  "payload": {
    "badgeName": "Beginner",
    "userId": "usr_customer_001",
    "amountKobo": 30000,
    "providerReference": "paystack_cbk_abc123def456",
    "status": "SUCCESSFUL"
  }
}
```

Failed:

```json
{
  "eventId": "evt_0936fde3c626",
  "type": "CashbackProcessed.v1",
  "version": 1,
  "correlationId": "evt_corr12345678",
  "occurredAt": "2026-08-23T12:00:00.000Z",
  "payload": {
    "badgeName": "Beginner",
    "userId": "usr_customer_001",
    "amountKobo": 30000,
    "providerReference": "paystack_cbk_9f712eaa4bbe",
    "status": "FAILED",
    "failureCode": "INSUFFICIENT_BALANCE",
    "failureReason": "Your balance is not enough to fulfil this request",
    "retryable": true
  }
}
```

## Local Test Commands

```bash
npm test                  # fast unit/integration specs, no Docker
npm run test:e2e:docker   # full docker e2e flow (purchase → achievement → badge → cashback)
docker compose up --build # start the full platform (prod-safe, only the gateway's port published)
npm run docker:dev        # same, plus Postgres/Redis/RabbitMQ UI/every service exposed to the host
```
