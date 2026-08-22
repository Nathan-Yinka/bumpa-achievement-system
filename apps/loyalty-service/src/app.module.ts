import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BrokerModule } from '@bumpa/broker-sdk';
import { ServiceName } from '@bumpa/events-sdk';
import { CorrelationIdMiddleware } from '@bumpa/logger-sdk';
import { AchievementConfig } from './entities/achievement-config.entity';
import { BadgeConfig } from './entities/badge-config.entity';
import { OutboxEvent } from './entities/outbox-event.entity';
import { ProcessedEvent } from './entities/processed-event.entity';
import { UserAchievement } from './entities/user-achievement.entity';
import { UserBadge } from './entities/user-badge.entity';
import { UserProjection } from './entities/user-projection.entity';
import { UserStats } from './entities/user-stats.entity';
import { HealthController } from './health.controller';
import { LoyaltyModule } from './loyalty/loyalty.module';

const entities = [
  AchievementConfig,
  BadgeConfig,
  OutboxEvent,
  ProcessedEvent,
  UserAchievement,
  UserBadge,
  UserProjection,
  UserStats,
];

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.LOYALTY_DATABASE_URL,
      entities,
      synchronize: process.env.NODE_ENV !== 'production',
    }),
    BrokerModule.forRoot({ serviceName: ServiceName.Loyalty }),
    LoyaltyModule,
  ],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
