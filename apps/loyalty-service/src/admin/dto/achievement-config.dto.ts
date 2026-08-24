import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, IsUrl, MaxLength, Min } from 'class-validator';
import type { AchievementRule } from '../../rules/rule.types';
import { ValidateRuleShape } from '../../rules/rule-shape.validator';

export class CreateAchievementConfigDto {
  @ApiProperty({ example: 'ach_20_purchases' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  id!: string;

  @ApiProperty({ example: '20 Purchases' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ example: 'Complete 20 purchases on Bumpa.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ example: 'purchases' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  groupKey!: string;

  @ApiProperty({ example: 4 })
  @IsInt()
  @Min(1)
  sortOrder!: number;

  @ApiProperty({
    example: { type: 'COUNT', field: 'purchase_count', operator: 'GTE', value: 20 },
  })
  @IsObject()
  @ValidateRuleShape()
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
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ example: 'Complete 20 purchases on Bumpa.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ example: 'purchases' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
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
  @ValidateRuleShape()
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
