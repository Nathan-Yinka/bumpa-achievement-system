import { Body, Controller, Get, Headers, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { JsonObject, JsonValue } from '@bumpa/events-sdk';
import { CORRELATION_ID_HEADER } from '@bumpa/logger-sdk';
import { ApiWrappedOkResponse } from './common/api-response.decorator';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { MicroserviceHttpClient } from './http/microservice-http-client.service';
import { MicroserviceName } from './http/microservice.enum';

@ApiTags('gateway')
@Controller()
export class GatewayController {
  constructor(private readonly httpClient: MicroserviceHttpClient) {}

  @Post('purchases')
  @ApiWrappedOkResponse('Creates a purchase and starts achievement processing.')
  async createPurchase(
    @Body() dto: CreatePurchaseDto,
    @Headers(CORRELATION_ID_HEADER) correlationId?: string,
  ): Promise<JsonValue> {
    return this.httpClient.forward({
      service: MicroserviceName.Purchase,
      method: 'POST',
      path: '/purchases',
      body: dto,
      correlationId,
    });
  }

  @Get('users/:userId/achievements')
  @ApiWrappedOkResponse('Returns unlocked achievements, next achievements, and badge progress.')
  async getAchievements(@Param('userId') userId: string): Promise<JsonValue> {
    return this.httpClient.forward({
      service: MicroserviceName.Loyalty,
      method: 'GET',
      path: `/internal/users/${userId}/achievements`,
    });
  }

  @Get('admin/achievements')
  @ApiWrappedOkResponse('Lists configured achievements.')
  async getAchievementConfigs(@Headers(CORRELATION_ID_HEADER) correlationId?: string): Promise<JsonValue> {
    return this.httpClient.forward({
      service: MicroserviceName.Loyalty,
      method: 'GET',
      path: '/admin/achievements',
      correlationId,
    });
  }

  @Post('admin/achievements')
  @ApiWrappedOkResponse('Creates an achievement configuration.')
  async createAchievementConfig(
    @Body() body: JsonObject,
    @Headers(CORRELATION_ID_HEADER) correlationId?: string,
  ): Promise<JsonValue> {
    return this.httpClient.forward({
      service: MicroserviceName.Loyalty,
      method: 'POST',
      path: '/admin/achievements',
      body,
      correlationId,
    });
  }

  @Patch('admin/achievements/:id')
  @ApiWrappedOkResponse('Updates an achievement configuration.')
  async updateAchievementConfig(
    @Param('id') id: string,
    @Body() body: JsonObject,
    @Headers(CORRELATION_ID_HEADER) correlationId?: string,
  ): Promise<JsonValue> {
    return this.httpClient.forward({
      service: MicroserviceName.Loyalty,
      method: 'PATCH',
      path: `/admin/achievements/${id}`,
      body,
      correlationId,
    });
  }

  @Get('admin/badges')
  @ApiWrappedOkResponse('Lists configured badges.')
  async getBadgeConfigs(@Headers(CORRELATION_ID_HEADER) correlationId?: string): Promise<JsonValue> {
    return this.httpClient.forward({
      service: MicroserviceName.Loyalty,
      method: 'GET',
      path: '/admin/badges',
      correlationId,
    });
  }

  @Post('admin/badges')
  @ApiWrappedOkResponse('Creates a badge configuration.')
  async createBadgeConfig(
    @Body() body: JsonObject,
    @Headers(CORRELATION_ID_HEADER) correlationId?: string,
  ): Promise<JsonValue> {
    return this.httpClient.forward({
      service: MicroserviceName.Loyalty,
      method: 'POST',
      path: '/admin/badges',
      body,
      correlationId,
    });
  }

  @Patch('admin/badges/:id')
  @ApiWrappedOkResponse('Updates a badge configuration.')
  async updateBadgeConfig(
    @Param('id') id: string,
    @Body() body: JsonObject,
    @Headers(CORRELATION_ID_HEADER) correlationId?: string,
  ): Promise<JsonValue> {
    return this.httpClient.forward({
      service: MicroserviceName.Loyalty,
      method: 'PATCH',
      path: `/admin/badges/${id}`,
      body,
      correlationId,
    });
  }

  @Get('cashbacks')
  @ApiWrappedOkResponse('Lists cashback transactions for observability and e2e verification.')
  async listCashbacks(@Headers(CORRELATION_ID_HEADER) correlationId?: string): Promise<JsonValue> {
    return this.httpClient.forward({
      service: MicroserviceName.Cashback,
      method: 'GET',
      path: '/cashbacks',
      correlationId,
    });
  }
}
