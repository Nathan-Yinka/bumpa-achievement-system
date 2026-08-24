import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AchievementConfig } from '../entities/achievement-config.entity';
import { BadgeConfig } from '../entities/badge-config.entity';
import { AdminConfigService } from './admin-config.service';
import { CreateAchievementConfigDto, UpdateAchievementConfigDto } from './dto/achievement-config.dto';

interface MockRepository<TEntity extends object> {
  find: jest.Mock;
  findAndCount: jest.Mock;
  findOneBy: jest.Mock<Promise<TEntity | null>, [Record<string, string>]>;
}

function createRepository<TEntity extends object>(): MockRepository<TEntity> {
  return {
    find: jest.fn(),
    findAndCount: jest.fn(),
    findOneBy: jest.fn(),
  };
}

describe('AdminConfigService', () => {
  let service: AdminConfigService;
  let achievements: MockRepository<AchievementConfig>;
  let badges: MockRepository<BadgeConfig>;
  let manager: {
    findOneBy: jest.Mock;
    create: jest.Mock;
    merge: jest.Mock;
    save: jest.Mock;
    increment: jest.Mock;
  };
  let dataSource: { transaction: jest.Mock };

  beforeEach(async () => {
    achievements = createRepository<AchievementConfig>();
    badges = createRepository<BadgeConfig>();
    manager = {
      findOneBy: jest.fn(),
      create: jest.fn((_entity, data) => data),
      merge: jest.fn((_entity, target, dto) => Object.assign(target, dto)),
      save: jest.fn(async (_entity, data) => data),
      increment: jest.fn(async () => ({ affected: 0 })),
    };
    dataSource = {
      transaction: jest.fn(async (callback: (m: typeof manager) => Promise<unknown>) => callback(manager)),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminConfigService,
        { provide: getDataSourceToken(), useValue: dataSource },
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
    expect(manager.save).toHaveBeenCalledWith(AchievementConfig, expect.objectContaining({ id: 'ach_20_purchases' }));
  });

  it('updates an existing badge config', async () => {
    manager.findOneBy.mockResolvedValue({
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
    expect(manager.save).toHaveBeenCalledWith(BadgeConfig, expect.objectContaining({ requiredAchievementCount: 8 }));
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
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('rejects updating a badge to reference a nonexistent achievement id', async () => {
    manager.findOneBy.mockResolvedValue({
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
    expect(manager.save).not.toHaveBeenCalled();
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
    manager.findOneBy.mockResolvedValue(null);

    await expect(service.updateAchievement('ach_missing', { active: false })).rejects.toBeInstanceOf(NotFoundException);
  });

  describe('sortOrder collisions ("make room" auto-shift)', () => {
    it('bumps every achievement at or after the target sortOrder, scoped to the same group', async () => {
      await service.createAchievement({
        id: 'ach_new',
        name: 'New',
        description: 'desc',
        groupKey: 'purchases',
        sortOrder: 4,
        rule: { type: 'COUNT', field: 'purchase_count', operator: 'GTE', value: 1 },
      });

      expect(manager.increment).toHaveBeenCalledWith(
        AchievementConfig,
        expect.objectContaining({ groupKey: 'purchases', sortOrder: expect.anything() }),
        'sortOrder',
        1,
      );
    });

    it('excludes the achievement itself when moving it to a genuinely different position', async () => {
      manager.findOneBy.mockResolvedValue({
        id: 'ach_first_purchase',
        groupKey: 'purchases',
        sortOrder: 1,
      });

      await service.updateAchievement('ach_first_purchase', { sortOrder: 3 });

      expect(manager.increment).toHaveBeenCalledWith(
        AchievementConfig,
        expect.objectContaining({ groupKey: 'purchases', id: expect.anything(), sortOrder: expect.anything() }),
        'sortOrder',
        1,
      );
    });

    it('does not touch sortOrder for an update that does not mention it', async () => {
      manager.findOneBy.mockResolvedValue({ id: 'ach_1', groupKey: 'purchases', sortOrder: 1, active: true });

      await service.updateAchievement('ach_1', { active: false });

      expect(manager.increment).not.toHaveBeenCalled();
    });

    it('is a no-op when sortOrder is set to the value it already has', async () => {
      manager.findOneBy.mockResolvedValue({ id: 'ach_1', groupKey: 'purchases', sortOrder: 2, active: true });

      await service.updateAchievement('ach_1', { sortOrder: 2 });

      expect(manager.increment).not.toHaveBeenCalled();
    });

    it('is a no-op for a badge update that sets sortOrder to its current value', async () => {
      manager.findOneBy.mockResolvedValue({ id: 'bdg_1', sortOrder: 2, requiredAchievementIds: [] });

      await service.updateBadge('bdg_1', { sortOrder: 2 });

      expect(manager.increment).not.toHaveBeenCalled();
    });

    it('bumps every badge at or after the target sortOrder globally, with no scope filter', async () => {
      achievements.find.mockResolvedValue([]);

      await service.createBadge({
        id: 'bdg_new',
        name: 'New',
        description: 'desc',
        sortOrder: 4,
        requiredAchievementCount: 1,
      });

      expect(manager.increment).toHaveBeenCalledWith(
        BadgeConfig,
        expect.not.objectContaining({ groupKey: expect.anything() }),
        'sortOrder',
        1,
      );
    });
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
      achievements.findAndCount.mockResolvedValue([[achievement], 1]);

      const result = await service.listAchievements({ page: 1, limit: 20, groupKey: 'purchases', search: 'first' });

      expect(achievements.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          order: { groupKey: 'ASC', sortOrder: 'ASC' },
          skip: 0,
          take: 20,
        }),
      );
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
      badges.findAndCount.mockResolvedValue([[badge], 25]);

      const result = await service.listBadges({ page: 2, limit: 10 });

      expect(badges.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          order: { sortOrder: 'ASC' },
          skip: 10,
          take: 10,
        }),
      );
      expect(result.meta).toEqual({ page: 2, limit: 10, total: 25, totalPages: 3 });
    });
  });
});
