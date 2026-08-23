import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { OutboxService } from '@bumpa/outbox-sdk';
import { PurchaseController } from './purchase.controller';
import { PurchaseService } from './purchase.service';

describe('PurchaseModule wiring', () => {
  it('compiles the purchase controller with mocked infrastructure', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PurchaseController],
      providers: [
        PurchaseService,
        {
          provide: getDataSourceToken(),
          useValue: {
            transaction: jest.fn(),
          },
        },
        { provide: OutboxService, useValue: { publishMany: jest.fn() } },
      ],
    }).compile();

    expect(moduleRef.get(PurchaseController)).toBeInstanceOf(PurchaseController);
  });
});
