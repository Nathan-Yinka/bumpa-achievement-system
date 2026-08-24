import 'reflect-metadata';
import type { IncomingMessage } from 'node:http';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { JsonLogger } from '@bumpa/logger-sdk';
import { json, urlencoded } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { ResponseInterceptor } from './common/response.interceptor';
import { EnvKey, getBooleanEnv, getCsvEnv, getNumberEnv, getStringEnv } from './config/env';

interface RawBodyMessage extends IncomingMessage {
  rawBody?: Buffer;
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
    logger: new JsonLogger('api-gateway'),
  });

  const docsEnabled = getBooleanEnv(EnvKey.GatewayDocsEnabled, true);
  const bodyLimit = getStringEnv(EnvKey.GatewayBodyLimit, '100kb');
  const corsOrigins = getCsvEnv(EnvKey.GatewayCorsOrigins);

  app.use(helmet({ contentSecurityPolicy: docsEnabled ? false : undefined }));
  app.use(
    json({
      limit: bodyLimit,
      verify: (req, _res, buffer) => {
        (req as RawBodyMessage).rawBody = Buffer.from(buffer);
      },
    }),
  );
  app.use(urlencoded({ extended: true, limit: bodyLimit }));
  if (corsOrigins.length > 0) {
    app.enableCors({
      origin: corsOrigins,
      credentials: true,
    });
  }

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      transform: true,
    }),
  );
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter());

  if (docsEnabled) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Bumpa Achievement System API')
        .setDescription('Public gateway for purchases and user achievement state.')
        .setVersion('1.0')
        .addTag('health', 'Service health check.')
        .addTag('purchases', 'Create purchases and start achievement processing.')
        .addTag('achievements', "Read a customer's unlocked achievements and badge progress.")
        .addTag('admin-achievements', 'Manage achievement configuration. Requires x-api-key.')
        .addTag('admin-badges', 'Manage badge configuration. Requires x-api-key.')
        .addTag('admin-catalog', 'Read-only combined view of achievements and badges. Requires x-api-key.')
        .addTag('cashbacks', 'View and retry cashback transactions. Requires x-api-key.')
        .addTag('webhooks', 'Public payment provider callbacks routed to internal services.')
        .addApiKey({ type: 'apiKey', name: 'x-api-key', in: 'header' }, 'admin-api-key')
        .build(),
      { autoTagControllers: false },
    );
    SwaggerModule.setup('docs', app, document);
  }

  await app.listen(getNumberEnv(EnvKey.ApiGatewayPort, 3000));
}

void bootstrap();
