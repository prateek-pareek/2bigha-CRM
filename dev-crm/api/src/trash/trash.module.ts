import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Trash, TrashSchema } from './schemas/trash.schema';
import { TrashService } from './trash.service';
import { TrashController } from './trash.controller';

import { CloudinaryModule } from '../cloudinary/cloudinary.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Trash.name, schema: TrashSchema }]),
    CloudinaryModule,
  ],
  providers: [TrashService],
  controllers: [TrashController],
  exports: [TrashService],
})
export class TrashModule {}
