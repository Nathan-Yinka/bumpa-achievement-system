import { Column, CreateDateColumn, Entity, OneToMany, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { UserBadge } from './user-badge.entity';

@Entity('badge_configs')
export class BadgeConfig {
  @PrimaryColumn()
  id!: string;

  @Column({ unique: true })
  name!: string;

  @Column('int')
  sortOrder!: number;

  @Column('int')
  requiredAchievementCount!: number;

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
