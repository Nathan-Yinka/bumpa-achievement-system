# loyalty-service

Owns configurable achievements and badges, tracks each user's progress, unlocks achievements and
badges as they qualify, and exposes an admin API to change what "qualifying" means — without a
code deploy.

## The configurability point

Achievements and badges are **data, not code**. `achievement_configs` and `badge_configs` are
plain rows an admin creates/edits over HTTP; nothing about what unlocks what is hardcoded. A
handful of seed rows exist so the system does something out of the box (`default-loyalty-config.ts`,
inserted once by `LoyaltyConfigSeederService` on first boot — never overwrites an admin's
changes), but they're just data too, editable the same way as anything an admin creates.

### Achievement groups

An achievement's `groupKey` (`purchases`, `spend`, `milestones`, ...) isn't free text — it's a
foreign key into its own `achievement_groups` table (`key`, `name`, `sortOrder`), managed the
same way as achievements/badges: `GET`/`POST`/`PATCH /admin/achievement-groups`, same
sortOrder-collision auto-shift. That table exists specifically so a typo'd `groupKey` on an
achievement is a real `400` at write time, not a silently-created phantom group nothing ever
warns you about — creating or updating an achievement with an unknown `groupKey` fails cleanly
instead of writing a row TypeORM's FK constraint would otherwise reject as a raw `500`.

### Achievement rules

An achievement's `rule` column is a small JSON expression, evaluated by `RuleEngineService`
against a user's current stats (`purchaseCount`, `totalSpendKobo`, and which achievement ids
they've already unlocked):

| Rule type | Shape | Meaning |
|---|---|---|
| `COUNT` | `{ type: 'COUNT', field: 'purchase_count', operator: 'GTE', value: N }` | unlock once the user's purchase count is ≥ N |
| `SUM` | `{ type: 'SUM', field: 'total_spend_kobo', operator: 'GTE', value: N }` | unlock once total spend (kobo) is ≥ N |
| `ACHIEVEMENT_SET` | `{ type: 'ACHIEVEMENT_SET', achievementIds: [...], minRequired?: N }` | unlock once at least `minRequired` (default: all) of the listed achievements are already unlocked — lets one achievement depend on others |
| `COMBINATION` | `{ type: 'COMBINATION', operator: 'AND', rules: [...] }` | unlock only if every nested rule is true |

Example — "Big Spender" requires both 5+ purchases *and* ₦50,000+ total spend:

```json
{
  "type": "COMBINATION",
  "operator": "AND",
  "rules": [
    { "type": "COUNT", "field": "purchase_count", "operator": "GTE", "value": 5 },
    { "type": "SUM", "field": "total_spend_kobo", "operator": "GTE", "value": 5000000 }
  ]
}
```

A malformed rule is rejected at the admin API boundary (`ValidateRuleShape`, a custom
class-validator decorator) before it ever reaches the DB — an achievement with a bad rule used
to reach the DB, then crash `RuleEngineService.evaluate()` on the next purchase, dead-lettering
that user's `PurchaseCompleted.v1` message. Fixed both at the validation boundary and with a
fault-isolation `try/catch` per-achievement in the unlock loop — one broken achievement config
can no longer take down every other achievement check for that purchase.

### Badges

A badge's `requiredAchievementCount` (and optionally `requiredAchievementIds`, to require
*specific* achievements rather than just a count) decides when it unlocks. `sortOrder` is
global across all badges (an achievement's `sortOrder` is scoped per `groupKey` instead — badges
don't have groups). Saving a config at an already-occupied `sortOrder` doesn't error — it shifts
everything at or after that position down one, drag-and-drop-reorder semantics
(`makeRoomForAchievementSortOrder`/`makeRoomForBadgeSortOrder`).

## Endpoints

Admin config endpoints (`/admin/achievements`, `/admin/badges`, `/admin/catalog` — create,
paginated list, partial update) are behind the gateway's `x-api-key` guard. Full reference,
payloads, and examples: [`API.md`](../../API.md).

The one non-admin endpoint, `GET /internal/users/:userId/achievements`, is what the gateway's
`GET /users/:userId/achievements` forwards to — unlocked achievements, the next achievement in
each group, and badge progress.

## Events

- **Consumes** `PurchaseCompleted.v1` — updates the user's purchase-count/spend stats, evaluates
  every active achievement's rule, unlocks whatever now qualifies.
- **Emits** `AchievementUnlocked.v1` for each newly-unlocked achievement, and `BadgeUnlocked.v1`
  when an achievement unlock also crosses a badge's threshold. `BadgeUnlocked.v1` is what
  `cashback-service` consumes to trigger a payout.

## Configuration

| Env var | Default | Purpose |
|---|---|---|
| `LOYALTY_SERVICE_PORT` | `3002` | port the app listens on |
| `DATABASE_HOST`/`_PORT`/`_USER`/`_PASSWORD` | — | Postgres connection |
| `LOYALTY_DATABASE_NAME` | `loyalty_db` | database name |
| `RABBITMQ_HOST`/`_PORT`/`_USER`/`_PASSWORD` | — | broker connection |
| `REDIS_HOST`/`_PORT` | — | outbox scanner's distributed lock |
| `OUTBOX_BATCH_SIZE` / `_MAX_ATTEMPTS` / `_LOCK_TTL_MS` / `_POLL_INTERVAL_MS` | `20` / `5` / `5000` / `30000` | outbox scanner tuning |

## Packages it depends on

- `@bumpa/events-sdk`, `@bumpa/outbox-sdk` (publishing achievement/badge unlock events),
  `@bumpa/broker-sdk` (consuming `PurchaseCompleted.v1`), `@bumpa/logger-sdk`.

## Run it alone

```bash
npm run start:dev -w apps/loyalty-service
```
