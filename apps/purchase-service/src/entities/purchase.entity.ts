import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryColumn } from 'typeorm';
import { User } from './user.entity';

@Entity('purchases')
export class Purchase {
  @PrimaryColumn()
  id!: string;

  @Column()
  userId!: string;

  @Column('int')
  amountKobo!: number;

  @Column({ nullable: true, unique: true })
  idempotencyKey?: string;

  @ManyToOne(() => User, (user) => user.purchases, { onDelete: 'CASCADE' })
  user!: User;

  @CreateDateColumn()
  createdAt!: Date;
}
