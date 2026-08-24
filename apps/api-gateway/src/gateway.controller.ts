import type { IncomingHttpHeaders } from 'node:http';
import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { IDEMPOTENCY_KEY_HEADER, type JsonValue } from '@bumpa/events-sdk';
import { ApiWrappedAcceptedResponse, ApiWrappedCreatedResponse, ApiWrappedOkResponse } from './common/api-response.decorator';
import { ApiKeyGuard } from './common/api-key.guard';
import { CreateAchievementGroupDto, UpdateAchievementGroupDto } from './dto/achievement-group.dto';
import { CreateAchievementConfigDto, UpdateAchievementConfigDto } from './dto/achievement-config.dto';
import { CreateBadgeConfigDto, UpdateBadgeConfigDto } from './dto/badge-config.dto';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { ListAchievementsQueryDto, ListBadgesQueryDto, ListCashbacksQueryDto } from './dto/list-query.dto';
import { RetryCashbackDto } from './dto/retry-cashback.dto';
import {
  AchievementGroupKeyParamDto,
  AchievementIdParamDto,
  BadgeIdParamDto,
  CashbackIdParamDto,
  UserIdParamDto,
} from './dto/safe-id-param.dto';
import { MicroserviceHttpClient } from './http/microservice-http-client.service';
import { MicroserviceName } from './http/microservice.enum';

interface CorrelatedRequest {
  correlationId: string;
  headers: IncomingHttpHeaders;
}

type RawWebhookRequest = CorrelatedRequest & { rawBody?: Buffer };

const ACHIEVEMENT_GROUP_EXAMPLE = {
  key: 'purchases',
  name: 'Purchases',
  sortOrder: 1,
};

const ACHIEVEMENT_EXAMPLE = {
  id: 'ach_20_purchases',
  name: '20 Purchases',
  description: 'Complete 20 purchases on Bumpa.',
  groupKey: 'purchases',
  sortOrder: 4,
  rule: { type: 'COUNT', field: 'purchase_count', operator: 'GTE', value: 20 },
  imageUrl: 'https://placehold.co/512x512/png?text=20+Purchases',
  active: true,
};

const BADGE_EXAMPLE = {
  id: 'bdg_elite',
  name: 'Elite',
  description: 'Unlocked by customers who complete high-value loyalty milestones.',
  sortOrder: 4,
  requiredAchievementCount: 8,
  requiredAchievementIds: ['ach_first_purchase', 'ach_5_purchases'],
  rewardAmountKobo: 30000,
  rewardCurrency: 'NGN',
  imageUrl: 'https://placehold.co/512x512/png?text=Elite',
  active: true,
};

const CASHBACK_EXAMPLE = {
  id: 'cbk_abc123def456',
  userId: 'usr_customer_001',
  badgeName: 'Beginner',
  amountKobo: 30000,
  status: 'SUCCESSFUL',
  provider: 'mock',
  providerReference: 'mock_cbk_abc123def456',
  providerRecipientCode: null,
  correlationId: 'evt_abc123def456',
  failureReason: null,
  createdAt: '2026-08-23T12:00:00.000Z',
  updatedAt: '2026-08-23T12:00:00.000Z',
};

const PAGINATION_META_EXAMPLE = { page: 1, limit: 20, total: 6, totalPages: 1 };

@Controller()
export class GatewayController {
  constructor(private readonly httpClient: MicroserviceHttpClient) {}

  @Post('purchases')
  @ApiTags('purchases')
  @ApiHeader({
    name: 'x-idempotency-key',
    required: false,
    description: 'Resubmitting the same key returns the original purchase instead of creating a duplicate.',
  })
  @ApiOperation({ summary: 'Create a purchase', description: 'Records a purchase and emits PurchaseCompleted.v1, starting achievement processing.' })
  @ApiWrappedCreatedResponse('Creates a purchase and starts achievement processing.', { purchaseId: 'pur_abc123def456' })
  async createPurchase(@Body() dto: CreatePurchaseDto, @Req() req: CorrelatedRequest): Promise<JsonValue> {
    return this.httpClient.forward({
      service: MicroserviceName.Purchase,
      method: 'POST',
      path: '/purchases',
      body: dto,
      correlationId: req.correlationId,
      headers: this.optionalHeader(IDEMPOTENCY_KEY_HEADER, this.getHeader(req, IDEMPOTENCY_KEY_HEADER)),
    });
  }

