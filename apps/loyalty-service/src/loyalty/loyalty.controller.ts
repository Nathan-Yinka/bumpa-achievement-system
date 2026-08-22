import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { type AchievementStateResponse, LoyaltyService } from './loyalty.service';

@ApiTags('loyalty')
@Controller()
export class LoyaltyController {
  constructor(private readonly loyaltyService: LoyaltyService) {}

  @Get('internal/users/:userId/achievements')
  getAchievementState(@Param('userId') userId: string): Promise<AchievementStateResponse> {
    return this.loyaltyService.getAchievementState(userId);
  }
}
