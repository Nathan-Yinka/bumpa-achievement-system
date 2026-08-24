import type { ExecutionContext} from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard';
import { EnvKey } from '../config/env';

function contextWithHeader(headerValue: string | undefined): ExecutionContext {
  const request = { header: (name: string) => (name === 'x-api-key' ? headerValue : undefined) };
  return { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
}

describe('ApiKeyGuard', () => {
  const original = process.env[EnvKey.AdminApiKey];
  const guard = new ApiKeyGuard();

  afterEach(() => {
    process.env[EnvKey.AdminApiKey] = original;
  });

  it('rejects when no key is configured on the server', () => {
    delete process.env[EnvKey.AdminApiKey];
    expect(() => guard.canActivate(contextWithHeader('anything'))).toThrow(UnauthorizedException);
  });

  it('rejects when the client omits the header', () => {
    process.env[EnvKey.AdminApiKey] = 'secret';
    expect(() => guard.canActivate(contextWithHeader(undefined))).toThrow(UnauthorizedException);
  });

  it('rejects a wrong key', () => {
    process.env[EnvKey.AdminApiKey] = 'secret';
    expect(() => guard.canActivate(contextWithHeader('wrong'))).toThrow(UnauthorizedException);
  });

  it('allows a matching key', () => {
    process.env[EnvKey.AdminApiKey] = 'secret';
    expect(guard.canActivate(contextWithHeader('secret'))).toBe(true);
  });
});
