import type { LoggerService } from '@nestjs/common';
import type { LogContext } from './log-context';

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
