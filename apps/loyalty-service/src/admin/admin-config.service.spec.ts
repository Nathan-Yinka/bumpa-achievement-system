import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AchievementConfig } from '../entities/achievement-config.entity';
import { BadgeConfig } from '../entities/badge-config.entity';
import { AdminConfigService } from './admin-config.service';

interface MockRepository<TEntity extends object> {
  find: jest.Mock<Promise<TEntity[]>, [{ order: Record<string, 'ASC' | 'DESC'> }]>;
  findOneBy: jest.Mock<Promise<TEntity | null>, [Record<string, string>]>;
  create: jest.Mock<TEntity, [Partial<TEntity>]>;
  merge: jest.Mock<TEntity, [TEntity, Partial<TEntity>]>;
  save: jest.Mock<Promise<TEntity>, [TEntity]>;
}

function createRepository<TEntity extends object>(): MockRepository<TEntity> {
  return {
    find: jest.fn(),
    findOneBy: jest.fn(),
    create: jest.fn((entity) => entity as TEntity),
    merge: jest.fn((entity, dto) => Object.assign(entity, dto)),
    save: jest.fn(async (entity) => entity),
  };
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
      groupKey: 'purchases',
      sortOrder: 4,
      rule: { type: 'COUNT', field: 'purchase_count', operator: 'GTE', value: 20 },
    });

    expect(result.active).toBe(true);
    expect(achievements.save).toHaveBeenCalledWith(expect.objectContaining({ id: 'ach_20_purchases' }));
  });

  it('updates an existing badge config', async () => {
    badges.findOneBy.mockResolvedValue({
      id: 'bdg_advanced',
      name: 'Advanced',
      sortOrder: 3,
      requiredAchievementCount: 5,
      active: true,
      users: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await service.updateBadge('bdg_advanced', { requiredAchievementCount: 8 });

    expect(result.requiredAchievementCount).toBe(8);
    expect(badges.save).toHaveBeenCalledWith(expect.objectContaining({ requiredAchievementCount: 8 }));
  });

  it('throws when updating a missing achievement config', async () => {
    achievements.findOneBy.mockResolvedValue(null);

    await expect(service.updateAchievement('ach_missing', { active: false })).rejects.toBeInstanceOf(NotFoundException);
  });
});
