import { Table, TableForeignKey } from 'typeorm';
import type { MigrationInterface, QueryRunner } from 'typeorm';

// groupKey used to be a free-text column on achievement_configs — a typo silently created a
// phantom group with no error. This gives groups their own table (so a bad groupKey is a real
// 400, enforced by the FK below) and a sortOrder (so the groups themselves can be ordered, not
// just the achievements within each one).
export class AddAchievementGroups2026082400070 implements MigrationInterface {
  name = 'AddAchievementGroups2026082400070';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'achievement_groups',
        columns: [
          { name: 'key', type: 'varchar', isPrimary: true },
          { name: 'name', type: 'varchar', isNullable: false },
          { name: 'sortOrder', type: 'integer', isNullable: false, default: 0 },
          { name: 'createdAt', type: 'timestamp with time zone', default: 'now()' },
          { name: 'updatedAt', type: 'timestamp with time zone', default: 'now()' },
        ],
      }),
      true,
    );

    // Backfill from whatever groupKey values already exist, so the FK below doesn't reject
    // real data already in the table. Known defaults get a proper name/order; anything else
    // (a group an admin already created some other way) falls back to using the key as its
    // own display name.
    await queryRunner.query(`
      INSERT INTO achievement_groups (key, name, "sortOrder")
      SELECT DISTINCT
        "groupKey",
        CASE "groupKey"
          WHEN 'purchases' THEN 'Purchases'
          WHEN 'spend' THEN 'Spend'
          WHEN 'milestones' THEN 'Milestones'
          ELSE "groupKey"
        END,
        CASE "groupKey"
          WHEN 'purchases' THEN 1
          WHEN 'spend' THEN 2
          WHEN 'milestones' THEN 3
          ELSE 0
        END
      FROM achievement_configs
      ON CONFLICT (key) DO NOTHING
    `);

    await queryRunner.createForeignKey(
      'achievement_configs',
      new TableForeignKey({
        name: 'FK_achievement_configs_groupKey_achievement_groups_key',
        columnNames: ['groupKey'],
        referencedTableName: 'achievement_groups',
        referencedColumnNames: ['key'],
      }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropForeignKey('achievement_configs', 'FK_achievement_configs_groupKey_achievement_groups_key');
    await queryRunner.dropTable('achievement_groups', true);
  }
}
