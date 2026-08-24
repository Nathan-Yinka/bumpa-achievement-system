import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ListBanksQueryDto {
  @ApiPropertyOptional({
    example: 'gtbank',
    description: 'Case-insensitive match against bank name or code, e.g. "zenith", "gt", or "058".',
  })
  @IsOptional()
  @IsString()
  search?: string;
}
