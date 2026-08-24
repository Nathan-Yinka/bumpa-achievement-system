import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateAchievementGroupDto {
  @ApiProperty({ example: 'purchases', description: 'Referenced by achievements as groupKey. Cannot be changed after creation.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  key!: string;

  @ApiProperty({ example: 'Purchases' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ example: 1, description: 'Defaults to the end of the list if omitted.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  sortOrder?: number;
}

export class UpdateAchievementGroupDto {
  @ApiPropertyOptional({ example: 'Purchases' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  sortOrder?: number;
}
