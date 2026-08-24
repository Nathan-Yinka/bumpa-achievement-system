import { DynamicModule, Global, Module } from '@nestjs/common';
import { BROKER_MODULE_OPTIONS } from './broker.constants';
import { BrokerService } from './broker.service';
import type { BrokerModuleOptions } from './broker.types';

@Global()
@Module({})
export class BrokerModule {
  static forRoot(options: BrokerModuleOptions): DynamicModule {
    return {
      module: BrokerModule,
      providers: [
        {
          provide: BROKER_MODULE_OPTIONS,
          useValue: options,
        },
        BrokerService,
      ],
      exports: [BrokerService],
    };
  }
}
