import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('processed_events')
export class ProcessedEvent {
  @PrimaryColumn()
  eventId!: string;

  @Column()
  consumer!: string;

  @CreateDateColumn()
  processedAt!: Date;
}
