import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { getNumberEnv } from '@bumpa/config-sdk';
import { JsonLogger } from '@bumpa/logger-sdk';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    logger: new JsonLogger('purchase-service'),
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Bumpa Purchase Service')
      .setDescription('Owns users, purchases, and PurchaseCompleted events.')
      .setVersion('1.0')
      .build(),
  );
  SwaggerModule.setup('docs', app, document);

  await app.listen(getNumberEnv('PURCHASE_SERVICE_PORT', 3001));
}

void bootstrap();
