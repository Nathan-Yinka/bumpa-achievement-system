import { TableColumn } from 'typeorm';
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBadgeAchievementRequirements2026082300040 implements MigrationInterface {
  name = 'AddBadgeAchievementRequirements2026082300040';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('badge_configs', 'requiredAchievementIds')) {
      return;
    }

    await queryRunner.addColumn(
      'badge_configs',
      new TableColumn({
        name: 'requiredAchievementIds',
        type: 'jsonb',
        default: "'[]'::jsonb",
        isNullable: false,
      }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('badge_configs', 'requiredAchievementIds'))) {
      return;
    }

    await queryRunner.dropColumn('badge_configs', 'requiredAchievementIds');
  }
}
