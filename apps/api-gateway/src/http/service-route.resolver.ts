import { Injectable } from '@nestjs/common';
import { EnvKey, getServiceBaseUrl } from '../config/env';
import { MicroserviceName } from './microservice.enum';

@Injectable()
export class ServiceRouteResolver {
  private readonly serviceUrls: Record<MicroserviceName, string> = {
    [MicroserviceName.Purchase]: getServiceBaseUrl(
      EnvKey.PurchaseServiceHost,
      EnvKey.PurchaseServicePort,
      'localhost',
      3001,
    ),
    [MicroserviceName.Loyalty]: getServiceBaseUrl(EnvKey.LoyaltyServiceHost, EnvKey.LoyaltyServicePort, 'localhost', 3002),
    [MicroserviceName.Cashback]: getServiceBaseUrl(
      EnvKey.CashbackServiceHost,
      EnvKey.CashbackServicePort,
      'localhost',
      3004,
    ),
  };

  resolve(service: MicroserviceName, path: string): string {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${this.serviceUrls[service]}${normalizedPath}`;
  }
}
