import { Column, CreateDateColumn, Entity, OneToMany, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { Purchase } from './purchase.entity';

@Entity('users')
export class User {
  @PrimaryColumn()
  id!: string;

  @Column()
  email!: string;

  @Column()
  name!: string;

  @Column({ nullable: true })
  bankAccountNumber?: string;

  @Column({ nullable: true })
  bankCode?: string;

  @OneToMany(() => Purchase, (purchase) => purchase.user)
  purchases!: Purchase[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
