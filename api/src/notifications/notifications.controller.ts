import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {
    console.log('NotificationsController initialized');
  }

  @Get('me')
  findAll(@Request() req: any, @Query('limit') limit?: string) {
    const uid = req.user?.userId || req.user?._id || req.user?.id;
    console.log('GET /notifications/me hit for user:', uid);
    const parsed = limit != null ? Number(limit) : 20;
    return this.notificationsService.findAllForUser(String(uid), parsed);
  }

  @Patch('me/read-all')
  markAllAsRead(@Request() req: any) {
    const uid = req.user?.userId || req.user?._id || req.user?.id;
    return this.notificationsService.markAllAsReadForUser(String(uid));
  }

  @Patch(':id/read')
  markAsRead(@Param('id') id: string) {
    return this.notificationsService.markAsRead(id);
  }

  @Get('unread-count')
  getUnreadCount(@Request() req: any) {
    const uid = req.user?.userId || req.user?._id || req.user?.id;
    return this.notificationsService.getUnreadCountForUser(String(uid));
  }

  @Delete('me')
  async clearAll(@Request() req: any): Promise<any> {
    const uid = req.user?.userId || req.user?._id || req.user?.id;
    return this.notificationsService.clearAllForUser(String(uid));
  }
}
