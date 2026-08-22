import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('user_stats')
export class UserStats {
  @PrimaryColumn()
  userId!: string;

  @Column('int', { default: 0 })
  purchaseCount!: number;

  @Column('int', { default: 0 })
  totalSpendKobo!: number;

  @UpdateDateColumn()
  updatedAt!: Date;
}
