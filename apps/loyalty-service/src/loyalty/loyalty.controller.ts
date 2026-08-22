import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { LoyaltyService } from './loyalty.service';

@ApiTags('loyalty')
@Controller()
export class LoyaltyController {
  constructor(private readonly loyaltyService: LoyaltyService) {}

  @Get('internal/users/:userId/achievements')
  getAchievementState(@Param('userId') userId: string) {
    return this.loyaltyService.getAchievementState(userId);
  }
}
