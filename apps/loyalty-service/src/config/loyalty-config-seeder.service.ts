import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AchievementConfig } from '../entities/achievement-config.entity';
import { AchievementGroup } from '../entities/achievement-group.entity';
import { BadgeConfig } from '../entities/badge-config.entity';
import { DEFAULT_ACHIEVEMENT_GROUPS, DEFAULT_ACHIEVEMENTS, DEFAULT_BADGES } from './default-loyalty-config';

@Injectable()
export class LoyaltyConfigSeederService implements OnModuleInit {
  constructor(
    @InjectRepository(AchievementGroup)
    private readonly achievementGroupRepository: Repository<AchievementGroup>,
    @InjectRepository(AchievementConfig)
    private readonly achievementRepository: Repository<AchievementConfig>,
    @InjectRepository(BadgeConfig)
    private readonly badgeRepository: Repository<BadgeConfig>,
  ) {}

  async onModuleInit(): Promise<void> {
    // Groups first — achievements below have a foreign key into this table.
    const existingGroupKeys = new Set(
      (await this.achievementGroupRepository.find({ select: ['key'] })).map((group) => group.key),
    );
    const missingGroups = DEFAULT_ACHIEVEMENT_GROUPS.filter((group) => !existingGroupKeys.has(group.key));
    if (missingGroups.length > 0) {
      await this.achievementGroupRepository.insert(missingGroups);
    }

    // Only inserts achievements/badges that don't exist yet; never touches existing rows.
    const existingAchievementIds = new Set(
      (await this.achievementRepository.find({ select: ['id'] })).map((achievement) => achievement.id),
    );
    const missingAchievements = DEFAULT_ACHIEVEMENTS.filter(
      (achievement) => !existingAchievementIds.has(achievement.id),
    );
    if (missingAchievements.length > 0) {
      await this.achievementRepository.insert(
        missingAchievements.map((achievement) =>
          this.achievementRepository.create({
            ...achievement,
            rule: achievement.rule,
          }),
        ),
      );
    }

    const existingBadgeIds = new Set((await this.badgeRepository.find({ select: ['id'] })).map((badge) => badge.id));
    const missingBadges = DEFAULT_BADGES.filter((badge) => !existingBadgeIds.has(badge.id));
    if (missingBadges.length > 0) {
      await this.badgeRepository.insert(
        missingBadges.map((badge) =>
          this.badgeRepository.create({
            ...badge,
            requiredAchievementIds: badge.requiredAchievementIds ?? [],
            rewardAmountKobo: badge.rewardAmountKobo ?? 30000,
            rewardCurrency: badge.rewardCurrency ?? 'NGN',
          }),
        ),
      );
    }
  }
}