  @Get('users/:userId/achievements')
  @ApiTags('achievements')
  @ApiOperation({
    summary: "Get a customer's achievement state",
    description: 'Returns unlocked achievements, the next achievement in each group, and badge progress.',
  })
  @ApiWrappedOkResponse('Returns unlocked achievements, next achievements, and badge progress.', {
    unlocked_achievements: ['First Purchase', '5 Purchases'],
    next_available_achievements: ['10 Purchases', 'Big Spender'],
    current_badge: 'Beginner',
    next_badge: 'Intermediate',
    remaining_to_unlock_next_badge: 1,
  })
  async getAchievements(@Param() params: UserIdParamDto, @Req() req: CorrelatedRequest): Promise<JsonValue> {
    return this.httpClient.forward({
      service: MicroserviceName.Loyalty,
      method: 'GET',
      path: `/internal/users/${params.userId}/achievements`,
      correlationId: req.correlationId,
    });
  }

  @Get('admin/achievement-groups')
  @ApiTags('admin-achievement-groups')
  @ApiSecurity('admin-api-key')
  @UseGuards(ApiKeyGuard)
  @ApiOperation({ summary: 'List achievement groups', description: 'The categories an achievement\'s groupKey can reference, in display order.' })
  @ApiWrappedOkResponse('Lists achievement groups, ordered by sortOrder.', [ACHIEVEMENT_GROUP_EXAMPLE])
  async getAchievementGroups(@Req() req: CorrelatedRequest): Promise<JsonValue> {
    return this.httpClient.forward({
      service: MicroserviceName.Loyalty,
      method: 'GET',
      path: '/admin/achievement-groups',
      correlationId: req.correlationId,
    });
  }

  @Post('admin/achievement-groups')
  @ApiTags('admin-achievement-groups')
  @ApiSecurity('admin-api-key')
  @UseGuards(ApiKeyGuard)
  @ApiOperation({
    summary: 'Create an achievement group',
    description: 'Must exist before any achievement can reference it as groupKey. sortOrder collisions auto-shift, same as achievements/badges.',
  })
  @ApiWrappedCreatedResponse('Creates an achievement group.', ACHIEVEMENT_GROUP_EXAMPLE)
  async createAchievementGroup(@Body() body: CreateAchievementGroupDto, @Req() req: CorrelatedRequest): Promise<JsonValue> {
    return this.httpClient.forward({
      service: MicroserviceName.Loyalty,
      method: 'POST',
      path: '/admin/achievement-groups',
      body,
      correlationId: req.correlationId,
    });
  }

  @Patch('admin/achievement-groups/:key')
  @ApiTags('admin-achievement-groups')
  @ApiSecurity('admin-api-key')
  @UseGuards(ApiKeyGuard)
  @ApiOperation({ summary: 'Update an achievement group', description: 'Partial update. Only supplied fields change.' })
  @ApiWrappedOkResponse('Updates an achievement group.', ACHIEVEMENT_GROUP_EXAMPLE)
  async updateAchievementGroup(
    @Param() params: AchievementGroupKeyParamDto,
    @Body() body: UpdateAchievementGroupDto,
    @Req() req: CorrelatedRequest,
  ): Promise<JsonValue> {
    return this.httpClient.forward({
      service: MicroserviceName.Loyalty,
      method: 'PATCH',
      path: `/admin/achievement-groups/${params.key}`,
      body,
      correlationId: req.correlationId,
    });
  }

  @Get('admin/achievements')
  @ApiTags('admin-achievements')
  @ApiSecurity('admin-api-key')
  @UseGuards(ApiKeyGuard)
  @ApiOperation({ summary: 'List achievements', description: 'Paginated, searchable list of configured achievements.' })
  @ApiWrappedOkResponse('Lists configured achievements (paginated).', {
    items: [ACHIEVEMENT_EXAMPLE],
    meta: PAGINATION_META_EXAMPLE,
  })
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
  @ApiTags('admin-catalog')
  @ApiSecurity('admin-api-key')
  @UseGuards(ApiKeyGuard)
  @ApiOperation({
    summary: 'Get the full achievement/badge catalog',
    description: 'Read-only combined view: every achievement group, every achievement, and every badge with its linked achievement requirements resolved.',
  })
  @ApiWrappedOkResponse('Lists groups, achievements, and badges with their linked achievement requirements and reward metadata.', {
    groups: [ACHIEVEMENT_GROUP_EXAMPLE],
    achievements: [ACHIEVEMENT_EXAMPLE],
    badges: [{ ...BADGE_EXAMPLE, requiredAchievements: [ACHIEVEMENT_EXAMPLE] }],
  })
  async getLoyaltyCatalog(@Req() req: CorrelatedRequest): Promise<JsonValue> {
    return this.httpClient.forward({
      service: MicroserviceName.Loyalty,
      method: 'GET',
      path: '/admin/catalog',
      correlationId: req.correlationId,
    });
  }

