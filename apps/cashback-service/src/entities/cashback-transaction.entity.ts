import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, Unique, UpdateDateColumn } from 'typeorm';
import { PaymentStatus } from '@bumpa/events-sdk';

/** In-flight status meaning a transaction is claimed and being paid out. */
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

  @Column({ nullable: true, type: 'text' })
  failureReason?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
