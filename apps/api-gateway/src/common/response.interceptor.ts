import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Response } from 'express';
import { Observable, map } from 'rxjs';
import type { JsonObject, JsonValue } from '@bumpa/events-sdk';
import type { ApiEnvelopePayload, ApiResponseMeta, ApiSuccessResponse } from './api-response';

type MaybeJson = JsonValue | undefined;

@Injectable()
export class ResponseInterceptor implements NestInterceptor<MaybeJson, ApiSuccessResponse | JsonValue> {
  intercept(context: ExecutionContext, next: CallHandler<MaybeJson>): Observable<ApiSuccessResponse | JsonValue> {
    const response = context.switchToHttp().getResponse<Response>();

    return next.handle().pipe(
      map((data) => {
        const normalizedData = this.normalizeUndefined(data);
        if (this.isAlreadyWrapped(normalizedData)) {
          return normalizedData;
        }

        const envelope = this.extractEnvelope(normalizedData);
        return {
          success: true,
          statusCode: response.statusCode,
          data: envelope.data ?? normalizedData,
          timestamp: new Date().toISOString(),
          ...(envelope.message ? { message: envelope.message } : {}),
          ...(envelope.meta ? { meta: envelope.meta } : {}),
        };
      }),
    );
  }

  private extractEnvelope(data: JsonValue): ApiEnvelopePayload {
    if (!this.isJsonObject(data)) {
      return {};
    }

    const message = typeof data.message === 'string' ? data.message : undefined;
    const meta = this.isMeta(data.meta) ? data.meta : undefined;
    const payload = Object.prototype.hasOwnProperty.call(data, 'data') ? data.data : data;

    return { data: payload, message, meta };
  }

  private isAlreadyWrapped(data: JsonValue): boolean {
    return this.isJsonObject(data) && data.success === true;
  }

  private normalizeUndefined(data: MaybeJson): JsonValue {
    if (data === undefined) {
      return null;
    }

    if (Array.isArray(data)) {
      return data.map((item) => this.normalizeUndefined(item));
    }

    if (this.isJsonObject(data)) {
      return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, this.normalizeUndefined(value)]));
    }

    return data;
  }

  private isJsonObject(data: JsonValue): data is JsonObject {
    return typeof data === 'object' && data !== null && !Array.isArray(data);
  }

  private isMeta(data: JsonValue | undefined): data is ApiResponseMeta {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return false;
    }

    return Object.values(data).every(
      (value) => value === null || ['string', 'number', 'boolean'].includes(typeof value),
    );
  }
}
