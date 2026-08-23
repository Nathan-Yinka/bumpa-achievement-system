import { HttpException, Injectable, Logger } from '@nestjs/common';
import axios, { AxiosError, type AxiosInstance, type Method } from 'axios';
import type { JsonValue } from '@bumpa/events-sdk';
import { CORRELATION_ID_HEADER } from '@bumpa/logger-sdk';
import { MicroserviceName } from './microservice.enum';
import { ServiceRouteResolver } from './service-route.resolver';

interface ForwardRequest {
  service: MicroserviceName;
  method: Method;
  path: string;
  body?: object;
  correlationId?: string;
}

@Injectable()
export class MicroserviceHttpClient {
  private readonly logger = new Logger(MicroserviceHttpClient.name);
  private readonly client: AxiosInstance;
  private readonly readRetries = 2;
  private readonly retryDelayMs = 150;

  constructor(private readonly routeResolver: ServiceRouteResolver) {
    this.client = axios.create({ timeout: 5000 });
  }

  /** Forwards gateway traffic while preserving correlation IDs and downstream status codes. */
  async forward<TResponse extends JsonValue = JsonValue>(request: ForwardRequest): Promise<TResponse> {
    const url = this.routeResolver.resolve(request.service, request.path);
    let attempt = 0;

    while (attempt <= this.readRetries) {
      const startedAt = Date.now();
      try {
        const response = await this.client.request<TResponse>({
          url,
          method: request.method,
          data: request.body,
          headers: {
            'content-type': 'application/json',
            ...(request.correlationId ? { [CORRELATION_ID_HEADER]: request.correlationId } : {}),
          },
        });
        this.logger.log(`${request.method.toUpperCase()} ${url} -> ${response.status} ${Date.now() - startedAt}ms`);
        return response.data;
      } catch (error) {
        const caughtError = error instanceof Error ? error : new Error('Downstream service request failed');
        const retry = this.shouldRetry(request.method, attempt, caughtError);
        this.logFailure(request.method, url, startedAt, attempt, caughtError, retry);
        if (!retry) {
          throw this.toHttpException(caughtError);
        }

        attempt += 1;
        await this.delay(this.retryDelayMs * attempt);
      }
    }

    throw new HttpException('Downstream service is unavailable', 502);
  }

  private shouldRetry(method: Method, attempt: number, error: Error): boolean {
    if (method.toUpperCase() !== 'GET' || attempt >= this.readRetries) {
      return false;
    }

    if (!(error instanceof AxiosError)) {
      return false;
    }

    const status = error.response?.status;
    return !status || status === 408 || status === 429 || status >= 500;
  }

  private logFailure(method: Method, url: string, startedAt: number, attempt: number, error: Error, retry: boolean): void {
    const status = error instanceof AxiosError ? (error.response?.status ?? 'ERR') : 'ERR';
    const retryLabel = retry ? ` retry=${attempt + 1}` : '';
    this.logger.warn(`${method.toUpperCase()} ${url} -> ${status} ${Date.now() - startedAt}ms${retryLabel}`);
  }

  private toHttpException(error: Error): HttpException {
    if (error instanceof AxiosError && error.response) {
      return new HttpException(this.toHttpExceptionResponse(error.response.data as JsonValue), error.response.status);
    }

    return new HttpException('Downstream service is unavailable', 502);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  private toHttpExceptionResponse(value: JsonValue): string | object {
    if (value === null) {
      return 'Downstream service failed';
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    return value;
  }
}
