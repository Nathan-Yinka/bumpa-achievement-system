import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CorrelationIdMiddleware } from '@bumpa/logger-sdk';
import { GatewayModule } from './gateway.module';
import { HealthController } from './health.controller';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), GatewayModule],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
