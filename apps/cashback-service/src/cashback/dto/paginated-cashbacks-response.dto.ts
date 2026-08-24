import { ApiProperty } from '@nestjs/swagger';
import { CashbackTransaction } from '../../entities/cashback-transaction.entity';

export class PaginationMetaDto {
  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 42 })
  total!: number;

  @ApiProperty({ example: 3 })
  totalPages!: number;
}

export class PaginatedCashbacksResponseDto {
  @ApiProperty({ type: [CashbackTransaction] })
  items!: CashbackTransaction[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}
