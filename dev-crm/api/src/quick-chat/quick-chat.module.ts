import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  QuickChatMessage,
  QuickChatMessageSchema,
} from './schemas/quick-chat-message.schema';
import {
  QuickChatConversationState,
  QuickChatConversationStateSchema,
} from './schemas/quick-chat-conversation-state.schema';
import { QuickChatService } from './quick-chat.service';
import { QuickChatController } from './quick-chat.controller';
import { QuickChatEnabledGuard } from './quick-chat-enabled.guard';
import { User, UserSchema } from '../users/schemas/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: QuickChatMessage.name, schema: QuickChatMessageSchema },
      {
        name: QuickChatConversationState.name,
        schema: QuickChatConversationStateSchema,
      },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [QuickChatController],
  providers: [QuickChatService, QuickChatEnabledGuard],
  exports: [QuickChatService],
})
export class QuickChatModule {}

