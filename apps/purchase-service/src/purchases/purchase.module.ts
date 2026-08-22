import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OutboxLockKey } from '@bumpa/events-sdk';
import { OutboxModule } from '@bumpa/outbox-sdk';
import { OutboxEvent } from '../entities/outbox-event.entity';
import { Purchase } from '../entities/purchase.entity';
import { User } from '../entities/user.entity';
import { PurchaseController } from './purchase.controller';
import { PurchaseService } from './purchase.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Purchase, OutboxEvent]),
    OutboxModule.forRoot({ entity: OutboxEvent, lockKey: OutboxLockKey.Purchase }),
  ],
  controllers: [PurchaseController],
  providers: [PurchaseService],
})
export class PurchaseModule {}
