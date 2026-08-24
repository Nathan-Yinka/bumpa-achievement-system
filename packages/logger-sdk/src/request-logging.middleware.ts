import { Injectable, Logger, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

// Keep sensitive request fields out of logs.
const REDACTED_KEYS = new Set(['bankAccountNumber', 'bankCode', 'password', 'secretKey', 'authorization', 'x-api-key']);

@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request & { correlationId?: string }, res: Response, next: NextFunction): void {
    const startedAt = Date.now();
    const { method, originalUrl } = req;

    this.logger.log(`--> ${method} ${originalUrl}${this.formatBody(req.body)}`, { correlationId: req.correlationId });

    res.on('finish', () => {
      const durationMs = Date.now() - startedAt;
      this.logger.log(`<-- ${method} ${originalUrl} ${res.statusCode} ${durationMs}ms`, { correlationId: req.correlationId });
    });

    next();
  }

  private formatBody(body: unknown): string {
    if (!body || typeof body !== 'object' || Object.keys(body).length === 0) {
      return '';
    }

    return ` ${JSON.stringify(redact(body))}`;
  }
}

function redact(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redact);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
        key,
        REDACTED_KEYS.has(key) ? '[redacted]' : redact(nested),
      ]),
    );
  }

  return value;
}
