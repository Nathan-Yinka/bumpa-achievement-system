import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BrokerModule } from '@bumpa/broker-sdk';
import { EnvKey, getPostgresConfig } from '@bumpa/config-sdk';
import { ServiceName } from '@bumpa/events-sdk';
import { CorrelationIdMiddleware } from '@bumpa/logger-sdk';
import { CashbackModule } from './cashback/cashback.module';
import { CashbackTransaction } from './entities/cashback-transaction.entity';
import { OutboxEvent } from './entities/outbox-event.entity';
import { ProcessedEvent } from './entities/processed-event.entity';
import { HealthController } from './health.controller';

const entities = [CashbackTransaction, OutboxEvent, ProcessedEvent];

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
      ...getPostgresConfig(EnvKey.CashbackDatabaseName),
      entities,
      synchronize: process.env[EnvKey.NodeEnv] !== 'production',
    }),
    BrokerModule.forRoot({ serviceName: ServiceName.Cashback }),
    CashbackModule,
  ],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
