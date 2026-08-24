import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { AchievementRule } from '../../rules/rule.types';

export class AchievementGroupResponseDto {
  @ApiProperty({ example: 'purchases' })
  key!: string;

  @ApiProperty({ example: 'Purchases' })
  name!: string;

  @ApiProperty({ example: 1 })
  sortOrder!: number;
}

export class AchievementConfigResponseDto {
  @ApiProperty({ example: 'ach_first_purchase' })
  id!: string;

  @ApiProperty({ example: 'First Purchase' })
  name!: string;

  @ApiProperty({ example: 'Make your first purchase and start your Bumpa loyalty journey.' })
  description!: string;

  @ApiProperty({ example: 'purchases' })
  groupKey!: string;

  @ApiProperty({ example: 1 })
  sortOrder!: number;

  @ApiProperty({ example: { type: 'COUNT', field: 'purchase_count', operator: 'GTE', value: 1 } })
  rule!: AchievementRule;

  @ApiPropertyOptional({ example: 'https://placehold.co/512x512/png?text=First+Purchase' })
  imageUrl?: string;

  @ApiProperty({ example: true })
  active!: boolean;
}

export class BadgeConfigResponseDto {
  @ApiProperty({ example: 'bdg_beginner' })
  id!: string;

  @ApiProperty({ example: 'Beginner' })
  name!: string;

  @ApiProperty({ example: 'Awarded after the customer makes their first purchase.' })
  description!: string;

  @ApiProperty({ example: 1 })
  sortOrder!: number;

  @ApiProperty({ example: 1 })
  requiredAchievementCount!: number;

  @ApiProperty({ example: ['ach_first_purchase'] })
  requiredAchievementIds!: string[];

  @ApiProperty({ example: 30000 })
  rewardAmountKobo!: number;

  @ApiProperty({ example: 'NGN' })
  rewardCurrency!: string;

  @ApiPropertyOptional({ example: 'https://placehold.co/512x512/png?text=Beginner' })
  imageUrl?: string;

  @ApiProperty({ example: true })
  active!: boolean;
}

export class BadgeCatalogItemDto extends BadgeConfigResponseDto {
  @ApiProperty({ type: [AchievementConfigResponseDto] })
  requiredAchievements!: AchievementConfigResponseDto[];
}

export class LoyaltyConfigCatalogResponseDto {
  @ApiProperty({ type: [AchievementGroupResponseDto] })
  groups!: AchievementGroupResponseDto[];

  @ApiProperty({ type: [AchievementConfigResponseDto] })
  achievements!: AchievementConfigResponseDto[];

  @ApiProperty({ type: [BadgeCatalogItemDto] })
  badges!: BadgeCatalogItemDto[];
}

export class PaginationMetaDto {
  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 6 })
  total!: number;

  @ApiProperty({ example: 1 })
  totalPages!: number;
}

export class PaginatedAchievementConfigResponseDto {
  @ApiProperty({ type: [AchievementConfigResponseDto] })
  items!: AchievementConfigResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}

export class PaginatedBadgeConfigResponseDto {
  @ApiProperty({ type: [BadgeConfigResponseDto] })
  items!: BadgeConfigResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}
