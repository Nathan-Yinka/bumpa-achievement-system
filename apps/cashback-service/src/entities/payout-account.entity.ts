import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('payout_accounts')
export class PayoutAccount {
  @PrimaryColumn()
  id!: string;

  @Index({ unique: true })
  @Column()
  userId!: string;

  @Column()
  userName!: string;

  @Column()
  bankAccountNumber!: string;

  @Column()
  bankCode!: string;

  @Column()
  provider!: string;

  @Column({ nullable: true })
  providerRecipientCode?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
