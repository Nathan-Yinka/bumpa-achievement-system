import { TableColumn, TableUnique } from 'typeorm';
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPurchaseIdempotencyKey2026082300020 implements MigrationInterface {
  name = 'AddPurchaseIdempotencyKey2026082300020';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'purchases',
      new TableColumn({
        name: 'idempotencyKey',
        type: 'varchar',
        isNullable: true,
      }),
    );

    await queryRunner.createUniqueConstraint(
      'purchases',
      new TableUnique({ name: 'UQ_purchases_idempotencyKey', columnNames: ['idempotencyKey'] }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropUniqueConstraint('purchases', 'UQ_purchases_idempotencyKey');
    await queryRunner.dropColumn('purchases', 'idempotencyKey');
  }
}
