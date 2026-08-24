import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import { EventVersion, type PurchaseCompletedEvent } from '@bumpa/events-sdk';
import { OutboxService } from '@bumpa/outbox-sdk';
import { AchievementConfig } from '../entities/achievement-config.entity';
import { BadgeConfig } from '../entities/badge-config.entity';
import { OutboxEvent } from '../entities/outbox-event.entity';
import { ProcessedEvent } from '../entities/processed-event.entity';
import { UserAchievement } from '../entities/user-achievement.entity';
import { UserBadge } from '../entities/user-badge.entity';
import { UserProjection } from '../entities/user-projection.entity';
import { UserStats } from '../entities/user-stats.entity';
import { RuleEngineService } from '../rules/rule-engine.service';
import { LoyaltyService } from './loyalty.service';

function buildEvent(): PurchaseCompletedEvent {
  return {
    eventId: 'evt_test',
    type: 'PurchaseCompleted.v1' as PurchaseCompletedEvent['type'],
    version: EventVersion.V1,
    occurredAt: new Date().toISOString(),
    correlationId: 'corr_test',
    payload: {
      userId: 'usr_test',
      purchaseId: 'pur_test',
      amountKobo: 5000,
      user: {
        id: 'usr_test',
        email: 'user@example.com',
        name: 'Amina Bello',
        bankAccountNumber: '0123456789',
        bankCode: '058',
      },
    },
  };
}

// One valid config plus one malformed config for resilience coverage.
function buildConfigs(): AchievementConfig[] {
  const good = {
    id: 'ach_first_purchase',
    name: 'First Purchase',
    groupKey: 'purchases',
    sortOrder: 1,
    rule: { type: 'COUNT', field: 'purchase_count', operator: 'GTE', value: 1 },
    active: true,
  } as AchievementConfig;

  const broken = {
    id: 'ach_broken',
    name: 'Broken Achievement',
    groupKey: 'broken',
    sortOrder: 1,
    // Missing `rules` makes this config invalid.
    rule: { type: 'COMBINATION', operator: 'AND' } as unknown as AchievementConfig['rule'],
    active: true,
  } as AchievementConfig;

  return [broken, good];
}

describe('LoyaltyService', () => {
  it('unlocks a valid achievement and skips a broken one without throwing', async () => {
    const savedAchievements: UserAchievement[] = [];
    const savedOutboxEvents: OutboxEvent[] = [];

    const manager = {
      upsert: jest.fn(),
      findOne: jest.fn(async (entity: unknown) => {
        if (entity === UserStats) {
          return null;
        }
        return null;
      }),
      create: jest.fn((entity: unknown, data: Record<string, unknown>) => data),
      save: jest.fn(async (entity: unknown, data: Record<string, unknown>) => {
        if (entity === UserAchievement) {
          savedAchievements.push(data as unknown as UserAchievement);
        }
        if (entity === OutboxEvent) {
          savedOutboxEvents.push(data as unknown as OutboxEvent);
        }
        return data;
      }),
      find: jest.fn(async (entity: unknown) => {
        if (entity === AchievementConfig) {
          return buildConfigs();
        }
        if (entity === UserAchievement) {
          return [];
        }
        if (entity === BadgeConfig) {
          return [];
        }
        return [];
      }),
    };

    const dataSource = {
      getRepository: jest.fn(() => ({ exists: jest.fn(async () => false) })),
      transaction: jest.fn(async (callback: (m: typeof manager) => Promise<void>) => callback(manager)),
    };

    const outboxService = { publishMany: jest.fn(async () => undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        LoyaltyService,
        RuleEngineService,
        { provide: getDataSourceToken(), useValue: dataSource },
        { provide: getRepositoryToken(AchievementConfig), useValue: {} },
        { provide: getRepositoryToken(BadgeConfig), useValue: {} },
        { provide: getRepositoryToken(UserAchievement), useValue: {} },
        { provide: getRepositoryToken(UserBadge), useValue: {} },
        { provide: getRepositoryToken(UserProjection), useValue: {} },
        { provide: getRepositoryToken(UserStats), useValue: {} },
        { provide: OutboxService, useValue: outboxService },
      ],
    }).compile();

    const service = moduleRef.get(LoyaltyService);

    await expect(service.handlePurchaseCompleted(buildEvent())).resolves.toBeUndefined();

    // Only the valid achievement unlocked; the broken one was skipped, not thrown.
    expect(savedAchievements).toHaveLength(1);
    expect(savedAchievements[0]?.achievementId).toBe('ach_first_purchase');

    // Its AchievementUnlocked outbox event was still written and published.
    expect(savedOutboxEvents.some((event) => event.eventType === 'AchievementUnlocked.v1')).toBe(true);
    expect(outboxService.publishMany).toHaveBeenCalled();
  });
});
