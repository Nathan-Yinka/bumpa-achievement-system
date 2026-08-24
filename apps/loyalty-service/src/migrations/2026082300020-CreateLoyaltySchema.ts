import { Table, TableForeignKey, TableIndex, TableUnique } from 'typeorm';
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateLoyaltySchema2026082300020 implements MigrationInterface {
  name = 'CreateLoyaltySchema2026082300020';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'achievement_configs',
        columns: [
          { name: 'id', type: 'varchar', isPrimary: true },
          { name: 'name', type: 'varchar', isNullable: false },
          { name: 'description', type: 'text', default: "''" },
          { name: 'groupKey', type: 'varchar', isNullable: false },
          { name: 'sortOrder', type: 'integer', isNullable: false },
          { name: 'rule', type: 'jsonb', isNullable: false },
          { name: 'imageUrl', type: 'varchar', isNullable: true },
          { name: 'active', type: 'boolean', default: true },
          { name: 'createdAt', type: 'timestamp with time zone', default: 'now()' },
          { name: 'updatedAt', type: 'timestamp with time zone', default: 'now()' },
        ],
        uniques: [new TableUnique({ name: 'UQ_achievement_configs_name', columnNames: ['name'] })],
      }),
      true,
    );

    await queryRunner.createTable(
      new Table({
        name: 'badge_configs',
        columns: [
          { name: 'id', type: 'varchar', isPrimary: true },
          { name: 'name', type: 'varchar', isNullable: false },
          { name: 'description', type: 'text', default: "''" },
          { name: 'sortOrder', type: 'integer', isNullable: false },
          { name: 'requiredAchievementCount', type: 'integer', isNullable: false },
          { name: 'requiredAchievementIds', type: 'jsonb', default: "'[]'::jsonb" },
          { name: 'rewardAmountKobo', type: 'integer', default: 30000 },
          { name: 'rewardCurrency', type: 'varchar', default: "'NGN'" },
          { name: 'imageUrl', type: 'varchar', isNullable: true },
          { name: 'active', type: 'boolean', default: true },
          { name: 'createdAt', type: 'timestamp with time zone', default: 'now()' },
          { name: 'updatedAt', type: 'timestamp with time zone', default: 'now()' },
        ],
        uniques: [new TableUnique({ name: 'UQ_badge_configs_name', columnNames: ['name'] })],
      }),
      true,
    );

    await queryRunner.createTable(
      new Table({
        name: 'user_projections',
        columns: [
          { name: 'id', type: 'varchar', isPrimary: true },
          { name: 'email', type: 'varchar', isNullable: false },
          { name: 'name', type: 'varchar', isNullable: false },
          { name: 'bankAccountNumber', type: 'varchar', isNullable: true },
          { name: 'bankCode', type: 'varchar', isNullable: true },
          { name: 'createdAt', type: 'timestamp with time zone', default: 'now()' },
          { name: 'updatedAt', type: 'timestamp with time zone', default: 'now()' },
        ],
      }),
      true,
    );

    await queryRunner.createTable(
      new Table({
        name: 'user_stats',
        columns: [
          { name: 'userId', type: 'varchar', isPrimary: true },
          { name: 'purchaseCount', type: 'integer', default: 0 },
          { name: 'totalSpendKobo', type: 'integer', default: 0 },
          { name: 'updatedAt', type: 'timestamp with time zone', default: 'now()' },
        ],
      }),
      true,
    );

    await queryRunner.createTable(
      new Table({
        name: 'user_achievements',
        columns: [
          { name: 'id', type: 'varchar', isPrimary: true },
          { name: 'userId', type: 'varchar', isNullable: false },
          { name: 'achievementId', type: 'varchar', isNullable: false },
          { name: 'unlockedAt', type: 'timestamp with time zone', default: 'now()' },
        ],
        uniques: [new TableUnique({ name: 'UQ_user_achievements_user_achievement', columnNames: ['userId', 'achievementId'] })],
      }),
      true,
    );
    await queryRunner.createIndex('user_achievements', new TableIndex({ name: 'IDX_user_achievements_userId', columnNames: ['userId'] }));
    await queryRunner.createForeignKey(
      'user_achievements',
      new TableForeignKey({
        name: 'FK_user_achievements_achievementId',
        columnNames: ['achievementId'],
        referencedTableName: 'achievement_configs',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'user_badges',
        columns: [
          { name: 'id', type: 'varchar', isPrimary: true },
          { name: 'userId', type: 'varchar', isNullable: false },
          { name: 'badgeId', type: 'varchar', isNullable: false },
          { name: 'unlockedAt', type: 'timestamp with time zone', default: 'now()' },
        ],
        uniques: [new TableUnique({ name: 'UQ_user_badges_user_badge', columnNames: ['userId', 'badgeId'] })],
      }),
      true,
    );
    await queryRunner.createIndex('user_badges', new TableIndex({ name: 'IDX_user_badges_userId', columnNames: ['userId'] }));
    await queryRunner.createForeignKey(
      'user_badges',
      new TableForeignKey({
        name: 'FK_user_badges_badgeId',
        columnNames: ['badgeId'],
        referencedTableName: 'badge_configs',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'processed_events',
        columns: [
          { name: 'eventId', type: 'varchar', isPrimary: true },
          { name: 'consumer', type: 'varchar', isNullable: false },
          { name: 'processedAt', type: 'timestamp with time zone', default: 'now()' },
        ],
      }),
      true,
    );

    await queryRunner.createTable(
      new Table({
        name: 'outbox_events',
        columns: [
          { name: 'id', type: 'varchar', isPrimary: true },
          { name: 'eventType', type: 'varchar', isNullable: false },
          { name: 'routingKey', type: 'varchar', isNullable: false },
          { name: 'payload', type: 'jsonb', isNullable: false },
          { name: 'status', type: 'varchar', default: "'PENDING'" },
          { name: 'attempts', type: 'integer', default: 0 },
          { name: 'lastError', type: 'text', isNullable: true },
          { name: 'createdAt', type: 'timestamp with time zone', default: 'now()' },
          { name: 'publishedAt', type: 'timestamp with time zone', isNullable: true },
        ],
      }),
      true,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('outbox_events', true, true, true);
    await queryRunner.dropTable('processed_events', true, true, true);
    await queryRunner.dropTable('user_badges', true, true, true);
    await queryRunner.dropTable('user_achievements', true, true, true);
    await queryRunner.dropTable('user_stats', true, true, true);
    await queryRunner.dropTable('user_projections', true, true, true);
    await queryRunner.dropTable('badge_configs', true, true, true);
    await queryRunner.dropTable('achievement_configs', true, true, true);
  }
}
