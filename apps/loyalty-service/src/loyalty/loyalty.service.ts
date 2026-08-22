import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import {
  createDomainEvent,
  createReadableId,
  DomainEventName,
  EntityIdPrefix,
  ServiceName,
  type AchievementUnlockedEvent,
  type BadgeUnlockedEvent,
  type PurchaseCompletedEvent,
} from '@bumpa/events-sdk';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AchievementConfig } from '../entities/achievement-config.entity';
import { BadgeConfig } from '../entities/badge-config.entity';
import { OutboxEvent } from '../entities/outbox-event.entity';
import { ProcessedEvent } from '../entities/processed-event.entity';
import { UserAchievement } from '../entities/user-achievement.entity';
import { UserBadge } from '../entities/user-badge.entity';
import { UserProjection } from '../entities/user-projection.entity';
import { UserStats } from '../entities/user-stats.entity';
import { RuleEngineService } from '../rules/rule-engine.service';
import type { AchievementRule } from '../rules/rule.types';

@Injectable()
export class LoyaltyService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(AchievementConfig)
    private readonly achievementRepository: Repository<AchievementConfig>,
    @InjectRepository(BadgeConfig)
    private readonly badgeRepository: Repository<BadgeConfig>,
    @InjectRepository(UserAchievement)
    private readonly userAchievementRepository: Repository<UserAchievement>,
    @InjectRepository(UserBadge)
    private readonly userBadgeRepository: Repository<UserBadge>,
    private readonly ruleEngine: RuleEngineService,
  ) {}

  async handlePurchaseCompleted(event: PurchaseCompletedEvent): Promise<void> {
    const alreadyProcessed = await this.dataSource.getRepository(ProcessedEvent).exists({
      where: { eventId: event.eventId },
    });
    if (alreadyProcessed) {
      return;
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.upsert(
        UserProjection,
        {
          id: event.payload.user.id,
          email: event.payload.user.email,
          name: event.payload.user.name,
          bankAccountNumber: event.payload.user.bankAccountNumber ?? undefined,
          bankCode: event.payload.user.bankCode ?? undefined,
        },
        ['id'],
      );

      await manager.query(
        `
          INSERT INTO user_stats ("userId", "purchaseCount", "totalSpendKobo", "updatedAt")
          VALUES ($1, 1, $2, NOW())
          ON CONFLICT ("userId")
          DO UPDATE SET
            "purchaseCount" = user_stats."purchaseCount" + 1,
            "totalSpendKobo" = user_stats."totalSpendKobo" + EXCLUDED."totalSpendKobo",
            "updatedAt" = NOW()
        `,
        [event.payload.userId, event.payload.amountKobo],
      );

      const stats = await manager.findOneByOrFail(UserStats, { userId: event.payload.userId });
      const configs = await manager.find(AchievementConfig, {
        where: { active: true },
        order: { groupKey: 'ASC', sortOrder: 'ASC' },
      });
      const existingAchievements = await manager.find(UserAchievement, {
        where: { userId: event.payload.userId },
        relations: { achievement: true },
      });
      const existingAchievementIds = new Set(existingAchievements.map((item) => item.achievementId));

      for (const config of configs) {
        if (existingAchievementIds.has(config.id)) {
          continue;
        }

        const unlocked = this.ruleEngine.evaluate(config.rule as unknown as AchievementRule, {
          purchaseCount: stats.purchaseCount,
          totalSpendKobo: stats.totalSpendKobo,
        });
        if (!unlocked) {
          continue;
        }

        await manager.save(
          UserAchievement,
          manager.create(UserAchievement, {
            id: createReadableId(EntityIdPrefix.UserAchievement),
            userId: event.payload.userId,
            achievementId: config.id,
          }),
        );
        existingAchievementIds.add(config.id);

        const achievementEvent: AchievementUnlockedEvent = createDomainEvent(
          DomainEventName.AchievementUnlocked,
          {
            achievementName: config.name,
            user: event.payload.user,
          },
          event.correlationId,
          createReadableId(EntityIdPrefix.Event),
        );

        await manager.save(
          OutboxEvent,
          manager.create(OutboxEvent, {
            id: achievementEvent.eventId,
            eventType: achievementEvent.type,
            routingKey: achievementEvent.type,
            payload: achievementEvent as unknown as Record<string, unknown>,
          }),
        );
      }

      await this.unlockBadges(manager, event);

      await manager.save(
        ProcessedEvent,
        manager.create(ProcessedEvent, {
          eventId: event.eventId,
          consumer: ServiceName.Loyalty,
        }),
      );
    });
  }

  async getAchievementState(userId: string) {
    const unlockedAchievements = await this.userAchievementRepository.find({
      where: { userId },
      relations: { achievement: true },
      order: { unlockedAt: 'ASC' },
    });
    const unlockedAchievementIds = new Set(unlockedAchievements.map((item) => item.achievementId));
    const configs = await this.achievementRepository.find({
      where: { active: true },
      order: { groupKey: 'ASC', sortOrder: 'ASC' },
    });
    const grouped = new Map<string, AchievementConfig[]>();
    for (const config of configs) {
      grouped.set(config.groupKey, [...(grouped.get(config.groupKey) ?? []), config]);
    }

    const nextAvailableAchievements = [...grouped.values()]
      .map((group) => group.find((achievement) => !unlockedAchievementIds.has(achievement.id)))
      .filter((achievement): achievement is AchievementConfig => Boolean(achievement))
      .map((achievement) => achievement.name);

    const badgeState = await this.getBadgeState(userId, unlockedAchievements.length);

    return {
      unlocked_achievements: unlockedAchievements.map((item) => item.achievement.name),
      next_available_achievements: nextAvailableAchievements,
      current_badge: badgeState.currentBadge,
      next_badge: badgeState.nextBadge,
      remaining_to_unlock_next_badge: badgeState.remainingToUnlockNextBadge,
    };
  }

  private async unlockBadges(manager: EntityManager, event: PurchaseCompletedEvent) {
    const achievementCount = await manager.count(UserAchievement, {
      where: { userId: event.payload.userId },
    });
    const badges = await manager.find(BadgeConfig, {
      where: { active: true },
      order: { sortOrder: 'ASC' },
    });
    const existingBadges = await manager.find(UserBadge, {
      where: { userId: event.payload.userId },
    });
    const existingBadgeIds = new Set(existingBadges.map((item) => item.badgeId));

    for (const badge of badges) {
      if (existingBadgeIds.has(badge.id) || achievementCount < badge.requiredAchievementCount) {
        continue;
      }

      await manager.save(
        UserBadge,
        manager.create(UserBadge, {
          id: createReadableId(EntityIdPrefix.UserBadge),
          userId: event.payload.userId,
          badgeId: badge.id,
        }),
      );

      const badgeEvent: BadgeUnlockedEvent = createDomainEvent(
        DomainEventName.BadgeUnlocked,
        {
          badgeName: badge.name,
          user: event.payload.user,
        },
        event.correlationId,
        createReadableId(EntityIdPrefix.Event),
      );

      await manager.save(
        OutboxEvent,
        manager.create(OutboxEvent, {
          id: badgeEvent.eventId,
          eventType: badgeEvent.type,
          routingKey: badgeEvent.type,
          payload: badgeEvent as unknown as Record<string, unknown>,
        }),
      );
    }
  }

  private async getBadgeState(userId: string, achievementCount: number) {
    const unlockedBadges = await this.userBadgeRepository.find({
      where: { userId },
      relations: { badge: true },
      order: { unlockedAt: 'ASC' },
    });
    const current = unlockedBadges
      .map((item) => item.badge)
      .sort((left, right) => right.sortOrder - left.sortOrder)[0];
    const unlockedBadgeIds = new Set(unlockedBadges.map((item) => item.badgeId));
    const badges = await this.badgeRepository.find({
      where: { active: true },
      order: { sortOrder: 'ASC' },
    });
    const nextBadge = badges.find((badge) => !unlockedBadgeIds.has(badge.id));

    return {
      currentBadge: current?.name ?? '',
      nextBadge: nextBadge?.name ?? '',
      remainingToUnlockNextBadge: nextBadge
        ? Math.max(nextBadge.requiredAchievementCount - achievementCount, 0)
        : 0,
    };
  }
}
