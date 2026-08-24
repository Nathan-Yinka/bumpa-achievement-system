import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/** A named, ordered category achievements belong to (e.g. "purchases", "spend"). */
@Entity('achievement_groups')
export class AchievementGroup {
  @PrimaryColumn()
  key!: string;

  @Column()
  name!: string;

  @Column('int')
  sortOrder!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
