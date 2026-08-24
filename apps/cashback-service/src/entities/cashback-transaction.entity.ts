import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, Unique, UpdateDateColumn } from 'typeorm';
import { CashbackFailureCode, PaymentStatus } from '@bumpa/events-sdk';

export const CashbackProcessingStatus = 'PROCESSING' as const;

export type CashbackTransactionStatus = PaymentStatus | typeof CashbackProcessingStatus;

@Entity('cashback_transactions')
@Unique(['userId', 'badgeName'])
export class CashbackTransaction {
  @PrimaryColumn()
  id!: string;

  @Column()
  userId!: string;

  @Column()
  badgeName!: string;

  @Column('int')
  amountKobo!: number;

  @Index()
  @Column({ default: PaymentStatus.Pending })
  status!: CashbackTransactionStatus;

  @Column()
  provider!: string;

  @Index()
  @Column({ nullable: true })
  providerReference?: string;

  @Column({ nullable: true })
  providerRecipientCode?: string;

  @Column({ nullable: true })
  correlationId?: string;

  // Use null so successful rows do not keep stale failure details.
  @Column({ nullable: true, type: 'text' })
  failureReason?: string | null;

  @Column({ type: 'varchar', nullable: true })
  failureCode?: CashbackFailureCode | null;

  // Drives the interval auto-retry scanner.
  @Column({ type: 'boolean', nullable: true })
  retryable?: boolean | null;

  @Column({ default: 0 })
  retryCount!: number;

  @Column({ type: 'timestamp with time zone', nullable: true })
  nextRetryAt?: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
