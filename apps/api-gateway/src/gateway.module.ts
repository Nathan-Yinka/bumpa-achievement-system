import { Module } from '@nestjs/common';
import { GatewayController } from './gateway.controller';
import { MicroserviceHttpClient } from './http/microservice-http-client.service';
import { ServiceRouteResolver } from './http/service-route.resolver';

@Module({
  controllers: [GatewayController],
  providers: [MicroserviceHttpClient, ServiceRouteResolver],
})
export class GatewayModule {}
