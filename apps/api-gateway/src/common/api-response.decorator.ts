import { applyDecorators } from '@nestjs/common';
import { ApiBadRequestResponse, ApiExtraModels, ApiInternalServerErrorResponse, ApiOkResponse, getSchemaPath } from '@nestjs/swagger';
import { ApiErrorEnvelopeDto, ApiSuccessEnvelopeDto } from './api-response.dto';

export function ApiWrappedOkResponse(description: string): MethodDecorator {
  return applyDecorators(
    ApiExtraModels(ApiSuccessEnvelopeDto, ApiErrorEnvelopeDto),
    ApiOkResponse({
      description,
      schema: {
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
      },
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
