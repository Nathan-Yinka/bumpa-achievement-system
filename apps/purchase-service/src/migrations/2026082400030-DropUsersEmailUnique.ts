import { TableUnique } from 'typeorm';
import type { MigrationInterface, QueryRunner } from 'typeorm';

// userId is the identity key; email can be shared or reused in tests.
export class DropUsersEmailUnique2026082400030 implements MigrationInterface {
  name = 'DropUsersEmailUnique2026082400030';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropUniqueConstraint('users', 'UQ_users_email');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createUniqueConstraint('users', new TableUnique({ name: 'UQ_users_email', columnNames: ['email'] }));
  }
}
