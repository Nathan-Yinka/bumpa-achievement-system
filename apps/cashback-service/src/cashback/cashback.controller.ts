import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CashbackService } from './cashback.service';
import { ListCashbacksQueryDto } from './dto/list-cashbacks-query.dto';
import { PaginatedCashbacksResponseDto } from './dto/paginated-cashbacks-response.dto';
import { RetryCashbackDto } from './dto/retry-cashback.dto';

@ApiTags('cashback')
@Controller('cashbacks')
export class CashbackController {
  constructor(private readonly cashbackService: CashbackService) {}

  @Get()
  list(@Query() query: ListCashbacksQueryDto): Promise<PaginatedCashbacksResponseDto> {
    return this.cashbackService.listTransactions(query);
  }

  // Queued because provider retries can take a few seconds.
  @Post(':id/retry')
  @HttpCode(202)
  retry(@Param('id') id: string, @Body() body: RetryCashbackDto): Promise<void> {
    return this.cashbackService.retryFailedTransaction(id, body);
  }
}
