import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, Unique, UpdateDateColumn } from 'typeorm';
import { PaymentStatus } from '@bumpa/events-sdk';

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
  status!: PaymentStatus;

  @Column()
  provider!: string;

  @Column({ nullable: true })
  providerReference?: string;

  @Column({ nullable: true, type: 'text' })
  failureReason?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
