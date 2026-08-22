import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { EnvKey, getServiceBaseUrl } from '@bumpa/config-sdk';
import type { JsonValue } from '@bumpa/events-sdk';
import { CORRELATION_ID_HEADER } from '@bumpa/logger-sdk';
import { CreatePurchaseDto } from './dto/create-purchase.dto';

interface GatewayErrorResponse {
  statusCode: number;
  error: JsonValue;
}

type GatewayJsonResponse = JsonValue | GatewayErrorResponse;

@ApiTags('gateway')
@Controller()
export class GatewayController {
  @Post('purchases')
  async createPurchase(
    @Body() dto: CreatePurchaseDto,
    @Headers(CORRELATION_ID_HEADER) correlationId?: string,
  ): Promise<GatewayJsonResponse> {
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
  async getAchievements(@Param('userId') userId: string): Promise<GatewayJsonResponse> {
    const response = await fetch(`${this.loyaltyServiceUrl}/internal/users/${userId}/achievements`);
    return this.readJson(response);
  }

  private get purchaseServiceUrl(): string {
    return getServiceBaseUrl(EnvKey.PurchaseServiceHost, EnvKey.PurchaseServicePort, 'localhost', 3001);
  }

  private get loyaltyServiceUrl(): string {
    return getServiceBaseUrl(EnvKey.LoyaltyServiceHost, EnvKey.LoyaltyServicePort, 'localhost', 3002);
  }

  private async readJson(response: Response): Promise<GatewayJsonResponse> {
    const body = this.parseJsonValue(await response.text());
    if (!response.ok) {
      return {
        statusCode: response.status,
        error: body,
      };
    }

    return body;
  }

  private parseJsonValue(text: string): JsonValue {
    if (text.length === 0) {
      return null;
    }

    try {
      return JSON.parse(text) as JsonValue;
    } catch {
      return text;
    }
  }
}
