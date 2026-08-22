import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CashbackService } from './cashback.service';

@ApiTags('cashback')
@Controller('cashbacks')
export class CashbackController {
  constructor(private readonly cashbackService: CashbackService) {}

  @Get()
  list() {
    return this.cashbackService.listTransactions();
  }
}
