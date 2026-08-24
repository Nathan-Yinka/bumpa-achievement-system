import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AchievementConfig } from '../entities/achievement-config.entity';
import { BadgeConfig } from '../entities/badge-config.entity';
import { AdminConfigService } from './admin-config.service';
import { CreateAchievementConfigDto, UpdateAchievementConfigDto } from './dto/achievement-config.dto';

interface MockRepository<TEntity extends object> {
  find: jest.Mock<Promise<TEntity[]>, [{ order: Record<string, 'ASC' | 'DESC'> }]>;
  findOneBy: jest.Mock<Promise<TEntity | null>, [Record<string, string>]>;
  create: jest.Mock<TEntity, [Partial<TEntity>]>;
  merge: jest.Mock<TEntity, [TEntity, Partial<TEntity>]>;
  save: jest.Mock<Promise<TEntity>, [TEntity]>;
  createQueryBuilder: jest.Mock;
}

function createRepository<TEntity extends object>(): MockRepository<TEntity> {
  return {
    find: jest.fn(),
    findOneBy: jest.fn(),
    create: jest.fn((entity) => entity as TEntity),
    merge: jest.fn((entity, dto) => Object.assign(entity, dto)),
    save: jest.fn(async (entity) => entity),
    createQueryBuilder: jest.fn(),
  };
}

function fakeQueryBuilder<TEntity>(items: TEntity[], total: number) {
  const qb: Record<string, jest.Mock> = {};
  qb.orderBy = jest.fn(() => qb);
  qb.addOrderBy = jest.fn(() => qb);
  qb.andWhere = jest.fn(() => qb);
  qb.skip = jest.fn(() => qb);
  qb.take = jest.fn(() => qb);
  qb.getManyAndCount = jest.fn(async () => [items, total]);
  return qb;
}

