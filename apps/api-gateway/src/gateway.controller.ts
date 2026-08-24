import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { JsonValue } from '@bumpa/events-sdk';
import type { Request } from 'express';
import { ApiWrappedCreatedResponse, ApiWrappedOkResponse } from './common/api-response.decorator';
import { ApiKeyGuard } from './common/api-key.guard';
import { CreateAchievementConfigDto, UpdateAchievementConfigDto } from './dto/achievement-config.dto';
import { CreateBadgeConfigDto, UpdateBadgeConfigDto } from './dto/badge-config.dto';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { ListAchievementsQueryDto, ListBadgesQueryDto, ListCashbacksQueryDto } from './dto/list-query.dto';
import { RetryCashbackDto } from './dto/retry-cashback.dto';
import { AchievementIdParamDto, BadgeIdParamDto, CashbackIdParamDto, UserIdParamDto } from './dto/safe-id-param.dto';
import { MicroserviceHttpClient } from './http/microservice-http-client.service';
import { MicroserviceName } from './http/microservice.enum';

type CorrelatedRequest = Request & { correlationId: string };

@ApiTags('gateway')
@Controller()
export class GatewayController {
  constructor(private readonly httpClient: MicroserviceHttpClient) {}

  @Post('purchases')
  @ApiWrappedCreatedResponse('Creates a purchase and starts achievement processing.')
  async createPurchase(@Body() dto: CreatePurchaseDto, @Req() req: CorrelatedRequest): Promise<JsonValue> {
    return this.httpClient.forward({
      service: MicroserviceName.Purchase,
      method: 'POST',
      path: '/purchases',
      body: dto,
      correlationId: req.correlationId,
    });
  }

  @Get('users/:userId/achievements')
  @ApiWrappedOkResponse('Returns unlocked achievements, next achievements, and badge progress.')
  async getAchievements(@Param() params: UserIdParamDto, @Req() req: CorrelatedRequest): Promise<JsonValue> {
    return this.httpClient.forward({
      service: MicroserviceName.Loyalty,
      method: 'GET',
      path: `/internal/users/${params.userId}/achievements`,
      correlationId: req.correlationId,
    });
  }

  @Get('admin/achievements')
  @UseGuards(ApiKeyGuard)
  @ApiWrappedOkResponse('Lists configured achievements (paginated).')
  async getAchievementConfigs(@Query() query: ListAchievementsQueryDto, @Req() req: CorrelatedRequest): Promise<JsonValue> {
    return this.httpClient.forward({
      service: MicroserviceName.Loyalty,
      method: 'GET',
      path: '/admin/achievements',
      query,
      correlationId: req.correlationId,
    });
  }

  @Get('admin/catalog')
  @UseGuards(ApiKeyGuard)
  @ApiWrappedOkResponse('Lists badges with their linked achievement requirements and reward metadata.')
  async getLoyaltyCatalog(@Req() req: CorrelatedRequest): Promise<JsonValue> {
    return this.httpClient.forward({
      service: MicroserviceName.Loyalty,
      method: 'GET',
      path: '/admin/catalog',
      correlationId: req.correlationId,
    });
  }

  @Post('admin/achievements')
  @UseGuards(ApiKeyGuard)
  @ApiWrappedCreatedResponse('Creates an achievement configuration.')
  async createAchievementConfig(
    @Body() body: CreateAchievementConfigDto,
    @Req() req: CorrelatedRequest,
  ): Promise<JsonValue> {
    return this.httpClient.forward({
      service: MicroserviceName.Loyalty,
      method: 'POST',
      path: '/admin/achievements',
      body,
      correlationId: req.correlationId,
    });
  }

  @Patch('admin/achievements/:id')
  @UseGuards(ApiKeyGuard)
  @ApiWrappedOkResponse('Updates an achievement configuration.')
  async updateAchievementConfig(
    @Param() params: AchievementIdParamDto,
    @Body() body: UpdateAchievementConfigDto,
    @Req() req: CorrelatedRequest,
  ): Promise<JsonValue> {
    return this.httpClient.forward({
      service: MicroserviceName.Loyalty,
      method: 'PATCH',
      path: `/admin/achievements/${params.id}`,
      body,
      correlationId: req.correlationId,
    });
  }

  @Get('admin/badges')
  @UseGuards(ApiKeyGuard)
  @ApiWrappedOkResponse('Lists configured badges (paginated).')
  async getBadgeConfigs(@Query() query: ListBadgesQueryDto, @Req() req: CorrelatedRequest): Promise<JsonValue> {
    return this.httpClient.forward({
      service: MicroserviceName.Loyalty,
      method: 'GET',
      path: '/admin/badges',
      query,
      correlationId: req.correlationId,
    });
  }

  @Post('admin/badges')
  @UseGuards(ApiKeyGuard)
  @ApiWrappedCreatedResponse('Creates a badge configuration.')
  async createBadgeConfig(@Body() body: CreateBadgeConfigDto, @Req() req: CorrelatedRequest): Promise<JsonValue> {
    return this.httpClient.forward({
      service: MicroserviceName.Loyalty,
      method: 'POST',
      path: '/admin/badges',
      body,
      correlationId: req.correlationId,
    });
  }

  @Patch('admin/badges/:id')
  @UseGuards(ApiKeyGuard)
  @ApiWrappedOkResponse('Updates a badge configuration.')
  async updateBadgeConfig(
    @Param() params: BadgeIdParamDto,
    @Body() body: UpdateBadgeConfigDto,
    @Req() req: CorrelatedRequest,
  ): Promise<JsonValue> {
    return this.httpClient.forward({
      service: MicroserviceName.Loyalty,
      method: 'PATCH',
      path: `/admin/badges/${params.id}`,
      body,
      correlationId: req.correlationId,
    });
  }

  @Get('cashbacks')
  @UseGuards(ApiKeyGuard)
  @ApiWrappedOkResponse('Lists cashback transactions, paginated and filterable.')
  async listCashbacks(@Query() query: ListCashbacksQueryDto, @Req() req: CorrelatedRequest): Promise<JsonValue> {
    return this.httpClient.forward({
      service: MicroserviceName.Cashback,
      method: 'GET',
      path: '/cashbacks',
      query,
      correlationId: req.correlationId,
    });
  }

  @Post('cashbacks/:id/retry')
  @HttpCode(200)
  @UseGuards(ApiKeyGuard)
  @ApiWrappedOkResponse('Resumes a FAILED cashback transaction, optionally with updated bank details.')
  async retryCashback(
    @Param() params: CashbackIdParamDto,
    @Body() body: RetryCashbackDto,
    @Req() req: CorrelatedRequest,
  ): Promise<JsonValue> {
    return this.httpClient.forward({
      service: MicroserviceName.Cashback,
      method: 'POST',
      path: `/cashbacks/${params.id}/retry`,
      body,
      correlationId: req.correlationId,
    });
  }
}
