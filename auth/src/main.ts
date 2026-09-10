import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { HOST, PORT } from './common/env';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  // whitelist: unknown body keys are dropped, so contract additions stay backward compatible.
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.enableShutdownHooks();

  // PrismaService.onModuleInit applies the schema (PRISMA_AUTO_PUSH) during init.
  await app.listen(PORT, HOST);
  Logger.log(`Account service listening on http://${HOST}:${PORT}`, 'Bootstrap');
}

void bootstrap();
