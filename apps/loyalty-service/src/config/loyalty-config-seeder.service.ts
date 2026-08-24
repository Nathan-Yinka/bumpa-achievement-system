import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AchievementConfig } from '../entities/achievement-config.entity';
import { BadgeConfig } from '../entities/badge-config.entity';
import { DEFAULT_ACHIEVEMENTS, DEFAULT_BADGES } from './default-loyalty-config';

@Injectable()
export class LoyaltyConfigSeederService implements OnModuleInit {
  constructor(
    @InjectRepository(AchievementConfig)
    private readonly achievementRepository: Repository<AchievementConfig>,
    @InjectRepository(BadgeConfig)
    private readonly badgeRepository: Repository<BadgeConfig>,
  ) {}

  async onModuleInit(): Promise<void> {
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