describe('AdminConfigService', () => {
  let service: AdminConfigService;
  let achievements: MockRepository<AchievementConfig>;
  let badges: MockRepository<BadgeConfig>;

  beforeEach(async () => {
    achievements = createRepository<AchievementConfig>();
    badges = createRepository<BadgeConfig>();

    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminConfigService,
        { provide: getRepositoryToken(AchievementConfig), useValue: achievements },
        { provide: getRepositoryToken(BadgeConfig), useValue: badges },
      ],
    }).compile();

    service = moduleRef.get(AdminConfigService);
  });

  it('creates active achievement config by default', async () => {
    const result = await service.createAchievement({
      id: 'ach_20_purchases',
      name: '20 Purchases',
      description: 'Complete 20 purchases.',
      groupKey: 'purchases',
      sortOrder: 4,
      rule: { type: 'COUNT', field: 'purchase_count', operator: 'GTE', value: 20 },
    });

    expect(result.active).toBe(true);
    expect(result.description).toBe('Complete 20 purchases.');
    expect(achievements.save).toHaveBeenCalledWith(expect.objectContaining({ id: 'ach_20_purchases' }));
  });

  it('updates an existing badge config', async () => {
    badges.findOneBy.mockResolvedValue({
      id: 'bdg_advanced',
      name: 'Advanced',
      description: 'Advanced customers.',
      sortOrder: 3,
      requiredAchievementCount: 5,
      requiredAchievementIds: [],
      rewardAmountKobo: 30000,
      rewardCurrency: 'NGN',
      active: true,
      users: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await service.updateBadge('bdg_advanced', { requiredAchievementCount: 8 });

    expect(result.requiredAchievementCount).toBe(8);
    expect(badges.save).toHaveBeenCalledWith(expect.objectContaining({ requiredAchievementCount: 8 }));
  });

  it('creates badge config with default reward values', async () => {
    achievements.find.mockResolvedValue([{ id: 'ach_first_purchase' } as AchievementConfig]);

    const result = await service.createBadge({
      id: 'bdg_elite',
      name: 'Elite',
      description: 'Elite customers.',
      sortOrder: 4,
      requiredAchievementCount: 6,
      requiredAchievementIds: ['ach_first_purchase'],
    });

    expect(result.rewardAmountKobo).toBe(30000);
    expect(result.rewardCurrency).toBe('NGN');
    expect(result.requiredAchievementIds).toEqual(['ach_first_purchase']);
  });

  it('rejects creating a badge that references a nonexistent achievement id', async () => {
    achievements.find.mockResolvedValue([]);

    await expect(
      service.createBadge({
        id: 'bdg_elite',
        name: 'Elite',
        description: 'Elite customers.',
        sortOrder: 4,
        requiredAchievementCount: 6,
        requiredAchievementIds: ['ach_does_not_exist'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(badges.save).not.toHaveBeenCalled();
  });

  it('rejects updating a badge to reference a nonexistent achievement id', async () => {
    badges.findOneBy.mockResolvedValue({
      id: 'bdg_advanced',
      name: 'Advanced',
      description: 'Advanced customers.',
      sortOrder: 3,
      requiredAchievementCount: 5,
      requiredAchievementIds: [],
      rewardAmountKobo: 30000,
      rewardCurrency: 'NGN',
      active: true,
      users: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    achievements.find.mockResolvedValue([]);

    await expect(
      service.updateBadge('bdg_advanced', { requiredAchievementIds: ['ach_does_not_exist'] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(badges.save).not.toHaveBeenCalled();
  });

  it('returns a structured catalog with badge achievement links', async () => {
    achievements.find.mockResolvedValue([
      {
        id: 'ach_first_purchase',
        name: 'First Purchase',
        description: 'Make your first purchase.',
        groupKey: 'purchases',
        sortOrder: 1,
        rule: { type: 'COUNT', field: 'purchase_count', operator: 'GTE', value: 1 },
        imageUrl: undefined,
        active: true,
        users: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    badges.find.mockResolvedValue([
      {
        id: 'bdg_beginner',
        name: 'Beginner',
        description: 'First badge.',
        sortOrder: 1,
        requiredAchievementCount: 1,
        requiredAchievementIds: ['ach_first_purchase'],
        rewardAmountKobo: 30000,
        rewardCurrency: 'NGN',
        imageUrl: undefined,
        active: true,
        users: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const result = await service.getCatalog();

    expect(result.badges).toEqual([
      expect.objectContaining({
        id: 'bdg_beginner',
        requiredAchievements: [expect.objectContaining({ id: 'ach_first_purchase' })],
      }),
    ]);
  });

  it('throws when updating a missing achievement config', async () => {
    achievements.findOneBy.mockResolvedValue(null);

    await expect(service.updateAchievement('ach_missing', { active: false })).rejects.toBeInstanceOf(NotFoundException);
  });

  describe('rule shape validation', () => {
    const malformedRule = { type: 'COUNT', field: 'purchase_count', operator: 'GTE' }; // missing numeric value

    it('rejects a malformed rule on CreateAchievementConfigDto', async () => {
      const dto = plainToInstance(CreateAchievementConfigDto, {
        id: 'ach_bad',
        name: 'Bad Rule',
        description: 'Broken.',
        groupKey: 'purchases',
        sortOrder: 1,
        rule: malformedRule,
      });

      const errors = await validate(dto);

      expect(errors.some((error) => error.property === 'rule')).toBe(true);
    });

    it('rejects a malformed rule on UpdateAchievementConfigDto', async () => {
      const dto = plainToInstance(UpdateAchievementConfigDto, { rule: malformedRule });

      const errors = await validate(dto);

      expect(errors.some((error) => error.property === 'rule')).toBe(true);
    });

    it('accepts a well-formed COMBINATION rule with nested ACHIEVEMENT_SET rule', async () => {
      const dto = plainToInstance(CreateAchievementConfigDto, {
        id: 'ach_good',
        name: 'Good Rule',
        description: 'Valid.',
        groupKey: 'purchases',
        sortOrder: 1,
        rule: {
          type: 'COMBINATION',
          operator: 'AND',
          rules: [
            { type: 'COUNT', field: 'purchase_count', operator: 'GTE', value: 5 },
            { type: 'ACHIEVEMENT_SET', achievementIds: ['ach_first_purchase'], minRequired: 1 },
          ],
        },
      });

      const errors = await validate(dto);

      expect(errors.some((error) => error.property === 'rule')).toBe(false);
    });
  });

  describe('pagination', () => {
    it('paginates achievements with default paging and search/groupKey filters', async () => {
      const achievement = {
        id: 'ach_first_purchase',
        name: 'First Purchase',
        description: 'desc',
        groupKey: 'purchases',
        sortOrder: 1,
        rule: { type: 'COUNT', field: 'purchase_count', operator: 'GTE', value: 1 },
        active: true,
      } as AchievementConfig;
      const qb = fakeQueryBuilder([achievement], 1);
      achievements.createQueryBuilder.mockReturnValue(qb);

      const result = await service.listAchievements({ page: 1, limit: 20, groupKey: 'purchases', search: 'first' });

      expect(qb.andWhere).toHaveBeenCalledWith('achievement.groupKey = :groupKey', { groupKey: 'purchases' });
      expect(qb.andWhere).toHaveBeenCalledWith(expect.anything());
      expect(qb.skip).toHaveBeenCalledWith(0);
      expect(qb.take).toHaveBeenCalledWith(20);
      expect(result.meta).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
      expect(result.items).toHaveLength(1);
    });

    it('paginates badges honoring page/limit and computes totalPages', async () => {
      const badge = {
        id: 'bdg_beginner',
        name: 'Beginner',
        description: 'desc',
        sortOrder: 1,
        requiredAchievementCount: 1,
        requiredAchievementIds: ['ach_first_purchase'],
        rewardAmountKobo: 30000,
        rewardCurrency: 'NGN',
        active: true,
      } as BadgeConfig;
      const qb = fakeQueryBuilder([badge], 25);
      badges.createQueryBuilder.mockReturnValue(qb);

      const result = await service.listBadges({ page: 2, limit: 10 });

      expect(qb.skip).toHaveBeenCalledWith(10);
      expect(qb.take).toHaveBeenCalledWith(10);
      expect(result.meta).toEqual({ page: 2, limit: 10, total: 25, totalPages: 3 });
    });
  });
});
