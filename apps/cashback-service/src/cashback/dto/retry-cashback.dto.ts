import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';

export class RetryCashbackDto {
  @ApiPropertyOptional({ example: '2152454812', description: 'Supply if the user did not previously have bank details on file.' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{10}$/)
  bankAccountNumber?: string;

  @ApiPropertyOptional({ example: '033' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{3,6}$/)
  bankCode?: string;
}
