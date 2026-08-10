import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as express from 'express';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useBodyParser('json', { limit: '100mb' });
  const uploadModel = app.get('UploadModel');
  app.use('/uploads', async (req: any, res: any, next: any) => {
    const urlPath = req.path.replace(/^\//, '');
    if (!urlPath) {
      return next();
    }
    try {
      const upload = await uploadModel.findOne({ filename: urlPath }).exec();
      if (upload) {
        res.setHeader('Content-Type', upload.mimeType);
        res.setHeader('Content-Length', upload.size);
        
        if (req.query.download === 'true') {
          const filename = upload.originalName || urlPath.split('/').pop() || 'file';
          res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
        }
        
        const dataBuffer = upload.data && upload.data.buffer ? Buffer.from(upload.data.buffer) : Buffer.from(upload.data);
        return res.send(dataBuffer);
      }
    } catch (err) {
      console.error('Error serving upload from database:', err);
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
