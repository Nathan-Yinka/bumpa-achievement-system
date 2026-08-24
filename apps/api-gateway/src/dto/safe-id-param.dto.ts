import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

/** Restricts a path param to a safe identifier charset before it's used in a downstream URL. */
const SAFE_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

export class UserIdParamDto {
  @ApiProperty({ example: 'usr_amc5k2n9xq01' })
  @Matches(SAFE_ID_PATTERN, {
    message: 'userId may only contain letters, numbers, underscores, and hyphens',
  })
  userId!: string;
}

export class AchievementIdParamDto {
  @ApiProperty({ example: 'ach_20_purchases' })
  @Matches(SAFE_ID_PATTERN, {
    message: 'id may only contain letters, numbers, underscores, and hyphens',
  })
  id!: string;
}

export class BadgeIdParamDto {
  @ApiProperty({ example: 'bdg_elite' })
  @Matches(SAFE_ID_PATTERN, {
    message: 'id may only contain letters, numbers, underscores, and hyphens',
  })
  id!: string;
}

export class CashbackIdParamDto {
  @ApiProperty({ example: 'cbk_abc123def456' })
  @Matches(SAFE_ID_PATTERN, {
    message: 'id may only contain letters, numbers, underscores, and hyphens',
  })
  id!: string;
}
