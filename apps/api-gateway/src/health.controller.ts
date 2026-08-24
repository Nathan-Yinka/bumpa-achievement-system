import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

interface HealthResponse {
  status: 'ok';
  service: 'api-gateway';
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Health check', description: 'Used by Docker healthchecks and the e2e suite to know the gateway is up.' })
  @ApiOkResponse({ description: 'The gateway is up.', schema: { example: { status: 'ok', service: 'api-gateway' } } })
  getHealth(): HealthResponse {
    return { status: 'ok', service: 'api-gateway' };
  }
}
