import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AchievementConfig } from '../entities/achievement-config.entity';
import { BadgeConfig } from '../entities/badge-config.entity';
import { AdminConfigService } from './admin-config.service';
import { CreateAchievementConfigDto, UpdateAchievementConfigDto } from './dto/achievement-config.dto';
import { CreateBadgeConfigDto, UpdateBadgeConfigDto } from './dto/badge-config.dto';

@ApiTags('admin-config')
@Controller('admin')
export class AdminConfigController {
  constructor(private readonly adminConfigService: AdminConfigService) {}

  @Get('achievements')
  listAchievements(): Promise<AchievementConfig[]> {
    return this.adminConfigService.listAchievements();
  }

  @Post('achievements')
  createAchievement(@Body() dto: CreateAchievementConfigDto): Promise<AchievementConfig> {
    return this.adminConfigService.createAchievement(dto);
  }

  @Patch('achievements/:id')
  updateAchievement(@Param('id') id: string, @Body() dto: UpdateAchievementConfigDto): Promise<AchievementConfig> {
    return this.adminConfigService.updateAchievement(id, dto);
  }

  @Get('badges')
  listBadges(): Promise<BadgeConfig[]> {
    return this.adminConfigService.listBadges();
  }

  @Post('badges')
  createBadge(@Body() dto: CreateBadgeConfigDto): Promise<BadgeConfig> {
    return this.adminConfigService.createBadge(dto);
  }

  @Patch('badges/:id')
  updateBadge(@Param('id') id: string, @Body() dto: UpdateBadgeConfigDto): Promise<BadgeConfig> {
    return this.adminConfigService.updateBadge(id, dto);
  }
}
