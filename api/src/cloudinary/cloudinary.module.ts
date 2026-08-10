import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CloudinaryService } from './cloudinary.service';
import { MediaUploadsController } from './media-uploads.controller';
import { Upload, UploadSchema } from './schemas/upload.schema';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([{ name: Upload.name, schema: UploadSchema }]),
  ],
  controllers: [MediaUploadsController],
  providers: [CloudinaryService],
  exports: [CloudinaryService, MongooseModule],
})
export class CloudinaryModule {}
