import { TableColumn, TableIndex } from 'typeorm';
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCashbackRetryTracking2026082400040 implements MigrationInterface {
  name = 'AddCashbackRetryTracking2026082400040';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('cashback_transactions', [
      new TableColumn({ name: 'failureCode', type: 'varchar', isNullable: true }),
      new TableColumn({ name: 'retryable', type: 'boolean', isNullable: true }),
      new TableColumn({ name: 'retryCount', type: 'integer', default: 0 }),
      new TableColumn({ name: 'nextRetryAt', type: 'timestamp with time zone', isNullable: true }),
    ]);
    await queryRunner.createIndex(
      'cashback_transactions',
      new TableIndex({ name: 'IDX_cashback_transactions_retry_scan', columnNames: ['status', 'retryable', 'nextRetryAt'] }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('cashback_transactions', 'IDX_cashback_transactions_retry_scan');
    await queryRunner.dropColumns('cashback_transactions', ['failureCode', 'retryable', 'retryCount', 'nextRetryAt']);
  }
}
