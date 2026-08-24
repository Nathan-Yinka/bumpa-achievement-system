import { Column, CreateDateColumn, Entity, Index, ManyToOne, PrimaryColumn, Unique } from 'typeorm';
import { BadgeConfig } from './badge-config.entity';

@Entity('user_badges')
@Unique(['userId', 'badgeId'])
export class UserBadge {
  @PrimaryColumn()
  id!: string;

  @Index()
  @Column()
  userId!: string;

  @Column()
  badgeId!: string;

  @ManyToOne(() => BadgeConfig, (badge) => badge.users, { onDelete: 'CASCADE' })
  badge!: BadgeConfig;

  @CreateDateColumn()
  unlockedAt!: Date;
}
