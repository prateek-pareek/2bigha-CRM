import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  ConversationRef,
  ConversationRefSchema,
} from './conversation-ref.schema';
import { TeamsBotService } from './teams-bot.service';
import { TeamsBotController } from './teams-bot.controller';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ConversationRef.name, schema: ConversationRefSchema },
    ]),
    // Uses the default (HRMS) MongoDB connection — user data fits here
  ],
  controllers: [TeamsBotController],
  providers: [TeamsBotService],
  exports: [TeamsBotService],
})
export class TeamsBotModule {}
