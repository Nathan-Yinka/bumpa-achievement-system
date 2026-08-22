import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CashbackTransaction } from '../entities/cashback-transaction.entity';
import { CashbackService } from './cashback.service';

@ApiTags('cashback')
@Controller('cashbacks')
export class CashbackController {
  constructor(private readonly cashbackService: CashbackService) {}

  @Get()
  list(): Promise<CashbackTransaction[]> {
    return this.cashbackService.listTransactions();
  }
}
