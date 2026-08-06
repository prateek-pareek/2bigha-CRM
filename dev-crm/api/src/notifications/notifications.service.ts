import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { EmailService } from './email.service';
import {
  Notification,
  NotificationDocument,
} from './schemas/notification.schema';
import { RealtimeGateway } from '../realtime/realtime.gateway';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectModel(Notification.name)
    private notificationModel: Model<NotificationDocument>,
    private emailService: EmailService,
    @Inject(forwardRef(() => RealtimeGateway))
    private readonly realtimeGateway: RealtimeGateway,
  ) { }

  async create(
    dataOrUserId:
      | {
        recipient: string;
        title: string;
        message: string;
        type?: string;
        metadata?: any;
      }
      | string,
    title?: string,
    messageOrBody?: string,
    type: string = 'Info',
  ) {
    let finalData: any;
    if (typeof dataOrUserId === 'object' && !title) {
      finalData = dataOrUserId;
    } else {
      finalData = {
        recipient: dataOrUserId,
        title,
        message: messageOrBody,
        type,
      };
    }
    if (finalData.recipient != null && finalData.recipient !== 'ALL') {
      finalData.recipient = String(finalData.recipient).trim();
    }
    const notification = new this.notificationModel(finalData);
    const saved = await notification.save();

    // Broadcast via WebSocket — room id must match client `join-room` (JWT `sub` / HRMS user id)
    if (saved.recipient && this.realtimeGateway.server) {
      const roomId = String(saved.recipient);
      const plain =
        typeof (saved as any).toObject === 'function'
          ? (saved as any).toObject()
          : { ...(saved as any) };
      this.realtimeGateway.server.to(roomId).emit('notification', {
        ...plain,
        userId: roomId,
      });
    }

    return saved;
  }

  private recipientOr(userId: string): Array<Record<string, unknown>> {
    const uid = String(userId || '').trim();
    const or: Array<Record<string, unknown>> = [
      { recipient: uid },
      { recipient: 'ALL' },
    ];
    if (Types.ObjectId.isValid(uid)) {
      or.push({ recipient: new Types.ObjectId(uid) });
    }
    return or;
  }

  /**
   * CRM inbound email rows used to fan out to every admin and pile up forever.
   * Soft-dismiss unread copies older than retention so the bell is not a 2-month backlog.
   */
  async dismissStaleCrmEmailUnread(
    userId: string,
    olderThanDays = 14,
  ): Promise<void> {
    const days = Math.min(Math.max(Number(olderThanDays) || 14, 1), 90);
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const or = this.recipientOr(userId).filter(
      (clause) => !('recipient' in clause && clause.recipient === 'ALL'),
    );
    if (!or.length) return;
    await this.notificationModel
      .updateMany(
        {
          $or: or,
          isRead: false,
          type: { $in: ['CRM_EMAIL_RECEIVED', 'CRM_EMAIL_REPLY_RECEIVED', 'CRM_EMAIL_OPENED', 'CRM_EMAIL_CLICKED'] },
          createdAt: { $lt: cutoff },
        },
        { $set: { isRead: true } },
      )
      .exec();
  }

  async findAllForUser(userId: string, limit = 20): Promise<any[]> {
    await this.dismissStaleCrmEmailUnread(userId);
    const or = this.recipientOr(userId);
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 200);
    return this.notificationModel
      .find({ $or: or })
      .sort({ createdAt: -1 })
      .limit(safeLimit)
      .exec();
  }

  async markAsRead(id: string) {
    return this.notificationModel
      .findByIdAndUpdate(id, { isRead: true }, { new: true })
      .exec();
  }

  async markAllAsReadForUser(userId: string): Promise<{ modifiedCount: number }> {
    const or = this.recipientOr(userId);
    const result = await this.notificationModel
      .updateMany({ $or: or, isRead: false }, { $set: { isRead: true } })
      .exec();
    return { modifiedCount: result.modifiedCount ?? 0 };
  }

  async clearAllForUser(userId: string): Promise<any> {
    const uid = String(userId || '').trim();
    const or: Array<Record<string, unknown>> = [{ recipient: uid }];
    if (Types.ObjectId.isValid(uid)) {
      or.push({ recipient: new Types.ObjectId(uid) });
    }
    return this.notificationModel.deleteMany({ $or: or }).exec();
  }

  async notifyApprover(approverEmail: string, requestData: any) {
    const subject = `Approval Required: ${requestData.documentType} Request`;
    await this.emailService.sendMail(
      approverEmail,
      subject,
      'approval-request',
      {
        ...requestData,
        actionUrl: `${process.env.FRONTEND_URL}/approvals`, // Placeholder URL
      },
    );
  }

  async notifyRequester(requesterEmail: string, requestData: any) {
    const subject = `Update on your ${requestData.documentType} Request: ${requestData.status}`;
    await this.emailService.sendMail(
      requesterEmail,
      subject,
      'approval-notice',
      requestData,
    );
  }

  async sendInvitationEmail(to: string, context: any) {
    await this.emailService.sendMail(
      to,
      'Welcome to Mathionix HRMS - Your Portal is Ready',
      'invitation', // We'll assume a fallback if .hbs doesn't exist
      context,
    );
  }

  async getUnreadCountForUser(userId: string): Promise<number> {
    await this.dismissStaleCrmEmailUnread(userId);
    const or = this.recipientOr(userId);
    return this.notificationModel.countDocuments({ $or: or, isRead: false }).exec();
  }
}
