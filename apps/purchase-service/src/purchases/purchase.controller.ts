import { Body, Controller, Headers, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CORRELATION_ID_HEADER } from '@bumpa/logger-sdk';
import { createReadableId, EntityIdPrefix } from '@bumpa/events-sdk';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { PurchaseService } from './purchase.service';

@ApiTags('purchases')
@Controller('purchases')
export class PurchaseController {
  constructor(private readonly purchaseService: PurchaseService) {}

  @Post()
  create(
    @Body() dto: CreatePurchaseDto,
    @Headers(CORRELATION_ID_HEADER) correlationId?: string,
  ): Promise<{ purchaseId: string }> {
    return this.purchaseService.createPurchase(dto, correlationId || createReadableId(EntityIdPrefix.Event));
  }
}
