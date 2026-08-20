import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as express from 'express';
import { existsSync, createReadStream } from 'fs';
import { join } from 'path';
import { UPLOADS_DIR } from './storage/storage.service';

async function bootstrap() {
  // rawBody: true keeps the original request bytes on req.rawBody alongside
  // the parsed body — needed to verify Meta's X-Hub-Signature-256 header on
  // inbound WhatsApp and Meta Lead Ads webhooks (HMAC must be computed over
  // the exact raw bytes, not a re-serialized JSON.stringify of the parsed object).
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });
  app.useBodyParser('json', { limit: '100mb' });
  const uploadModel = app.get('UploadModel');
  app.use('/uploads', async (req: any, res: any, next: any) => {
    const urlPath = req.path.replace(/^\//, '');
    if (!urlPath) {
      return next();
    }
    try {
      const upload = await uploadModel.findOne({ filename: urlPath }).exec();
      const fullPath = join(UPLOADS_DIR, urlPath);
      if (upload && existsSync(fullPath)) {
        res.setHeader('Content-Type', upload.mimeType);
        res.setHeader('Content-Length', upload.size);

        if (req.query.download === 'true') {
          const filename = upload.originalName || urlPath.split('/').pop() || 'file';
          res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
        }

        return createReadStream(fullPath).pipe(res);
      }
    } catch (err) {
      console.error('Error serving upload from local disk:', err);
    }
    next();
  });

  app.enableCors();
  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  const port = process.env.PORT ?? 4000;
  const server = await app.listen(port, '0.0.0.0');
  server.setTimeout(300000);
  console.log(`Application is running on: http://0.0.0.0:${port}`);
}
bootstrap();
