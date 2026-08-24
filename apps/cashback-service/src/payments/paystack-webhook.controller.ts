import { Body, Controller, Headers, HttpCode, Post, RawBody } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { JsonObject } from '@bumpa/events-sdk';
import { PaystackWebhookService } from './paystack-webhook.service';

@ApiTags('paystack-webhooks')
@Controller('webhooks/paystack')
export class PaystackWebhookController {
  constructor(private readonly webhookService: PaystackWebhookService) {}

  @Post()
  @HttpCode(200)
  async handle(
    @RawBody() rawBody: Buffer | undefined,
    @Body() body: JsonObject,
    @Headers('x-paystack-signature') signature?: string,
  ): Promise<{ received: true }> {
    await this.webhookService.handleWebhook(rawBody, body, signature);
    return { received: true };
  }
}
