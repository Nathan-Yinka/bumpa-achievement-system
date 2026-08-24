import type { Request } from 'express';
import { GatewayController } from './gateway.controller';
import type { MicroserviceHttpClient } from './http/microservice-http-client.service';
import { MicroserviceName } from './http/microservice.enum';

type CorrelatedRequest = Request & { correlationId: string };

function requestWith(correlationId: string): CorrelatedRequest {
  return { correlationId } as CorrelatedRequest;
}

describe('GatewayController correlation id forwarding', () => {
  let forward: jest.Mock;
  let controller: GatewayController;

  beforeEach(() => {
    forward = jest.fn().mockResolvedValue({ ok: true });
    const httpClient = { forward } as unknown as MicroserviceHttpClient;
    controller = new GatewayController(httpClient);
  });

  it('forwards req.correlationId (the middleware-generated fallback) when the client omitted the header', async () => {
    await controller.getAchievementConfigs({}, requestWith('corr_generated_fallback'));

    expect(forward).toHaveBeenCalledWith(
      expect.objectContaining({ correlationId: 'corr_generated_fallback' }),
    );
  });

  it('forwards req.correlationId when the client supplied its own header value', async () => {
    await controller.getAchievementConfigs({}, requestWith('client-supplied-id'));

    expect(forward).toHaveBeenCalledWith(expect.objectContaining({ correlationId: 'client-supplied-id' }));
  });

  it('forwards the correlation id on GET /users/:userId/achievements, which previously forwarded none', async () => {
    await controller.getAchievements({ userId: 'usr_1' }, requestWith('corr_achievements'));

    expect(forward).toHaveBeenCalledWith(
      expect.objectContaining({
        service: MicroserviceName.Loyalty,
        path: '/internal/users/usr_1/achievements',
        correlationId: 'corr_achievements',
      }),
    );
  });

  it('forwards the correlation id on purchase creation', async () => {
    const dto = { userId: 'usr_1', email: 'a@b.com', name: 'A', amountKobo: 100 };
    await controller.createPurchase(dto, requestWith('corr_purchase'));

    expect(forward).toHaveBeenCalledWith(expect.objectContaining({ correlationId: 'corr_purchase' }));
  });

  it('forwards the correlation id on admin achievement create/update/list', async () => {
    await controller.createAchievementConfig(
      {
        id: 'ach_1',
        name: 'Ach',
        groupKey: 'g',
        sortOrder: 1,
        rule: { type: 'COUNT' },
      },
      requestWith('corr_admin_create'),
    );
    await controller.updateAchievementConfig({ id: 'ach_1' }, { active: false }, requestWith('corr_admin_update'));
    await controller.getAchievementConfigs({}, requestWith('corr_admin_list'));

    expect(forward).toHaveBeenNthCalledWith(1, expect.objectContaining({ correlationId: 'corr_admin_create' }));
    expect(forward).toHaveBeenNthCalledWith(2, expect.objectContaining({ correlationId: 'corr_admin_update' }));
    expect(forward).toHaveBeenNthCalledWith(3, expect.objectContaining({ correlationId: 'corr_admin_list' }));
  });

  it('forwards the correlation id on cashbacks listing', async () => {
    await controller.listCashbacks({}, requestWith('corr_cashbacks'));

    expect(forward).toHaveBeenCalledWith(expect.objectContaining({ correlationId: 'corr_cashbacks' }));
  });
});
