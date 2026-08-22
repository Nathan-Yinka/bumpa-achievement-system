import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BrokerModule } from '@bumpa/broker-sdk';
import { EnvKey, getPostgresConfig } from '@bumpa/config-sdk';
import { ServiceName } from '@bumpa/events-sdk';
import { CorrelationIdMiddleware } from '@bumpa/logger-sdk';
import { OutboxEvent } from './entities/outbox-event.entity';
import { Purchase } from './entities/purchase.entity';
import { User } from './entities/user.entity';
import { HealthController } from './health.controller';
import { PurchaseModule } from './purchases/purchase.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
      ...getPostgresConfig(EnvKey.PurchaseDatabaseName),
      entities: [User, Purchase, OutboxEvent],
      synchronize: process.env[EnvKey.NodeEnv] !== 'production',
    }),
    BrokerModule.forRoot({ serviceName: ServiceName.Purchase }),
    PurchaseModule,
  ],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
