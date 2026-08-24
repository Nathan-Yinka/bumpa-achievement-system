import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';
import { type BumpaDomainEvent, OutboxStatus } from '@bumpa/events-sdk';

@Entity('outbox_events')
export class OutboxEvent {
  @PrimaryColumn()
  id!: string;

  @Column()
  eventType!: string;

  @Column()
  routingKey!: string;

  @Column({ type: 'jsonb' })
  payload!: BumpaDomainEvent;

  @Column({ default: OutboxStatus.Pending })
  status!: OutboxStatus;

  @Column({ default: 0 })
  attempts!: number;

  @Column({ nullable: true, type: 'text' })
  lastError?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @Column({ nullable: true })
  publishedAt?: Date;
}
