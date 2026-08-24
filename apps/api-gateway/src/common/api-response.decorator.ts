import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiInternalServerErrorResponse,
  ApiOkResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import { ApiErrorEnvelopeDto, ApiSuccessEnvelopeDto } from './api-response.dto';

function wrappedDataSchema(): object {
  return {
    allOf: [
      { $ref: getSchemaPath(ApiSuccessEnvelopeDto) },
      {
        properties: {
          data: {
            description: 'Wrapped endpoint response data',
          },
        },
      },
    ],
  };
}

export function ApiWrappedOkResponse(description: string): MethodDecorator {
  return applyDecorators(
    ApiExtraModels(ApiSuccessEnvelopeDto, ApiErrorEnvelopeDto),
    ApiOkResponse({
      description,
      schema: wrappedDataSchema(),
    }),
    ApiBadRequestResponse({
      description: 'Validation or request error',
      schema: { $ref: getSchemaPath(ApiErrorEnvelopeDto) },
    }),
    ApiInternalServerErrorResponse({
      description: 'Unexpected server error',
      schema: { $ref: getSchemaPath(ApiErrorEnvelopeDto) },
    }),
  );
}

export function ApiWrappedCreatedResponse(description: string): MethodDecorator {
  return applyDecorators(
    ApiExtraModels(ApiSuccessEnvelopeDto, ApiErrorEnvelopeDto),
    ApiCreatedResponse({
      description,
      schema: wrappedDataSchema(),
    }),
    ApiBadRequestResponse({
      description: 'Validation or request error',
      schema: { $ref: getSchemaPath(ApiErrorEnvelopeDto) },
    }),
    ApiInternalServerErrorResponse({
      description: 'Unexpected server error',
      schema: { $ref: getSchemaPath(ApiErrorEnvelopeDto) },
    }),
  );
}
