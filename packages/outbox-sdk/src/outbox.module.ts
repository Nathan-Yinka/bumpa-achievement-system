import { DynamicModule, Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { OUTBOX_MODULE_OPTIONS } from './outbox.constants';
import type { OutboxModuleOptions, ResolvedOutboxModuleOptions } from './outbox.types';
import { OutboxService } from './outbox.service';
import { ScheduledOutboxPublisher } from './scheduled-outbox.publisher';

@Module({})
export class OutboxModule {
  static forRoot(options: OutboxModuleOptions): DynamicModule {
    return {
      module: OutboxModule,
      imports: [ScheduleModule.forRoot()],
      providers: [
        {
          provide: OUTBOX_MODULE_OPTIONS,
          useValue: {
            batchSize: 20,
            maxAttempts: 5,
            lockTtlMs: 5000,
            pollIntervalMs: 30000,
            ...options,
          } satisfies ResolvedOutboxModuleOptions,
        },
        OutboxService,
        ScheduledOutboxPublisher,
      ],
      exports: [OutboxService, ScheduledOutboxPublisher],
    };
  }
}
