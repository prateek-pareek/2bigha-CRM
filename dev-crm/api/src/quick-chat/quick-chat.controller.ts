import {
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { QuickChatService } from './quick-chat.service';
import { QuickChatEnabledGuard } from './quick-chat-enabled.guard';

@Controller('quick-chat')
@UseGuards(JwtAuthGuard, QuickChatEnabledGuard)
export class QuickChatController {
  constructor(private readonly quickChatService: QuickChatService) {}

  private isAdminUser(req: any) {
    const roleRaw = req.user?.role;
    const role =
      typeof roleRaw === 'object'
        ? String(roleRaw?.name || '')
        : String(roleRaw || '');
    const key = role.toUpperCase().trim();
    return [
      'ADMIN',
      'CEO',
      'CTO',
      'MANAGER',
      'EXECUTIVE',
      'SENIOR MEMBER',
      'ADMINISTRATOR',
      'SUPERADMIN',
      'SUPER_ADMIN',
      'OWNER',
    ].includes(key);
  }

  @Get('contacts')
  contacts(@Request() req: any) {
    const currentUserId = String(req.user?.userId || req.user?._id || '');
    return this.quickChatService.getAllowedContacts(currentUserId);
  }

  @Get('conversations')
  conversations(@Request() req: any) {
    const currentUserId = String(req.user?.userId || req.user?._id || '');
    return this.quickChatService.getConversations(currentUserId);
  }

  @Get('messages/:peerUserId')
  messages(
    @Request() req: any,
    @Param('peerUserId') peerUserId: string,
    @Query('limit') limit?: string,
  ) {
    const currentUserId = String(req.user?.userId || req.user?._id || '');
    const parsedLimit = Number(limit || 100);
    return this.quickChatService.getMessages(currentUserId, peerUserId, parsedLimit);
  }

  @Patch('messages/:peerUserId/read')
  markRead(@Request() req: any, @Param('peerUserId') peerUserId: string) {
    const currentUserId = String(req.user?.userId || req.user?._id || '');
    return this.quickChatService.markConversationRead(currentUserId, peerUserId);
  }

  @Delete('admin/conversation')
  async adminDeleteConversation(
    @Request() req: any,
    @Query('userA') userA: string,
    @Query('userB') userB: string,
  ) {
    if (!this.isAdminUser(req)) {
      throw new ForbiddenException('Only admin can delete other user chats.');
    }
    if (!userA || !userB) {
      return { deletedMessages: 0, conversationKey: null };
    }
    return this.quickChatService.deleteConversationBetweenUsers(
      String(userA),
      String(userB),
    );
  }

  @Delete('admin/user/:targetUserId')
  async adminDeleteAllForUser(
    @Request() req: any,
    @Param('targetUserId') targetUserId: string,
  ) {
    if (!this.isAdminUser(req)) {
      throw new ForbiddenException('Only admin can delete other user chats.');
    }
    return this.quickChatService.deleteAllChatsForUser(String(targetUserId));
  }
}

