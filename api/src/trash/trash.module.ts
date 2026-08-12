import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Trash, TrashSchema } from './schemas/trash.schema';
import { TrashService } from './trash.service';
import { TrashController } from './trash.controller';

import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Trash.name, schema: TrashSchema }]),
    StorageModule,
  ],
  providers: [TrashService],
  controllers: [TrashController],
  exports: [TrashService],
})
export class TrashModule {}
