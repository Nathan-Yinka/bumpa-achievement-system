import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { EnvKey, getStringEnv } from '../config/env';

export const API_KEY_HEADER = 'x-api-key';

// Protects internal admin/cashback routes with a shared API key.
@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const expectedKey = getStringEnv(EnvKey.AdminApiKey, '');
    const request = context.switchToHttp().getRequest<Request>();
    const providedKey = request.header(API_KEY_HEADER);

    if (!expectedKey || !providedKey || providedKey !== expectedKey) {
      this.logger.warn(`Rejected ${request.method} ${request.originalUrl}: missing or invalid x-api-key`);
      throw new UnauthorizedException('A valid x-api-key header is required for this endpoint');
    }

    return true;
  }
}
