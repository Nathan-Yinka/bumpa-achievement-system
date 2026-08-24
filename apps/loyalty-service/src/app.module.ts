import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BrokerModule } from '@bumpa/broker-sdk';
import { ServiceName } from '@bumpa/events-sdk';
import { CorrelationIdMiddleware, RequestLoggingMiddleware } from '@bumpa/logger-sdk';
import { EnvKey, getPostgresConfig, getRabbitMqConfig, validateConfig } from './config/env';
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
import { AddBadgeAchievementRequirements2026082300040 } from './migrations/2026082300040-AddBadgeAchievementRequirements';
import { AddConfigDisplayFields2026082300050 } from './migrations/2026082300050-AddConfigDisplayFields';
import { AddAchievementBadgeIndexes2026082300060 } from './migrations/2026082300060-AddAchievementBadgeIndexes';
import { CreateLoyaltySchema2026082300020 } from './migrations/2026082300020-CreateLoyaltySchema';

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
    ConfigModule.forRoot({ isGlobal: true, validate: validateConfig }),
    TypeOrmModule.forRoot({
      ...getPostgresConfig(EnvKey.LoyaltyDatabaseName),
      entities,
      migrations: [
        CreateLoyaltySchema2026082300020,
        AddBadgeAchievementRequirements2026082300040,
        AddConfigDisplayFields2026082300050,
        AddAchievementBadgeIndexes2026082300060,
      ],
      migrationsRun: true,
      synchronize: false,
    }),
    BrokerModule.forRoot({ serviceName: ServiceName.Loyalty, connection: getRabbitMqConfig() }),
    LoyaltyModule,
  ],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware, RequestLoggingMiddleware).forRoutes('*');
  }
}
