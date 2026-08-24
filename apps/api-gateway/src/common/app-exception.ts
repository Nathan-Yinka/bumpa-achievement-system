import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from './error-code.enum';

export interface AppExceptionOptions {
  status?: HttpStatus;
  errorCode?: ErrorCode;
  details?: string[];
}

export class AppException extends HttpException {
  constructor(message: string, options: AppExceptionOptions = {}) {
    super(
      {
        message,
        errorCode: options.errorCode ?? ErrorCode.InternalError,
        details: options.details ?? [],
      },
      options.status ?? HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}
