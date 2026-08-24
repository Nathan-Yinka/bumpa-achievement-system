import type { Request } from 'express';
import { PurchaseController } from './purchase.controller';
import type { CreatePurchaseDto } from './dto/create-purchase.dto';
import type { PurchaseService } from './purchase.service';

describe('PurchaseController', () => {
  const dto: CreatePurchaseDto = {
    userId: 'usr_1',
    email: 'amina@getbumpa.com',
    name: 'Amina Bello',
    amountKobo: 500000,
  };

  let createPurchase: jest.Mock;
  let controller: PurchaseController;

  beforeEach(() => {
    createPurchase = jest.fn().mockResolvedValue({ purchaseId: 'pur_123' });
    controller = new PurchaseController({ createPurchase } as unknown as PurchaseService);
  });

  it('uses req.correlationId set by CorrelationIdMiddleware instead of deriving its own fallback', async () => {
    const req = { correlationId: 'corr_from_middleware' } as Request & { correlationId?: string };

    await controller.create(dto, req, undefined);

    expect(createPurchase).toHaveBeenCalledWith(dto, 'corr_from_middleware', undefined);
  });

  it('passes the x-idempotency-key header through to the service when supplied', async () => {
    const req = { correlationId: 'corr_1' } as Request & { correlationId?: string };

    await controller.create(dto, req, 'idem_abc');

    expect(createPurchase).toHaveBeenCalledWith(dto, 'corr_1', 'idem_abc');
  });

  it('falls back to a generated correlation id only if the middleware somehow left it unset', async () => {
    const req = {} as Request & { correlationId?: string };

    await controller.create(dto, req, undefined);

    const [, correlationIdArg] = createPurchase.mock.calls[0];
    expect(typeof correlationIdArg).toBe('string');
    expect(correlationIdArg.length).toBeGreaterThan(0);
  });
});
