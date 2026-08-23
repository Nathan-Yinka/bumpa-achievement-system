import { ArgumentsHost, Catch, HttpException, HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { JsonValue } from '@bumpa/events-sdk';
import type { ApiErrorResponse } from './api-response';

interface ExceptionResponseBody {
  message?: string | string[];
  error?: string;
  errorCode?: string;
  details?: string[];
  errors?: JsonValue;
  metaData?: JsonValue;
  statusCode?: number;
}

@Catch()
export class HttpExceptionFilter {
  catch(exception: Error, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request>();
    const statusCode = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const exceptionResponse = exception instanceof HttpException ? exception.getResponse() : exception.message;
    const errorBody = this.buildErrorBody(statusCode, exceptionResponse, request.path);

    response.status(statusCode).json(errorBody);
  }

  private buildErrorBody(statusCode: number, exceptionResponse: string | object, path: string): ApiErrorResponse {
    const body = typeof exceptionResponse === 'string' ? undefined : (exceptionResponse as ExceptionResponseBody);
    const message = this.extractMessage(exceptionResponse);

    return {
      success: false,
      statusCode,
      error: body?.error ?? this.getDefaultError(statusCode),
      errorCode: body?.errorCode,
      message,
      details: body?.details,
      errors: body?.errors,
      metaData: body?.metaData,
      path,
      timestamp: new Date().toISOString(),
    };
  }

  private extractMessage(exceptionResponse: string | object): string {
    if (typeof exceptionResponse === 'string') {
      return exceptionResponse;
    }

    const body = exceptionResponse as ExceptionResponseBody;
    if (Array.isArray(body.message)) {
      return body.message.join('; ');
    }

    return body.message ?? body.error ?? 'Request failed';
  }

  private getDefaultError(statusCode: number): string {
    if (statusCode === HttpStatus.INTERNAL_SERVER_ERROR) {
      return 'InternalServerError';
    }

    return 'HttpException';
  }
}
