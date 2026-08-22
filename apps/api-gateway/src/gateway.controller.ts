import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { EnvKey, getServiceBaseUrl } from '@bumpa/config-sdk';
import { CORRELATION_ID_HEADER } from '@bumpa/logger-sdk';
import { CreatePurchaseDto } from './dto/create-purchase.dto';

@ApiTags('gateway')
@Controller()
export class GatewayController {
  @Post('purchases')
  async createPurchase(@Body() dto: CreatePurchaseDto, @Headers(CORRELATION_ID_HEADER) correlationId?: string) {
    const response = await fetch(`${this.purchaseServiceUrl}/purchases`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(correlationId ? { [CORRELATION_ID_HEADER]: correlationId } : {}),
      },
      body: JSON.stringify(dto),
    });

    return this.readJson(response);
  }

  @Get('users/:userId/achievements')
  async getAchievements(@Param('userId') userId: string) {
    const response = await fetch(`${this.loyaltyServiceUrl}/internal/users/${userId}/achievements`);
    return this.readJson(response);
  }

  private get purchaseServiceUrl(): string {
    return getServiceBaseUrl(EnvKey.PurchaseServiceHost, EnvKey.PurchaseServicePort, 'localhost', 3001);
  }

  private get loyaltyServiceUrl(): string {
    return getServiceBaseUrl(EnvKey.LoyaltyServiceHost, EnvKey.LoyaltyServicePort, 'localhost', 3002);
  }

  private async readJson(response: Response): Promise<unknown> {
    const body = await response.json();
    if (!response.ok) {
      return {
        statusCode: response.status,
        error: body,
      };
    }

    return body;
  }
}
