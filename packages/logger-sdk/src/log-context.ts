import type { JsonValue } from '@bumpa/events-sdk';

export interface LogContext {
  service: string;
  correlationId?: string;
  [key: string]: JsonValue | undefined;
}
