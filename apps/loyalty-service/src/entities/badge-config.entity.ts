import { Column, CreateDateColumn, Entity, OneToMany, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { UserBadge } from './user-badge.entity';

@Entity('badge_configs')
export class BadgeConfig {
  @PrimaryColumn()
  id!: string;

  @Column({ unique: true })
  name!: string;

  @Column({ type: 'text', default: '' })
  description!: string;

  @Column('int')
  sortOrder!: number;

  @Column('int')
  requiredAchievementCount!: number;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  requiredAchievementIds!: string[];

  @Column('int', { default: 30000 })
  rewardAmountKobo!: number;

  @Column({ default: 'NGN' })
  rewardCurrency!: string;

  @Column({ nullable: true })
  imageUrl?: string;

  @Column({ default: true })
  active!: boolean;

  @OneToMany(() => UserBadge, (userBadge) => userBadge.badge)
  users!: UserBadge[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
