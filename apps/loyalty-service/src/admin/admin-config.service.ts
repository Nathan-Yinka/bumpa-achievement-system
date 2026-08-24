import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, FindOptionsWhere, ILike, In, MoreThanOrEqual, Not, Repository } from 'typeorm';
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
  private readonly logger = new Logger(AdminConfigService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(AchievementConfig)
    private readonly achievementRepository: Repository<AchievementConfig>,
    @InjectRepository(BadgeConfig)
    private readonly badgeRepository: Repository<BadgeConfig>,
  ) {}

  async listAchievements(query: ListAchievementConfigQueryDto = {}): Promise<PaginatedAchievementConfigResponseDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const [achievements, total] = await this.achievementRepository.findAndCount({
      where: this.buildAchievementWhere(query),
      order: { groupKey: 'ASC', sortOrder: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      items: achievements.map((achievement) => this.toAchievementResponse(achievement)),
      meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  async createAchievement(dto: CreateAchievementConfigDto): Promise<AchievementConfigResponseDto> {
    const result = await this.dataSource.transaction(async (manager) => {
      await this.makeRoomForAchievementSortOrder(manager, dto.groupKey, dto.sortOrder);

      const achievement = manager.create(AchievementConfig, { ...dto, active: dto.active ?? true });
      return this.toAchievementResponse(await manager.save(AchievementConfig, achievement));
    });
    this.logger.log(`Created achievement config ${result.id} ("${result.name}", group "${result.groupKey}", sortOrder ${result.sortOrder})`);
    return result;
  }

  async updateAchievement(id: string, dto: UpdateAchievementConfigDto): Promise<AchievementConfigResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      const achievement = await manager.findOneBy(AchievementConfig, { id });
      if (!achievement) {
        throw new NotFoundException(`Achievement config ${id} was not found`);
      }

      const targetGroupKey = dto.groupKey ?? achievement.groupKey;
      const targetSortOrder = dto.sortOrder ?? achievement.sortOrder;
      const positionChanged = targetGroupKey !== achievement.groupKey || targetSortOrder !== achievement.sortOrder;
      if (positionChanged) {
        await this.makeRoomForAchievementSortOrder(manager, targetGroupKey, targetSortOrder, id);
      }

      manager.merge(AchievementConfig, achievement, dto);
      const updated = this.toAchievementResponse(await manager.save(AchievementConfig, achievement));
      this.logger.log(`Updated achievement config ${updated.id} (${JSON.stringify(dto)})`);
      return updated;
    });
  }

  async listBadges(query: ListConfigQueryDto = {}): Promise<PaginatedBadgeConfigResponseDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const [badges, total] = await this.badgeRepository.findAndCount({
      where: this.buildBadgeWhere(query),
      order: { sortOrder: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      items: badges.map((badge) => this.toBadgeResponse(badge)),
      meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  async createBadge(dto: CreateBadgeConfigDto): Promise<BadgeConfigResponseDto> {
    await this.assertAchievementsExist(dto.requiredAchievementIds ?? []);

    const result = await this.dataSource.transaction(async (manager) => {
      await this.makeRoomForBadgeSortOrder(manager, dto.sortOrder);

      const badge = manager.create(BadgeConfig, {
        ...dto,
        requiredAchievementIds: dto.requiredAchievementIds ?? [],
        rewardAmountKobo: dto.rewardAmountKobo ?? 30000,
        rewardCurrency: dto.rewardCurrency ?? 'NGN',
        active: dto.active ?? true,
      });
      return this.toBadgeResponse(await manager.save(BadgeConfig, badge));
    });
    this.logger.log(`Created badge config ${result.id} ("${result.name}", sortOrder ${result.sortOrder})`);
    return result;
  }

  async updateBadge(id: string, dto: UpdateBadgeConfigDto): Promise<BadgeConfigResponseDto> {
    if (dto.requiredAchievementIds !== undefined) {
      await this.assertAchievementsExist(dto.requiredAchievementIds);
    }

    return this.dataSource.transaction(async (manager) => {
      const badge = await manager.findOneBy(BadgeConfig, { id });
      if (!badge) {
        throw new NotFoundException(`Badge config ${id} was not found`);
      }

      if (dto.sortOrder !== undefined && dto.sortOrder !== badge.sortOrder) {
        await this.makeRoomForBadgeSortOrder(manager, dto.sortOrder, id);
      }

      manager.merge(BadgeConfig, badge, dto);
      const updated = this.toBadgeResponse(await manager.save(BadgeConfig, badge));
      this.logger.log(`Updated badge config ${updated.id} (${JSON.stringify(dto)})`);
      return updated;
    });
  }

  // Insert-at-position behavior: shift later items down within the same group.
  private async makeRoomForAchievementSortOrder(
    manager: EntityManager,
    groupKey: string,
    targetSortOrder: number,
    excludeId?: string,
  ): Promise<void> {
    await manager.increment(
      AchievementConfig,
      {
        groupKey,
        sortOrder: MoreThanOrEqual(targetSortOrder),
        ...(excludeId ? { id: Not(excludeId) } : {}),
      },
      'sortOrder',
      1,
    );
  }

  private async makeRoomForBadgeSortOrder(
    manager: EntityManager,
    targetSortOrder: number,
    excludeId?: string,
  ): Promise<void> {
    await manager.increment(
      BadgeConfig,
      {
        sortOrder: MoreThanOrEqual(targetSortOrder),
        ...(excludeId ? { id: Not(excludeId) } : {}),
      },
      'sortOrder',
      1,
    );
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

  private buildAchievementWhere(
    query: ListAchievementConfigQueryDto,
  ): FindOptionsWhere<AchievementConfig> | FindOptionsWhere<AchievementConfig>[] {
    const baseWhere: FindOptionsWhere<AchievementConfig> = {
      ...(query.groupKey ? { groupKey: query.groupKey } : {}),
      ...(query.active !== undefined ? { active: query.active } : {}),
    };
    if (!query.search) {
      return baseWhere;
    }

    const search = ILike(`%${query.search}%`);
    return [{ ...baseWhere, name: search }, { ...baseWhere, description: search }];
  }

  private buildBadgeWhere(query: ListConfigQueryDto): FindOptionsWhere<BadgeConfig> | FindOptionsWhere<BadgeConfig>[] {
    const baseWhere: FindOptionsWhere<BadgeConfig> = {
      ...(query.active !== undefined ? { active: query.active } : {}),
    };
    if (!query.search) {
      return baseWhere;
    }

    const search = ILike(`%${query.search}%`);
    return [{ ...baseWhere, name: search }, { ...baseWhere, description: search }];
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
