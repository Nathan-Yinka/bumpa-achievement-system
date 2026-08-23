import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AchievementConfig } from '../entities/achievement-config.entity';
import { BadgeConfig } from '../entities/badge-config.entity';
import type { CreateAchievementConfigDto, UpdateAchievementConfigDto } from './dto/achievement-config.dto';
import type { CreateBadgeConfigDto, UpdateBadgeConfigDto } from './dto/badge-config.dto';

@Injectable()
export class AdminConfigService {
  constructor(
    @InjectRepository(AchievementConfig)
    private readonly achievementRepository: Repository<AchievementConfig>,
    @InjectRepository(BadgeConfig)
    private readonly badgeRepository: Repository<BadgeConfig>,
  ) {}

  async listAchievements(): Promise<AchievementConfig[]> {
    return this.achievementRepository.find({ order: { groupKey: 'ASC', sortOrder: 'ASC' } });
  }

  async createAchievement(dto: CreateAchievementConfigDto): Promise<AchievementConfig> {
    const achievement = this.achievementRepository.create({
      ...dto,
      active: dto.active ?? true,
    });
    return this.achievementRepository.save(achievement);
  }

  async updateAchievement(id: string, dto: UpdateAchievementConfigDto): Promise<AchievementConfig> {
    const achievement = await this.achievementRepository.findOneBy({ id });
    if (!achievement) {
      throw new NotFoundException(`Achievement config ${id} was not found`);
    }

    this.achievementRepository.merge(achievement, dto);
    return this.achievementRepository.save(achievement);
  }

  async listBadges(): Promise<BadgeConfig[]> {
    return this.badgeRepository.find({ order: { sortOrder: 'ASC' } });
  }

  async createBadge(dto: CreateBadgeConfigDto): Promise<BadgeConfig> {
    const badge = this.badgeRepository.create({
      ...dto,
      active: dto.active ?? true,
    });
    return this.badgeRepository.save(badge);
  }

  async updateBadge(id: string, dto: UpdateBadgeConfigDto): Promise<BadgeConfig> {
    const badge = await this.badgeRepository.findOneBy({ id });
    if (!badge) {
      throw new NotFoundException(`Badge config ${id} was not found`);
    }

    this.badgeRepository.merge(badge, dto);
    return this.badgeRepository.save(badge);
  }
}
