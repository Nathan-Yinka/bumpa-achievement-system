import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoyaltyConfigSeederService } from '../config/loyalty-config-seeder.service';
import { AchievementConfig } from '../entities/achievement-config.entity';
import { BadgeConfig } from '../entities/badge-config.entity';
import { OutboxEvent } from '../entities/outbox-event.entity';
import { ProcessedEvent } from '../entities/processed-event.entity';
import { UserAchievement } from '../entities/user-achievement.entity';
import { UserBadge } from '../entities/user-badge.entity';
import { UserProjection } from '../entities/user-projection.entity';
import { UserStats } from '../entities/user-stats.entity';
import { PurchaseCompletedConsumer } from '../messaging/purchase-completed.consumer';
import { OutboxPublisherService } from '../outbox/outbox-publisher.service';
import { RuleEngineService } from '../rules/rule-engine.service';
import { LoyaltyController } from './loyalty.controller';
import { LoyaltyService } from './loyalty.service';

export const loyaltyEntities = [
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
  imports: [TypeOrmModule.forFeature(loyaltyEntities)],
  controllers: [LoyaltyController],
  providers: [
    LoyaltyService,
    RuleEngineService,
    LoyaltyConfigSeederService,
    PurchaseCompletedConsumer,
    OutboxPublisherService,
  ],
})
export class LoyaltyModule {}
