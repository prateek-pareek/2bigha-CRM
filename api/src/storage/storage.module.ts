import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StorageService } from './storage.service';
import { MediaUploadsController } from './media-uploads.controller';
import { Upload, UploadSchema } from './schemas/upload.schema';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([{ name: Upload.name, schema: UploadSchema }]),
  ],
  controllers: [MediaUploadsController],
  providers: [StorageService],
  exports: [StorageService, MongooseModule],
})
export class StorageModule {}
