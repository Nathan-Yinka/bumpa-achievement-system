import { Test } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { BrokerService } from '@bumpa/broker-sdk';
import { OutboxService } from '@bumpa/outbox-sdk';
import { LoyaltyConfigSeederService } from '../config/loyalty-config-seeder.service';
import { AchievementConfig } from '../entities/achievement-config.entity';
import { AchievementGroup } from '../entities/achievement-group.entity';
import { BadgeConfig } from '../entities/badge-config.entity';
import { UserAchievement } from '../entities/user-achievement.entity';
import { UserBadge } from '../entities/user-badge.entity';
import { PurchaseCompletedConsumer } from '../messaging/purchase-completed.consumer';
import { RuleEngineService } from '../rules/rule-engine.service';
import { LoyaltyController } from './loyalty.controller';
import { LoyaltyService } from './loyalty.service';

describe('LoyaltyModule wiring', () => {
  it('compiles the loyalty controller with mocked infrastructure', async () => {
    const repository = { find: jest.fn(), save: jest.fn(), create: jest.fn(), exists: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      controllers: [LoyaltyController],
      providers: [
        LoyaltyService,
        RuleEngineService,
        LoyaltyConfigSeederService,
        PurchaseCompletedConsumer,
        { provide: getDataSourceToken(), useValue: { getRepository: jest.fn(() => repository), transaction: jest.fn() } },
        { provide: getRepositoryToken(AchievementConfig), useValue: repository },
        { provide: getRepositoryToken(AchievementGroup), useValue: repository },
        { provide: getRepositoryToken(BadgeConfig), useValue: repository },
        { provide: getRepositoryToken(UserAchievement), useValue: repository },
        { provide: getRepositoryToken(UserBadge), useValue: repository },
        { provide: BrokerService, useValue: { subscribe: jest.fn() } },
        { provide: OutboxService, useValue: { publishMany: jest.fn() } },
      ],
    }).compile();

    expect(moduleRef.get(LoyaltyController)).toBeInstanceOf(LoyaltyController);
  });
});
