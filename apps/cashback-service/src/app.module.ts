import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BrokerModule } from '@bumpa/broker-sdk';
import { ServiceName } from '@bumpa/events-sdk';
import { CorrelationIdMiddleware, RequestLoggingMiddleware } from '@bumpa/logger-sdk';
import { CashbackModule } from './cashback/cashback.module';
import { EnvKey, getPostgresConfig, getRabbitMqConfig, validateConfig } from './config/env';
import { CashbackTransaction } from './entities/cashback-transaction.entity';
import { OutboxEvent } from './entities/outbox-event.entity';
import { PayoutAccount } from './entities/payout-account.entity';
import { ProcessedEvent } from './entities/processed-event.entity';
import { HealthController } from './health.controller';
import { CreateCashbackSchema2026082300030 } from './migrations/2026082300030-CreateCashbackSchema';
import { AddCashbackRetryTracking2026082400040 } from './migrations/2026082400040-AddCashbackRetryTracking';

const entities = [CashbackTransaction, OutboxEvent, PayoutAccount, ProcessedEvent];

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateConfig }),
    TypeOrmModule.forRoot({
      ...getPostgresConfig(EnvKey.CashbackDatabaseName),
      entities,
      migrations: [CreateCashbackSchema2026082300030, AddCashbackRetryTracking2026082400040],
      migrationsRun: true,
      synchronize: false,
    }),
    BrokerModule.forRoot({ serviceName: ServiceName.Cashback, connection: getRabbitMqConfig() }),
    CashbackModule,
  ],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware, RequestLoggingMiddleware).forRoutes('*');
  }
}
