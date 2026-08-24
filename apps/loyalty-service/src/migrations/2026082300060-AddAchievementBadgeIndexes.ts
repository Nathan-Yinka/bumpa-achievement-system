import { TableIndex } from 'typeorm';
import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Indexes achievement_configs by (groupKey, sortOrder) and badge_configs by sortOrder. */
export class AddAchievementBadgeIndexes2026082300060 implements MigrationInterface {
  name = 'AddAchievementBadgeIndexes2026082300060';

  private readonly achievementIndexName = 'IDX_achievement_configs_groupKey_sortOrder';
  private readonly badgeIndexName = 'IDX_badge_configs_sortOrder';

  async up(queryRunner: QueryRunner): Promise<void> {
    const achievementTable = await queryRunner.getTable('achievement_configs');
    if (achievementTable && !achievementTable.indices.some((index) => index.name === this.achievementIndexName)) {
      await queryRunner.createIndex(
        'achievement_configs',
        new TableIndex({
          name: this.achievementIndexName,
          columnNames: ['groupKey', 'sortOrder'],
        }),
      );
    }

    const badgeTable = await queryRunner.getTable('badge_configs');
    if (badgeTable && !badgeTable.indices.some((index) => index.name === this.badgeIndexName)) {
      await queryRunner.createIndex(
        'badge_configs',
        new TableIndex({
          name: this.badgeIndexName,
          columnNames: ['sortOrder'],
        }),
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const badgeTable = await queryRunner.getTable('badge_configs');
    if (badgeTable && badgeTable.indices.some((index) => index.name === this.badgeIndexName)) {
      await queryRunner.dropIndex('badge_configs', this.badgeIndexName);
    }

    const achievementTable = await queryRunner.getTable('achievement_configs');
    if (achievementTable && achievementTable.indices.some((index) => index.name === this.achievementIndexName)) {
      await queryRunner.dropIndex('achievement_configs', this.achievementIndexName);
    }
  }
}
