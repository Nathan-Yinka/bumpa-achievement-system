import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { BanksService } from './banks.service';
import { ListBanksQueryDto } from './dto/list-banks-query.dto';
import type { BankListing } from './nigerian-banks.fallback';

@ApiTags('banks')
@Controller('banks')
export class BanksController {
  constructor(private readonly banksService: BanksService) {}

  @Get()
  list(@Query() query: ListBanksQueryDto): Promise<BankListing[]> {
    return this.banksService.listBanks(query.search);
  }
}
