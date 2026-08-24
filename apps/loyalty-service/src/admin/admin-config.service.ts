import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Repository } from 'typeorm';
import { AchievementConfig } from '../entities/achievement-config.entity';
import { BadgeConfig } from '../entities/badge-config.entity';
import type { CreateAchievementConfigDto, UpdateAchievementConfigDto } from './dto/achievement-config.dto';
import type { CreateBadgeConfigDto, UpdateBadgeConfigDto } from './dto/badge-config.dto';
import type {
  AchievementConfigResponseDto,
  BadgeCatalogItemDto,
  BadgeConfigResponseDto,
  LoyaltyConfigCatalogResponseDto,
  PaginatedAchievementConfigResponseDto,
  PaginatedBadgeConfigResponseDto,
} from './dto/config-response.dto';
import type { ListAchievementConfigQueryDto, ListConfigQueryDto } from './dto/list-config-query.dto';

@Injectable()
export class AdminConfigService {
  constructor(
    @InjectRepository(AchievementConfig)
    private readonly achievementRepository: Repository<AchievementConfig>,
    @InjectRepository(BadgeConfig)
    private readonly badgeRepository: Repository<BadgeConfig>,
  ) {}

  async listAchievements(query: ListAchievementConfigQueryDto = {}): Promise<PaginatedAchievementConfigResponseDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const qb = this.achievementRepository
      .createQueryBuilder('achievement')
      .orderBy('achievement.groupKey', 'ASC')
      .addOrderBy('achievement.sortOrder', 'ASC');

    if (query.groupKey) {
      qb.andWhere('achievement.groupKey = :groupKey', { groupKey: query.groupKey });
    }
    if (query.active !== undefined) {
      qb.andWhere('achievement.active = :active', { active: query.active });
    }
    if (query.search) {
      const search = `%${query.search}%`;
      qb.andWhere(
        new Brackets((sub) => {
          sub.where('achievement.name ILIKE :search', { search }).orWhere('achievement.description ILIKE :search', { search });
        }),
      );
    }

    const [achievements, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      items: achievements.map((achievement) => this.toAchievementResponse(achievement)),
      meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  async createAchievement(dto: CreateAchievementConfigDto): Promise<AchievementConfigResponseDto> {
    const achievement = this.achievementRepository.create({
      ...dto,
      active: dto.active ?? true,
    });
    return this.toAchievementResponse(await this.achievementRepository.save(achievement));
  }

  async updateAchievement(id: string, dto: UpdateAchievementConfigDto): Promise<AchievementConfigResponseDto> {
    const achievement = await this.achievementRepository.findOneBy({ id });
    if (!achievement) {
      throw new NotFoundException(`Achievement config ${id} was not found`);
    }

    this.achievementRepository.merge(achievement, dto);
    return this.toAchievementResponse(await this.achievementRepository.save(achievement));
  }

  async listBadges(query: ListConfigQueryDto = {}): Promise<PaginatedBadgeConfigResponseDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const qb = this.badgeRepository.createQueryBuilder('badge').orderBy('badge.sortOrder', 'ASC');

    if (query.active !== undefined) {
      qb.andWhere('badge.active = :active', { active: query.active });
    }
    if (query.search) {
      const search = `%${query.search}%`;
      qb.andWhere(
        new Brackets((sub) => {
          sub.where('badge.name ILIKE :search', { search }).orWhere('badge.description ILIKE :search', { search });
        }),
      );
    }

    const [badges, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      items: badges.map((badge) => this.toBadgeResponse(badge)),
      meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  async createBadge(dto: CreateBadgeConfigDto): Promise<BadgeConfigResponseDto> {
    await this.assertAchievementsExist(dto.requiredAchievementIds ?? []);

    const badge = this.badgeRepository.create({
      ...dto,
      requiredAchievementIds: dto.requiredAchievementIds ?? [],
      rewardAmountKobo: dto.rewardAmountKobo ?? 30000,
      rewardCurrency: dto.rewardCurrency ?? 'NGN',
      active: dto.active ?? true,
    });
    return this.toBadgeResponse(await this.badgeRepository.save(badge));
  }

  async updateBadge(id: string, dto: UpdateBadgeConfigDto): Promise<BadgeConfigResponseDto> {
    const badge = await this.badgeRepository.findOneBy({ id });
    if (!badge) {
      throw new NotFoundException(`Badge config ${id} was not found`);
    }

    if (dto.requiredAchievementIds !== undefined) {
      await this.assertAchievementsExist(dto.requiredAchievementIds);
    }

    this.badgeRepository.merge(badge, dto);
    return this.toBadgeResponse(await this.badgeRepository.save(badge));
  }

  private async assertAchievementsExist(achievementIds: string[]): Promise<void> {
    if (achievementIds.length === 0) {
      return;
    }

    const uniqueIds = [...new Set(achievementIds)];
    const existing = await this.achievementRepository.find({ where: { id: In(uniqueIds) } });
    const existingIds = new Set(existing.map((achievement) => achievement.id));
    const missingIds = uniqueIds.filter((id) => !existingIds.has(id));

    if (missingIds.length > 0) {
      throw new BadRequestException(
        `requiredAchievementIds references unknown achievement config(s): ${missingIds.join(', ')}`,
      );
    }
  }

  async getCatalog(): Promise<LoyaltyConfigCatalogResponseDto> {
    const achievements = await this.achievementRepository.find({ order: { groupKey: 'ASC', sortOrder: 'ASC' } });
    const badges = await this.badgeRepository.find({ order: { sortOrder: 'ASC' } });
    const achievementResponses = achievements.map((achievement) => this.toAchievementResponse(achievement));
    const achievementsById = new Map(achievementResponses.map((achievement) => [achievement.id, achievement]));

    return {
      achievements: achievementResponses,
      badges: badges.map((badge) => this.toBadgeCatalogItem(badge, achievementsById)),
    };
  }

  private toAchievementResponse(achievement: AchievementConfig): AchievementConfigResponseDto {
    return {
      id: achievement.id,
      name: achievement.name,
      description: achievement.description,
      groupKey: achievement.groupKey,
      sortOrder: achievement.sortOrder,
      rule: achievement.rule,
      imageUrl: achievement.imageUrl,
      active: achievement.active,
    };
  }

  private toBadgeResponse(badge: BadgeConfig): BadgeConfigResponseDto {
    return {
      id: badge.id,
      name: badge.name,
      description: badge.description,
      sortOrder: badge.sortOrder,
      requiredAchievementCount: badge.requiredAchievementCount,
      requiredAchievementIds: badge.requiredAchievementIds,
      rewardAmountKobo: badge.rewardAmountKobo,
      rewardCurrency: badge.rewardCurrency,
      imageUrl: badge.imageUrl,
      active: badge.active,
    };
  }

  private toBadgeCatalogItem(
    badge: BadgeConfig,
    achievementsById: ReadonlyMap<string, AchievementConfigResponseDto>,
  ): BadgeCatalogItemDto {
    return {
      ...this.toBadgeResponse(badge),
      requiredAchievements: badge.requiredAchievementIds
        .map((achievementId) => achievementsById.get(achievementId))
        .filter((achievement): achievement is AchievementConfigResponseDto => Boolean(achievement)),
    };
  }
}
