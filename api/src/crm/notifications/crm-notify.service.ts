import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { NotificationsService } from '../../notifications/notifications.service';
import { EmailService } from '../../notifications/email.service';
import { User, UserDocument } from '../../users/schemas/user.schema';
import {
  CRMUser,
  CRMUserDocument,
} from '../crm-users/schemas/user.schema';
import {
  CrmNotificationPreference,
  CrmNotificationPreferenceDocument,
} from './schemas/crm-notification-preference.schema';
import {
  CRM_NOTIFY_DEFAULT_PREFS,
  CrmNotifyChannelPrefs,
  CrmNotifyEvent,
} from './crm-notification-events';

export type CrmNotifyRecipientHint = {
  /** Preferred: HRMS user ObjectId hex */
  userId?: string | Types.ObjectId | null;
  email?: string | null;
  /** Display name or email label (leadOwner style) */
  label?: string | null;
  /** 2bigha admin id — resolved via CRMUser.twobighaAdminId */
  twobighaAdminId?: string | null;
};

export type CrmNotifyPayload = {
  event: CrmNotifyEvent;
  title: string;
  message: string;
  recipient: CrmNotifyRecipientHint;
  /** Extra recipients (e.g. previous owner on transfer) — each gets own prefs check */
  alsoNotify?: CrmNotifyRecipientHint[];
  link?: string;
  metadata?: Record<string, unknown>;
  type?: string;
};

export type ResolvedCrmRecipient = {
  userId: string;
  email?: string;
  name?: string;
};

