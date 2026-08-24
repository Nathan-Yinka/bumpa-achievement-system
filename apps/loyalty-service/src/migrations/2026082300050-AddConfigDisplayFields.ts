import { TableColumn } from 'typeorm';
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddConfigDisplayFields2026082300050 implements MigrationInterface {
  name = 'AddConfigDisplayFields2026082300050';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('achievement_configs', 'description'))) {
      await queryRunner.addColumn(
        'achievement_configs',
        new TableColumn({
          name: 'description',
          type: 'text',
          default: "''",
          isNullable: false,
        }),
      );
    }

    if (!(await queryRunner.hasColumn('badge_configs', 'description'))) {
      await queryRunner.addColumn(
        'badge_configs',
        new TableColumn({
          name: 'description',
          type: 'text',
          default: "''",
          isNullable: false,
        }),
      );
    }

    if (!(await queryRunner.hasColumn('badge_configs', 'rewardAmountKobo'))) {
      await queryRunner.addColumn(
        'badge_configs',
        new TableColumn({
          name: 'rewardAmountKobo',
          type: 'integer',
          default: 30000,
          isNullable: false,
        }),
      );
    }

    if (!(await queryRunner.hasColumn('badge_configs', 'rewardCurrency'))) {
      await queryRunner.addColumn(
        'badge_configs',
        new TableColumn({
          name: 'rewardCurrency',
          type: 'varchar',
          default: "'NGN'",
          isNullable: false,
        }),
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('badge_configs', 'rewardCurrency')) {
      await queryRunner.dropColumn('badge_configs', 'rewardCurrency');
    }
    if (await queryRunner.hasColumn('badge_configs', 'rewardAmountKobo')) {
      await queryRunner.dropColumn('badge_configs', 'rewardAmountKobo');
    }
    if (await queryRunner.hasColumn('badge_configs', 'description')) {
      await queryRunner.dropColumn('badge_configs', 'description');
    }
    if (await queryRunner.hasColumn('achievement_configs', 'description')) {
      await queryRunner.dropColumn('achievement_configs', 'description');
    }
  }
}
