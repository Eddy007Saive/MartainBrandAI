import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: ['log', 'warn', 'error'] });
  const port = Number(process.env.PORT || 8090);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`[render-service] écoute sur http://127.0.0.1:${port}`);
}
bootstrap();