@Injectable()
export class CrmNotifyService {
  private readonly logger = new Logger(CrmNotifyService.name);

  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly emailService: EmailService,
    @InjectModel(User.name)
    private readonly hrmsUserModel: Model<UserDocument>,
    @InjectModel(CRMUser.name, 'crmConnection')
    private readonly crmUserModel: Model<CRMUserDocument>,
    @InjectModel(CrmNotificationPreference.name, 'crmConnection')
    private readonly preferenceModel: Model<CrmNotificationPreferenceDocument>,
  ) {}

  private isOid(v: unknown): boolean {
    return !!v && Types.ObjectId.isValid(String(v)) && String(v).length === 24;
  }

  private escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Always resolve to HRMS user id so /notifications/me + socket rooms match JWT sub.
   */
  async resolveRecipient(
    hint: CrmNotifyRecipientHint,
  ): Promise<ResolvedCrmRecipient | null> {
    const emailHint = String(hint.email || '').trim();
    const label = String(hint.label || '').trim();
    const tbId = String(hint.twobighaAdminId || '').trim();
    let rawId = hint.userId != null ? String(hint.userId).trim() : '';
    if (rawId.startsWith('twobigha:')) {
      // fall through to twobighaAdminId
      const extracted = rawId.slice('twobigha:'.length);
      if (!tbId && extracted) {
        return this.resolveRecipient({ ...hint, userId: null, twobighaAdminId: extracted });
      }
      rawId = '';
    }
    if (rawId.startsWith('crm:')) {
      rawId = rawId.slice('crm:'.length);
    }

    if (this.isOid(rawId)) {
      const hrms = await this.hrmsUserModel
        .findById(rawId)
        .select('_id email firstName lastName fullName')
        .lean()
        .exec();
      if (hrms) {
        return {
          userId: String(hrms._id),
          email: hrms.email || undefined,
          name:
            [hrms.firstName, hrms.lastName].filter(Boolean).join(' ').trim() ||
            (hrms as any).fullName ||
            hrms.email,
        };
      }
      // Maybe a CRM user id was passed — bridge via email
      const crm = await this.crmUserModel
        .findById(rawId)
        .select('email firstName lastName')
        .lean()
        .exec();
      if (crm?.email) {
        return this.resolveRecipient({ email: crm.email, label: undefined });
      }
    }

    if (tbId) {
      const crm = await this.crmUserModel
        .findOne({ twobighaAdminId: tbId, isActive: { $ne: false } })
        .select('email firstName lastName')
        .lean()
        .exec();
      if (crm?.email) {
        return this.resolveRecipient({ email: crm.email });
      }
    }

    if (emailHint) {
      const hrms = await this.hrmsUserModel
        .findOne({
          email: new RegExp(`^${this.escapeRegex(emailHint)}$`, 'i'),
        })
        .select('_id email firstName lastName fullName')
        .lean()
        .exec();
      if (hrms) {
        return {
          userId: String(hrms._id),
          email: hrms.email || emailHint,
          name:
            [hrms.firstName, hrms.lastName].filter(Boolean).join(' ').trim() ||
            (hrms as any).fullName ||
            hrms.email,
        };
      }
    }

    if (label) {
      const escaped = this.escapeRegex(label);
      const hrmsByEmail = label.includes('@')
        ? await this.hrmsUserModel
            .findOne({ email: new RegExp(`^${escaped}$`, 'i') })
            .select('_id email firstName lastName fullName')
            .lean()
            .exec()
        : null;
      if (hrmsByEmail) {
        return {
          userId: String(hrmsByEmail._id),
          email: hrmsByEmail.email || undefined,
          name:
            [hrmsByEmail.firstName, hrmsByEmail.lastName]
              .filter(Boolean)
              .join(' ')
              .trim() || hrmsByEmail.email,
        };
      }

      const hrmsByName = await this.hrmsUserModel
        .findOne({
          $expr: {
            $eq: [
              {
                $trim: {
                  input: {
                    $concat: [
                      { $ifNull: ['$firstName', ''] },
                      ' ',
                      { $ifNull: ['$lastName', ''] },
                    ],
                  },
                },
              },
              label,
            ],
          },
        })
        .select('_id email firstName lastName fullName')
        .lean()
        .exec();
      if (hrmsByName) {
        return {
          userId: String(hrmsByName._id),
          email: hrmsByName.email || undefined,
          name: label,
        };
      }

      const crm = await this.crmUserModel
        .findOne({
          isActive: { $ne: false },
          $or: [
            { email: new RegExp(`^${escaped}$`, 'i') },
            {
              $expr: {
                $eq: [
                  {
                    $trim: {
                      input: {
                        $concat: [
                          { $ifNull: ['$firstName', ''] },
                          ' ',
                          { $ifNull: ['$lastName', ''] },
                        ],
                      },
                    },
                  },
                  label,
                ],
              },
            },
          ],
        })
        .select('email firstName lastName')
        .lean()
        .exec();
      if (crm?.email) {
        return this.resolveRecipient({ email: crm.email });
      }
    }

    return null;
  }

  async getChannelPrefs(
    userId: string,
    event: CrmNotifyEvent,
  ): Promise<CrmNotifyChannelPrefs> {
    const defaults = CRM_NOTIFY_DEFAULT_PREFS[event];
    if (!this.isOid(userId)) return defaults;
    const doc = await this.preferenceModel
      .findOne({ userId: new Types.ObjectId(userId) })
      .lean()
      .exec();
    const override = doc?.events?.[event];
    if (!override) return defaults;
    return {
      inApp: override.inApp !== undefined ? Boolean(override.inApp) : defaults.inApp,
      email: override.email !== undefined ? Boolean(override.email) : defaults.email,
    };
  }

  /**
   * Deliver in-app (+ optional email) to a resolved HRMS user, respecting prefs.
   */
  async notify(payload: CrmNotifyPayload): Promise<ResolvedCrmRecipient[]> {
    const hints = [payload.recipient, ...(payload.alsoNotify || [])].filter(
      Boolean,
    ) as CrmNotifyRecipientHint[];
    const delivered: ResolvedCrmRecipient[] = [];
    const seen = new Set<string>();

    for (const hint of hints) {
      try {
        const resolved = await this.resolveRecipient(hint);
        if (!resolved || seen.has(resolved.userId)) continue;
        seen.add(resolved.userId);

        const prefs = await this.getChannelPrefs(resolved.userId, payload.event);
        const type = payload.type || this.defaultType(payload.event);
        const meta = {
          ...(payload.metadata || {}),
          event: payload.event,
          link: payload.link || (payload.metadata as any)?.link,
        };

        if (prefs.inApp) {
          await this.notificationsService
            .create({
              recipient: resolved.userId,
              title: payload.title,
              message: payload.message,
              type,
              metadata: meta,
            })
            .catch((err) =>
              this.logger.error(
                `In-app notify failed (${payload.event}): ${err?.message || err}`,
              ),
            );
        }

        if (prefs.email && resolved.email) {
          const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
          const actionUrl = payload.link
            ? payload.link.startsWith('http')
              ? payload.link
              : `${frontendUrl}${payload.link}`
            : `${frontendUrl}/crm/notifications`;
          await this.emailService
            .sendMail(
              resolved.email,
              payload.title,
              'crm-reminder-alert',
              {
                title: payload.title,
                message: payload.message,
                recipientName: resolved.name || resolved.email,
                actionUrl,
                eventLabel: payload.event,
              },
            )
            .catch((err) =>
              this.logger.error(
                `Email notify failed (${payload.event}): ${err?.message || err}`,
              ),
            );
        }

        delivered.push(resolved);
      } catch (err: any) {
        this.logger.error(
          `notify() failed for event ${payload.event}: ${err?.message || err}`,
        );
      }
    }

    return delivered;
  }

  private defaultType(event: CrmNotifyEvent): string {
    if (event.startsWith('task_')) return 'CRM_TASK';
    if (event.startsWith('lead_') && event.includes('assign')) return 'LEAD_ASSIGNED';
    if (event.includes('transfer')) return 'LEAD_TRANSFERRED';
    if (event.includes('callback')) return 'MISSED_CALLBACK';
    if (event.includes('overdue')) return 'OVERDUE_FOLLOWUP';
    return 'Reminder';
  }
}
