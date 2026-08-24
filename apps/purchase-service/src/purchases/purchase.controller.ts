import { Body, Controller, Headers, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { createReadableId, EntityIdPrefix } from '@bumpa/events-sdk';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { IDEMPOTENCY_KEY_HEADER } from './idempotency.constants';
import { PurchaseService } from './purchase.service';

@ApiTags('purchases')
@Controller('purchases')
export class PurchaseController {
  constructor(private readonly purchaseService: PurchaseService) {}

  @Post()
  create(
    @Body() dto: CreatePurchaseDto,
    @Req() req: Request & { correlationId?: string },
    @Headers(IDEMPOTENCY_KEY_HEADER) idempotencyKey?: string,
  ): Promise<{ purchaseId: string }> {
    // Fallback covers a missing correlation middleware.
    const correlationId = req.correlationId || createReadableId(EntityIdPrefix.Event);
    return this.purchaseService.createPurchase(dto, correlationId, idempotencyKey);
  }
}
