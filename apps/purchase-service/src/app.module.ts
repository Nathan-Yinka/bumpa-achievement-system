import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BrokerModule } from '@bumpa/broker-sdk';
import { ServiceName } from '@bumpa/events-sdk';
import { CorrelationIdMiddleware, RequestLoggingMiddleware } from '@bumpa/logger-sdk';
import { EnvKey, getPostgresConfig, getRabbitMqConfig, validateConfig } from './config/env';
import { OutboxEvent } from './entities/outbox-event.entity';
import { Purchase } from './entities/purchase.entity';
import { User } from './entities/user.entity';
import { HealthController } from './health.controller';
import { CreatePurchaseSchema2026082300010 } from './migrations/2026082300010-CreatePurchaseSchema';
import { AddPurchaseIdempotencyKey2026082300020 } from './migrations/2026082300020-AddPurchaseIdempotencyKey';
import { DropUsersEmailUnique2026082400030 } from './migrations/2026082400030-DropUsersEmailUnique';
import { PurchaseModule } from './purchases/purchase.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateConfig }),
    TypeOrmModule.forRoot({
      ...getPostgresConfig(EnvKey.PurchaseDatabaseName),
      entities: [User, Purchase, OutboxEvent],
      migrations: [CreatePurchaseSchema2026082300010, AddPurchaseIdempotencyKey2026082300020, DropUsersEmailUnique2026082400030],
      migrationsRun: true,
      synchronize: false,
    }),
    BrokerModule.forRoot({ serviceName: ServiceName.Purchase, connection: getRabbitMqConfig() }),
    PurchaseModule,
  ],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware, RequestLoggingMiddleware).forRoutes('*');
  }
}
