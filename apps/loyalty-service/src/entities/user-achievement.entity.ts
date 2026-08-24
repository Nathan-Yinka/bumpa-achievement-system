import { Column, CreateDateColumn, Entity, Index, ManyToOne, PrimaryColumn, Unique } from 'typeorm';
import { AchievementConfig } from './achievement-config.entity';

@Entity('user_achievements')
@Unique(['userId', 'achievementId'])
export class UserAchievement {
  @PrimaryColumn()
  id!: string;

  @Index()
  @Column()
  userId!: string;

  @Column()
  achievementId!: string;

  @ManyToOne(() => AchievementConfig, (achievement) => achievement.users, { onDelete: 'CASCADE' })
  achievement!: AchievementConfig;

  @CreateDateColumn()
  unlockedAt!: Date;
}
