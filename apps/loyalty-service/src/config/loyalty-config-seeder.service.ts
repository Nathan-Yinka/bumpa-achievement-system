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
    await this.achievementRepository.save(
      DEFAULT_ACHIEVEMENTS.map((achievement) =>
        this.achievementRepository.create({
          ...achievement,
          rule: achievement.rule,
        }),
      ),
    );
    await this.badgeRepository.save(
      DEFAULT_BADGES.map((badge) => this.badgeRepository.create(badge)),
    );
  }
}
