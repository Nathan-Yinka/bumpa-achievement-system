import type { LoggerService } from '@nestjs/common';
import type { LogContext } from './log-context';

export class JsonLogger implements LoggerService {
  constructor(private readonly service: string) {}

  log(message: string, context?: string | LogContext): void {
    this.write('info', message, this.normalizeContext(context));
  }

  error(message: string, trace?: string, context?: string | LogContext): void {
    this.write('error', message, { ...this.normalizeContext(context), trace });
  }

  warn(message: string, context?: string | LogContext): void {
    this.write('warn', message, this.normalizeContext(context));
  }

  debug(message: string, context?: string | LogContext): void {
    this.write('debug', message, this.normalizeContext(context));
  }

  /** Nest passes a plain string as context (the class name); this SDK expects a LogContext object. Handle both. */
  private normalizeContext(context?: string | LogContext): LogContext {
    if (context === undefined) {
      return { service: this.service };
    }

    if (typeof context === 'string') {
      return { service: this.service, context };
    }

    return context;
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
