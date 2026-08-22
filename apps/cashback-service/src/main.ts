import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { EnvKey, getNumberEnv } from '@bumpa/config-sdk';
import { JsonLogger } from '@bumpa/logger-sdk';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    logger: new JsonLogger('cashback-service'),
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Bumpa Cashback Service')
      .setDescription('Owns cashback transactions, retries, and payment provider integration.')
      .setVersion('1.0')
      .build(),
  );
  SwaggerModule.setup('docs', app, document);

  await app.listen(getNumberEnv(EnvKey.CashbackServicePort, 3004));
}

void bootstrap();
