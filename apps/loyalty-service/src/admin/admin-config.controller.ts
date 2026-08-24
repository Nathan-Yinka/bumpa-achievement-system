import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AdminConfigService } from './admin-config.service';
import { CreateAchievementConfigDto, UpdateAchievementConfigDto } from './dto/achievement-config.dto';
import { CreateBadgeConfigDto, UpdateBadgeConfigDto } from './dto/badge-config.dto';
import type {
  AchievementConfigResponseDto,
  BadgeConfigResponseDto,
  LoyaltyConfigCatalogResponseDto,
  PaginatedAchievementConfigResponseDto,
  PaginatedBadgeConfigResponseDto,
} from './dto/config-response.dto';
import { ListAchievementConfigQueryDto, ListConfigQueryDto } from './dto/list-config-query.dto';

@ApiTags('admin-config')
@Controller('admin')
export class AdminConfigController {
  constructor(private readonly adminConfigService: AdminConfigService) {}

  @Get('catalog')
  getCatalog(): Promise<LoyaltyConfigCatalogResponseDto> {
    return this.adminConfigService.getCatalog();
  }

  @Get('achievements')
  listAchievements(@Query() query: ListAchievementConfigQueryDto): Promise<PaginatedAchievementConfigResponseDto> {
    return this.adminConfigService.listAchievements(query);
  }

  @Post('achievements')
  createAchievement(@Body() dto: CreateAchievementConfigDto): Promise<AchievementConfigResponseDto> {
    return this.adminConfigService.createAchievement(dto);
  }

  @Patch('achievements/:id')
  updateAchievement(@Param('id') id: string, @Body() dto: UpdateAchievementConfigDto): Promise<AchievementConfigResponseDto> {
    return this.adminConfigService.updateAchievement(id, dto);
  }

  @Get('badges')
  listBadges(@Query() query: ListConfigQueryDto): Promise<PaginatedBadgeConfigResponseDto> {
    return this.adminConfigService.listBadges(query);
  }

  @Post('badges')
  createBadge(@Body() dto: CreateBadgeConfigDto): Promise<BadgeConfigResponseDto> {
    return this.adminConfigService.createBadge(dto);
  }

  @Patch('badges/:id')
  updateBadge(@Param('id') id: string, @Body() dto: UpdateBadgeConfigDto): Promise<BadgeConfigResponseDto> {
    return this.adminConfigService.updateBadge(id, dto);
  }
}
