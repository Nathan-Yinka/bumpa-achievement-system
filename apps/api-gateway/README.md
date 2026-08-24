# api-gateway

The only service exposed to the outside world. Everything else — Postgres, Redis, RabbitMQ,
`purchase-service`, `loyalty-service`, `cashback-service` — sits on a private Docker network
with no published port. If it's reachable from outside the Docker network, it went through here.

## What it does

- Validates every request (`class-validator` DTOs, `whitelist: true`, `forbidNonWhitelisted: true`
  — an unexpected field is a `400`, not silently dropped or silently accepted).
- Forwards to the owning microservice over plain HTTP (`MicroserviceHttpClient`), preserving the
  correlation id and the downstream status code.
- Wraps every response in a consistent envelope (`ResponseInterceptor`):
  ```json
  { "success": true, "statusCode": 200, "data": {}, "timestamp": "..." }
  ```
- Gates `/admin/*` and `/cashbacks*` behind a shared `x-api-key` (`ApiKeyGuard`) — see the root
  README's "Admin & cashback access" section.
- Terminates the public Paystack webhook (`POST /webhooks/paystack`) and forwards the *raw,
  unparsed* request body straight through to `cashback-service`, which is the only place that
  actually verifies the signature. See "Why the webhook lives here" below.
- Serves Swagger at `/docs`.

Full endpoint reference (payloads, examples, error shapes): see the root
[`API.md`](../../API.md).

## Why the webhook lives here, not on cashback-service directly

`cashback-service` has no published port — Paystack's servers can't reach it directly, in any
environment. The gateway is the only thing with a public URL, so it's the only thing that *can*
receive the webhook; it just proxies the bytes through unchanged.

The "unchanged" part is load-bearing: Paystack signs the exact bytes it sent, and
`cashback-service` re-computes that HMAC over the exact bytes it receives. If the gateway parsed
the JSON and re-serialized it to forward, the signature would never match (different byte order,
different whitespace) and every webhook would fail verification. `main.ts` captures the raw
buffer during body parsing (`json({ verify: (req, _res, buf) => { req.rawBody = buf } })`) and
`MicroserviceHttpClient.forwardRaw()` sends that buffer on, header included, with zero
re-serialization in between.

## Configuration

| Env var | Default | Purpose |
|---|---|---|
| `API_GATEWAY_PORT` | `3000` | port the app listens on inside the container |
| `API_GATEWAY_HOST_PORT` | `3000` | the only port `docker-compose.yml` publishes to the host |
| `GATEWAY_BODY_LIMIT` | `100kb` | request body size cap |
| `GATEWAY_CORS_ORIGINS` | *(none)* | CSV of allowed origins; CORS is off if empty |
| `GATEWAY_DOCS_ENABLED` | `true` | toggles `/docs` |
| `PURCHASE_SERVICE_HOST` / `_PORT` | `purchase-service` / `3001` | where purchase-service is reachable |
| `LOYALTY_SERVICE_HOST` / `_PORT` | `loyalty-service` / `3002` | where loyalty-service is reachable |
| `CASHBACK_SERVICE_HOST` / `_PORT` | `cashback-service` / `3004` | where cashback-service is reachable |
| `MICROSERVICE_HTTP_TIMEOUT_MS` | `5000` | timeout on gateway → microservice calls |
| `ADMIN_API_KEY` | `bumpa-local-admin-key` (Docker dev default) | shared secret for `/admin/*` and `/cashbacks*` |

## Packages it depends on

- `@bumpa/logger-sdk` — `JsonLogger`, `CorrelationIdMiddleware`, `RequestLoggingMiddleware`.
- `@bumpa/events-sdk` — only for shared `JsonValue`/`JsonObject` typing on forwarded payloads;
  the gateway doesn't publish or consume domain events itself, it has no database and no broker
  connection.

## Run it alone (outside Docker)

```bash
npm run start:dev -w apps/api-gateway
```

Needs the three microservices reachable at whatever `*_SERVICE_HOST`/`_PORT` resolve to — in
practice this is easiest run as part of the full `docker compose up`, using this only for
iterating on the gateway with the rest of the stack already up.
