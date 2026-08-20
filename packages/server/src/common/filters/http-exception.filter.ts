import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = '服务器内部错误';
    let code = -1;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      let rawMessage: unknown = undefined;
      if (typeof res === 'string') {
        rawMessage = res;
      } else if (typeof res === 'object' && res !== null) {
        const r = res as Record<string, unknown>;
        rawMessage = r.message;
        code = (r.code as number) ?? status;
      }
      // ParseIntPipe 失败：简化提示，避免提取到值而非参数名
      if (
        typeof rawMessage === 'string' &&
        rawMessage.includes('numeric string is expected')
      ) {
        message = '路径参数必须是整数';
      } else if (Array.isArray(rawMessage)) {
        message = rawMessage[0] as string;
      } else {
        message = (rawMessage as string) ?? message;
      }
    } else if (exception instanceof Error) {
      this.logger.error(exception.stack);
      const upstreamStatus = (exception as Error & { status?: unknown }).status;
      if (
        typeof upstreamStatus === 'number' &&
        upstreamStatus >= HttpStatus.BAD_REQUEST &&
        upstreamStatus <= 599
      ) {
        status = upstreamStatus;
      }
      // 生产环境不向客户端暴露内部错误细节，避免泄露 SQL/路径等敏感信息
      message = process.env.NODE_ENV === 'production' ? '服务器内部错误' : exception.message;
    }

    this.logger.error(`[${request.method}] ${request.url} - ${status} - ${message}`);

    response.status(status).json({
      code: status,
      message,
      data: null,
    });
  }
}