  @Post('admin/achievements')
  @ApiTags('admin-achievements')
  @ApiSecurity('admin-api-key')
  @UseGuards(ApiKeyGuard)
  @ApiOperation({
    summary: 'Create an achievement',
    description: 'sortOrder is scoped per groupKey — saving at an occupied position automatically shifts the rest of that group down, no error.',
  })
  @ApiWrappedCreatedResponse('Creates an achievement configuration.', ACHIEVEMENT_EXAMPLE)
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
  @ApiTags('admin-achievements')
  @ApiSecurity('admin-api-key')
  @UseGuards(ApiKeyGuard)
  @ApiOperation({ summary: 'Update an achievement', description: 'Partial update. Only supplied fields change.' })
  @ApiWrappedOkResponse('Updates an achievement configuration.', ACHIEVEMENT_EXAMPLE)
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
  @ApiTags('admin-badges')
  @ApiSecurity('admin-api-key')
  @UseGuards(ApiKeyGuard)
  @ApiOperation({ summary: 'List badges', description: 'Paginated, searchable list of configured badges.' })
  @ApiWrappedOkResponse('Lists configured badges (paginated).', {
    items: [BADGE_EXAMPLE],
    meta: PAGINATION_META_EXAMPLE,
  })
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
  @ApiTags('admin-badges')
  @ApiSecurity('admin-api-key')
  @UseGuards(ApiKeyGuard)
  @ApiOperation({
    summary: 'Create a badge',
    description: 'sortOrder is global (all badges share one order) — saving at an occupied position shifts the rest down, no error.',
  })
  @ApiWrappedCreatedResponse('Creates a badge configuration.', BADGE_EXAMPLE)
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
  @ApiTags('admin-badges')
  @ApiSecurity('admin-api-key')
  @UseGuards(ApiKeyGuard)
  @ApiOperation({ summary: 'Update a badge', description: 'Partial update. Only supplied fields change.' })
  @ApiWrappedOkResponse('Updates a badge configuration.', BADGE_EXAMPLE)
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
  @ApiTags('cashbacks')
  @ApiSecurity('admin-api-key')
  @UseGuards(ApiKeyGuard)
  @ApiOperation({ summary: 'List cashback transactions', description: 'Paginated, filterable by userId/status, searchable by badge name, userId, or provider reference.' })
  @ApiWrappedOkResponse('Lists cashback transactions, paginated and filterable.', {
    items: [CASHBACK_EXAMPLE],
    meta: PAGINATION_META_EXAMPLE,
  })
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
  @ApiTags('cashbacks')
  @ApiSecurity('admin-api-key')
  @HttpCode(202)
  @UseGuards(ApiKeyGuard)
  @ApiOperation({
    summary: 'Retry a failed cashback transaction',
    description:
      'Only works on a transaction currently FAILED. Supply bankAccountNumber/bankCode if the user had none on file. ' +
      'Queues the retry and returns immediately — calling Paystack again can take a few seconds, so it runs on the worker, not in this request.',
  })
  @ApiWrappedAcceptedResponse('Queues a retry for a FAILED cashback transaction, optionally with updated bank details.', null)
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

  @Post('webhooks/paystack')
  @ApiTags('webhooks')
  @HttpCode(200)
  @ApiHeader({
    name: 'x-paystack-signature',
    required: true,
    description: 'HMAC signature generated by Paystack from the exact request body.',
  })
  @ApiOperation({
    summary: 'Receive Paystack transfer webhooks',
    description: 'Public gateway entrypoint that forwards the signed raw body to the private cashback service.',
  })
  @ApiWrappedOkResponse('Paystack webhook received.', { received: true })
  async handlePaystackWebhook(@Req() req: RawWebhookRequest): Promise<JsonValue> {
    return this.httpClient.forwardRaw({
      service: MicroserviceName.Cashback,
      method: 'POST',
      path: '/webhooks/paystack',
      body: req.rawBody ?? Buffer.alloc(0),
      contentType: this.getHeader(req, 'content-type') ?? 'application/json',
      headers: {
        ...this.optionalHeader('x-paystack-signature', this.getHeader(req, 'x-paystack-signature')),
      },
      correlationId: req.correlationId,
    });
  }

  private getHeader(req: CorrelatedRequest, name: string): string | undefined {
    const value = req.headers[name.toLowerCase()];
    if (Array.isArray(value)) {
      return value[0];
    }

    return typeof value === 'string' ? value : undefined;
  }

  private optionalHeader(name: string, value: string | undefined): Record<string, string> {
    return value ? { [name]: value } : {};
  }
}
