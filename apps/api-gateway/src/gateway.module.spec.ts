import { Test } from '@nestjs/testing';
import { GatewayModule } from './gateway.module';

describe('GatewayModule', () => {
  it('compiles', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [GatewayModule],
    }).compile();

    expect(moduleRef).toBeDefined();
  });
});
