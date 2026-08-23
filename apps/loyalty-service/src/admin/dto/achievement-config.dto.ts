import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsObject, IsOptional, IsString, IsUrl, Min } from 'class-validator';
import type { AchievementRule } from '../../rules/rule.types';

export class CreateAchievementConfigDto {
  @ApiProperty({ example: 'ach_20_purchases' })
  @IsString()
  id!: string;

  @ApiProperty({ example: '20 Purchases' })
  @IsString()
  name!: string;

  @ApiProperty({ example: 'purchases' })
  @IsString()
  groupKey!: string;

  @ApiProperty({ example: 4 })
  @IsInt()
  @Min(1)
  sortOrder!: number;

  @ApiProperty({
    example: { type: 'COUNT', field: 'purchase_count', operator: 'GTE', value: 20 },
  })
  @IsObject()
  rule!: AchievementRule;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/achievements/20-purchases.png' })
  @IsOptional()
  @IsUrl({ require_tld: true })
  imageUrl?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateAchievementConfigDto {
  @ApiPropertyOptional({ example: '20 Purchases' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'purchases' })
  @IsOptional()
  @IsString()
  groupKey?: string;

  @ApiPropertyOptional({ example: 4 })
  @IsOptional()
  @IsInt()
  @Min(1)
  sortOrder?: number;

  @ApiPropertyOptional({
    example: { type: 'COUNT', field: 'purchase_count', operator: 'GTE', value: 20 },
  })
  @IsOptional()
  @IsObject()
  rule?: AchievementRule;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/achievements/20-purchases.png' })
  @IsOptional()
  @IsUrl({ require_tld: true })
  imageUrl?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
