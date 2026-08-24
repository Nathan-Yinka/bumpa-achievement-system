import { applyDecorators } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiInternalServerErrorResponse,
  ApiOkResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import { ApiErrorEnvelopeDto, ApiSuccessEnvelopeDto } from './api-response.dto';

function wrappedDataSchema(example?: unknown): object {
  return {
    allOf: [
      { $ref: getSchemaPath(ApiSuccessEnvelopeDto) },
      {
        properties: {
          data:
            example !== undefined
              ? { example }
              : { description: 'Wrapped endpoint response data' },
        },
      },
    ],
  };
}

export function ApiWrappedOkResponse(description: string, example?: unknown): MethodDecorator {
  return applyDecorators(
    ApiExtraModels(ApiSuccessEnvelopeDto, ApiErrorEnvelopeDto),
    ApiOkResponse({
      description,
      schema: wrappedDataSchema(example),
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

export function ApiWrappedAcceptedResponse(description: string, example?: unknown): MethodDecorator {
  return applyDecorators(
    ApiExtraModels(ApiSuccessEnvelopeDto, ApiErrorEnvelopeDto),
    ApiAcceptedResponse({
      description,
      schema: wrappedDataSchema(example),
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

export function ApiWrappedCreatedResponse(description: string, example?: unknown): MethodDecorator {
  return applyDecorators(
    ApiExtraModels(ApiSuccessEnvelopeDto, ApiErrorEnvelopeDto),
    ApiCreatedResponse({
      description,
      schema: wrappedDataSchema(example),
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
