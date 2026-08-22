import { Column, CreateDateColumn, Entity, OneToMany, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { UserAchievement } from './user-achievement.entity';

@Entity('achievement_configs')
export class AchievementConfig {
  @PrimaryColumn()
  id!: string;

  @Column({ unique: true })
  name!: string;

  @Column()
  groupKey!: string;

  @Column('int')
  sortOrder!: number;

  @Column({ type: 'jsonb' })
  rule!: Record<string, unknown>;

  @Column({ default: true })
  active!: boolean;

  @OneToMany(() => UserAchievement, (userAchievement) => userAchievement.achievement)
  users!: UserAchievement[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
