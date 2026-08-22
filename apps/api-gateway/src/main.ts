import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { getNumberEnv } from '@bumpa/config-sdk';
import { JsonLogger } from '@bumpa/logger-sdk';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    logger: new JsonLogger('api-gateway'),
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Bumpa Achievement System API')
      .setDescription('Public gateway for purchases and user achievement state.')
      .setVersion('1.0')
      .build(),
  );
  SwaggerModule.setup('docs', app, document);

  await app.listen(getNumberEnv('API_GATEWAY_PORT', 3000));
}

void bootstrap();
