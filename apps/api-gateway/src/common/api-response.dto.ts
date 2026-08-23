import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { JsonValue } from '@bumpa/events-sdk';

export class ApiSuccessEnvelopeDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ example: 200 })
  statusCode!: number;

  @ApiProperty({ description: 'Endpoint response payload' })
  data!: JsonValue;

  @ApiPropertyOptional({ example: 'Request completed successfully' })
  message?: string;

  @ApiProperty({ example: '2026-08-23T12:00:00.000Z' })
  timestamp!: string;
}

export class ApiErrorEnvelopeDto {
  @ApiProperty({ example: false })
  success!: false;

  @ApiProperty({ example: 400 })
  statusCode!: number;

  @ApiProperty({ example: 'BadRequestException' })
  error!: string;

  @ApiPropertyOptional({ example: 'VALIDATION_FAILED' })
  errorCode?: string;

  @ApiProperty({ example: 'Request failed' })
  message!: string;

  @ApiPropertyOptional({ type: [String] })
  details?: string[];

  @ApiPropertyOptional({ example: '/purchases' })
  path?: string;

  @ApiProperty({ example: '2026-08-23T12:00:00.000Z' })
  timestamp!: string;
}
