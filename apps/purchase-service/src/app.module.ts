import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BrokerModule } from '@bumpa/broker-sdk';
import { ServiceName } from '@bumpa/events-sdk';
import { CorrelationIdMiddleware } from '@bumpa/logger-sdk';
import { EnvKey, getPostgresConfig, getRabbitMqConfig, validateConfig } from './config/env';
import { OutboxEvent } from './entities/outbox-event.entity';
import { Purchase } from './entities/purchase.entity';
import { User } from './entities/user.entity';
import { HealthController } from './health.controller';
import { CreatePurchaseSchema2026082300010 } from './migrations/2026082300010-CreatePurchaseSchema';
import { PurchaseModule } from './purchases/purchase.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateConfig }),
    TypeOrmModule.forRoot({
      ...getPostgresConfig(EnvKey.PurchaseDatabaseName),
      entities: [User, Purchase, OutboxEvent],
      migrations: [CreatePurchaseSchema2026082300010],
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
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
