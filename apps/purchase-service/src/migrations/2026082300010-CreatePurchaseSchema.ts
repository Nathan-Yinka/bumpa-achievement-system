import { Table, TableForeignKey, TableUnique } from 'typeorm';
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePurchaseSchema2026082300010 implements MigrationInterface {
  name = 'CreatePurchaseSchema2026082300010';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'users',
        columns: [
          { name: 'id', type: 'varchar', isPrimary: true },
          { name: 'email', type: 'varchar', isNullable: false },
          { name: 'name', type: 'varchar', isNullable: false },
          { name: 'bankAccountNumber', type: 'varchar', isNullable: true },
          { name: 'bankCode', type: 'varchar', isNullable: true },
          { name: 'createdAt', type: 'timestamp with time zone', default: 'now()' },
          { name: 'updatedAt', type: 'timestamp with time zone', default: 'now()' },
        ],
        uniques: [new TableUnique({ name: 'UQ_users_email', columnNames: ['email'] })],
      }),
      true,
    );

    await queryRunner.createTable(
      new Table({
        name: 'purchases',
        columns: [
          { name: 'id', type: 'varchar', isPrimary: true },
          { name: 'userId', type: 'varchar', isNullable: false },
          { name: 'amountKobo', type: 'integer', isNullable: false },
          { name: 'createdAt', type: 'timestamp with time zone', default: 'now()' },
        ],
      }),
      true,
    );

    await queryRunner.createForeignKey(
      'purchases',
      new TableForeignKey({
        name: 'FK_purchases_userId_users_id',
        columnNames: ['userId'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
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
    await queryRunner.dropTable('purchases', true, true, true);
    await queryRunner.dropTable('users', true, true, true);
  }
}
