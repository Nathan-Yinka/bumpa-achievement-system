import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { PaymentStatus } from '@bumpa/events-sdk';
import { CashbackProcessingStatus } from '../../entities/cashback-transaction.entity';

const CASHBACK_STATUS_VALUES = [
  PaymentStatus.Pending,
  CashbackProcessingStatus,
  PaymentStatus.Successful,
  PaymentStatus.Failed,
];

export class ListCashbacksQueryDto {
  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ example: 'usr_customer_001', description: 'Exact userId filter.' })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ enum: CASHBACK_STATUS_VALUES })
  @IsOptional()
  @IsIn(CASHBACK_STATUS_VALUES)
  status?: PaymentStatus | typeof CashbackProcessingStatus;

  @ApiPropertyOptional({
    example: 'Beginner',
    description: 'Case-insensitive search across badge name, userId, and provider reference.',
  })
  @IsOptional()
  @IsString()
  search?: string;
}
