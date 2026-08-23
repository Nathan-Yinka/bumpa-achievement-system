import type { JsonValue } from '@bumpa/events-sdk';

export type ApiResponseMeta = Record<string, string | number | boolean | null>;

export interface ApiSuccessResponse<TData extends JsonValue = JsonValue> {
  success: true;
  statusCode: number;
  data: TData;
  message?: string;
  meta?: ApiResponseMeta;
  timestamp: string;
}

export interface ApiErrorResponse {
  success: false;
  statusCode: number;
  error: string;
  errorCode?: string;
  message: string;
  details?: string[];
  errors?: JsonValue;
  metaData?: JsonValue;
  path?: string;
  timestamp: string;
}

export interface ApiEnvelopePayload {
  data?: JsonValue;
  message?: string;
  meta?: ApiResponseMeta;
}
