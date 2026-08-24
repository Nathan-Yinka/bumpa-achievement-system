import { Table, TableIndex, TableUnique } from 'typeorm';
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCashbackSchema2026082300030 implements MigrationInterface {
  name = 'CreateCashbackSchema2026082300030';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'cashback_transactions',
        columns: [
          { name: 'id', type: 'varchar', isPrimary: true },
          { name: 'userId', type: 'varchar', isNullable: false },
          { name: 'badgeName', type: 'varchar', isNullable: false },
          { name: 'amountKobo', type: 'integer', isNullable: false },
          { name: 'status', type: 'varchar', default: "'PENDING'" },
          { name: 'provider', type: 'varchar', isNullable: false },
          { name: 'providerReference', type: 'varchar', isNullable: true },
          { name: 'providerRecipientCode', type: 'varchar', isNullable: true },
          { name: 'correlationId', type: 'varchar', isNullable: true },
          { name: 'failureReason', type: 'text', isNullable: true },
          { name: 'createdAt', type: 'timestamp with time zone', default: 'now()' },
          { name: 'updatedAt', type: 'timestamp with time zone', default: 'now()' },
        ],
        uniques: [new TableUnique({ name: 'UQ_cashback_transactions_user_badge', columnNames: ['userId', 'badgeName'] })],
      }),
      true,
    );
    await queryRunner.createIndex('cashback_transactions', new TableIndex({ name: 'IDX_cashback_transactions_status', columnNames: ['status'] }));
    await queryRunner.createIndex(
      'cashback_transactions',
      new TableIndex({ name: 'IDX_cashback_transactions_providerReference', columnNames: ['providerReference'] }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'payout_accounts',
        columns: [
          { name: 'id', type: 'varchar', isPrimary: true },
          { name: 'userId', type: 'varchar', isNullable: false },
          { name: 'userName', type: 'varchar', isNullable: false },
          { name: 'bankAccountNumber', type: 'varchar', isNullable: false },
          { name: 'bankCode', type: 'varchar', isNullable: false },
          { name: 'provider', type: 'varchar', isNullable: false },
          { name: 'providerRecipientCode', type: 'varchar', isNullable: true },
          { name: 'createdAt', type: 'timestamp with time zone', default: 'now()' },
          { name: 'updatedAt', type: 'timestamp with time zone', default: 'now()' },
        ],
      }),
      true,
    );
    await queryRunner.createIndex(
      'payout_accounts',
      new TableIndex({ name: 'IDX_payout_accounts_userId_unique', columnNames: ['userId'], isUnique: true }),
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
    await queryRunner.dropTable('payout_accounts', true, true, true);
    await queryRunner.dropTable('cashback_transactions', true, true, true);
  }
}
