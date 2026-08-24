import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';

export class RetryCashbackDto {
  @ApiPropertyOptional({ example: '0123456789' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{10}$/)
  bankAccountNumber?: string;

  @ApiPropertyOptional({ example: '058' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{3,6}$/)
  bankCode?: string;
}
