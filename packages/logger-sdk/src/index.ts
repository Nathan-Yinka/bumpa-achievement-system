import { randomBytes } from 'node:crypto';
import type { LoggerService, NestMiddleware } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

export const CORRELATION_ID_HEADER = 'x-correlation-id';

export interface LogContext {
  service: string;
  correlationId?: string;
  [key: string]: unknown;
}

export class JsonLogger implements LoggerService {
  constructor(private readonly service: string) {}

  log(message: string, context: LogContext = { service: this.service }): void {
    this.write('info', message, context);
  }

  error(message: string, trace?: string, context: LogContext = { service: this.service }): void {
    this.write('error', message, { ...context, trace });
  }

  warn(message: string, context: LogContext = { service: this.service }): void {
    this.write('warn', message, context);
  }

  debug(message: string, context: LogContext = { service: this.service }): void {
    this.write('debug', message, context);
  }

  private write(level: string, message: string, context: LogContext): void {
    process.stdout.write(
      `${JSON.stringify({
        level,
        message,
        timestamp: new Date().toISOString(),
        ...context,
        service: this.service,
      })}\n`,
    );
  }
}

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request & { correlationId?: string }, res: Response, next: NextFunction): void {
    const incoming = req.header(CORRELATION_ID_HEADER);
    const correlationId = incoming && incoming.length > 0 ? incoming : `corr_${randomBytes(6).toString('hex')}`;
    req.correlationId = correlationId;
    res.setHeader(CORRELATION_ID_HEADER, correlationId);
    next();
  }
}
