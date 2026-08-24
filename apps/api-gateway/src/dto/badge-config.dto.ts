import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, IsUrl, MaxLength, Min } from 'class-validator';

export class CreateBadgeConfigDto {
  @ApiProperty({ example: 'bdg_elite' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  id!: string;

  @ApiProperty({ example: 'Elite' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ example: 'Awarded for reaching elite status' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ example: 4 })
  @IsInt()
  @Min(1)
  sortOrder!: number;

  @ApiProperty({ example: 8 })
  @IsInt()
  @Min(1)
  requiredAchievementCount!: number;

  @ApiPropertyOptional({ example: ['ach_20_purchases', 'ach_big_spender'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requiredAchievementIds?: string[];

  @ApiPropertyOptional({ example: 30000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  rewardAmountKobo?: number;

  @ApiPropertyOptional({ example: 'NGN' })
  @IsOptional()
  @IsString()
  rewardCurrency?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/badges/elite.png' })
  @IsOptional()
  @IsUrl({ require_tld: true })
  imageUrl?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateBadgeConfigDto {
  @ApiPropertyOptional({ example: 'Elite' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ example: 'Awarded for reaching elite status' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ example: 4 })
  @IsOptional()
  @IsInt()
  @Min(1)
  sortOrder?: number;

  @ApiPropertyOptional({ example: 8 })
  @IsOptional()
  @IsInt()
  @Min(1)
  requiredAchievementCount?: number;

  @ApiPropertyOptional({ example: ['ach_20_purchases', 'ach_big_spender'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requiredAchievementIds?: string[];

  @ApiPropertyOptional({ example: 30000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  rewardAmountKobo?: number;

  @ApiPropertyOptional({ example: 'NGN' })
  @IsOptional()
  @IsString()
  rewardCurrency?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/badges/elite.png' })
  @IsOptional()
  @IsUrl({ require_tld: true })
  imageUrl?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
