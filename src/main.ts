import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  app.use(cookieParser());

  const frontendOrigin = app.get(ConfigService).get<string>('FRONTEND_ORIGIN');
  if (frontendOrigin) {
    app.enableCors({ origin: frontendOrigin, credentials: true });
  }

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
