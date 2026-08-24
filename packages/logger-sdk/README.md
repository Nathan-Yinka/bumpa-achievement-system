# @bumpa/logger-sdk

Structured JSON logging and two request-scoped Express middlewares, shared across all four
services so a log line looks the same and carries the same fields no matter which service wrote
it — which matters the moment you're grepping combined `docker compose logs` output for one
request across three services.

## `JsonLogger`

A `LoggerService` implementation for Nest. Every line is one JSON object on stdout:

```json
{"level":"info","message":"Created purchase pur_...","timestamp":"...","service":"purchase-service","context":"PurchaseService"}
```

Wire it in at bootstrap — this replaces Nest's default logger everywhere, including
`new Logger('SomeClass')` calls throughout the app (Nest routes those through whatever logger
was passed to `NestFactory.create`):

```ts
const app = await NestFactory.create(AppModule, {
  logger: new JsonLogger('purchase-service'), // service name stamped on every line
});
```

Nest itself calls `.log(message, context)` with `context` as a plain string (the class name).
`JsonLogger` normalizes both that and an explicit `LogContext` object into the same shape, so
you don't get `{"0":"S","1":"o",...}` in your logs from a string being spread as if it were an
object (a real bug this fixed — see `json-logger.spec.ts` for the regression test).

## `CorrelationIdMiddleware`

Reads `x-correlation-id` from the incoming request, generates one (`corr_...`) if it's missing,
attaches it to `req.correlationId`, and echoes it back in the response header. The gateway
generates the id for a fresh request; every downstream call it makes forwards the same header,
so one customer-facing request has one correlation id across every service it touches.

## `RequestLoggingMiddleware`

Logs every request that hits a service — method, path, and body (with `bankAccountNumber`,
`bankCode`, `password`, `secretKey`, `authorization`, and `x-api-key` redacted) on the way in,
status code and duration on the way out:

```json
{"level":"info","message":"--> POST /purchases {\"userId\":\"...\",\"bankAccountNumber\":\"[redacted]\"}","correlationId":"corr_...","service":"purchase-service"}
{"level":"info","message":"<-- POST /purchases 201 74ms","correlationId":"corr_...","service":"purchase-service"}
```

## Wiring both middlewares in

```ts
// app.module.ts
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware, RequestLoggingMiddleware).forRoutes('*');
  }
}
```

Order matters — `CorrelationIdMiddleware` first, so `RequestLoggingMiddleware` has
`req.correlationId` already set when it logs.

## Following one request across services

Because every service uses the same `JsonLogger` shape and the same correlation id, this finds
every log line for one request across the whole stack:

```bash
docker compose logs -f | grep corr_9549580b39ee
```
