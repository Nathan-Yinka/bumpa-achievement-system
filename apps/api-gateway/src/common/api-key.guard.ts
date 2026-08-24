import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { EnvKey, getStringEnv } from '../config/env';

export const API_KEY_HEADER = 'x-api-key';

/**
 * Guards the admin config and cashback surfaces with a single shared-secret API key, configured
 * via ADMIN_API_KEY. This isn't user authentication — there's no concept of user accounts/roles
 * in this system — it's the minimum bar for "not open to the entire internet" on the endpoints
 * the docs call out as needing protection in production.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expectedKey = getStringEnv(EnvKey.AdminApiKey, '');
    const request = context.switchToHttp().getRequest<Request>();
    const providedKey = request.header(API_KEY_HEADER);

    if (!expectedKey || !providedKey || providedKey !== expectedKey) {
      throw new UnauthorizedException('A valid x-api-key header is required for this endpoint');
    }

    return true;
  }
}
