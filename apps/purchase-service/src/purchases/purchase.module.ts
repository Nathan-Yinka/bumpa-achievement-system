import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OutboxEvent } from '../entities/outbox-event.entity';
import { Purchase } from '../entities/purchase.entity';
import { User } from '../entities/user.entity';
import { OutboxPublisherService } from '../outbox/outbox-publisher.service';
import { PurchaseController } from './purchase.controller';
import { PurchaseService } from './purchase.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, Purchase, OutboxEvent])],
  controllers: [PurchaseController],
  providers: [PurchaseService, OutboxPublisherService],
})
export class PurchaseModule {}
