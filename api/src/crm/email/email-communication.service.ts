import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as nodemailer from 'nodemailer';
import { Email, EmailDocument } from '../schemas/email.schema';
import { EmailTrackingService } from './email-tracking.service';
import {
  appendCrmEmailComplianceFooter,
  appendCrmEmailComplianceTextPlain,
  resolveCrmListUnsubscribeMailbox,
} from '../shared/crm-email-compliance.util';
import { normalizeDeliverabilityConfig } from '../shared/crm-deliverability.util';
import { Activity, ActivityDocument } from '../schemas/activity.schema';
import {
  CrmGlobalSettings,
  CrmGlobalSettingsDocument,
} from '../schemas/crm-global-settings.schema';
import {
  UserEmailAccount,
  UserEmailAccountDocument,
} from '../schemas/user-email-account.schema';
import { InboxAccountsService } from '../inbox/inbox-accounts.service';

@Injectable()
export class EmailCommunicationService {
  private transporter;

  constructor(
    @InjectModel(Email.name, 'crmConnection')
    private emailModel: Model<EmailDocument>,
    @InjectModel(Activity.name, 'crmConnection')
    private activityModel: Model<ActivityDocument>,
    @InjectModel(CrmGlobalSettings.name, 'crmConnection')
    private globalSettingsModel: Model<CrmGlobalSettingsDocument>,
    @InjectModel(UserEmailAccount.name, 'crmConnection')
    private accountModel: Model<UserEmailAccountDocument>,
    private emailTrackingService: EmailTrackingService,
    private inboxAccountsService: InboxAccountsService,
  ) {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.mailtrap.io',
      port: parseInt(process.env.SMTP_PORT || '2525'),
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  private async assertSendWithinDeliverabilityLimits(
    accountId?: string,
  ): Promise<void> {
    const settingsDoc = await this.globalSettingsModel
      .findOne({ key: 'default' })
      .select('emailDeliverability')
      .lean()
      .exec();
    const cfg = settingsDoc?.emailDeliverability || {
      enforceSendLimits: false,
      maxEmailsPerHourPerAccount: 40,
      maxEmailsPerDayPerAccount: 200,
    };
    if (!cfg.enforceSendLimits) return;

    if (!accountId || !Types.ObjectId.isValid(accountId)) {
      throw new BadRequestException(
        'Email sending requires a connected inbox account when deliverability limits are enabled.',
      );
    }

    const account = await this.accountModel
      .findById(new Types.ObjectId(accountId))
      .select('sendLimitOverride')
      .lean()
      .exec();
    if (!account) {
      throw new BadRequestException('Selected inbox account was not found.');
    }

    const now = Date.now();
    const hourAgo = new Date(now - 60 * 60 * 1000);
    const dayAgo = new Date(now - 24 * 60 * 60 * 1000);
    const accountObjectId = new Types.ObjectId(accountId);
    const [hourCount, dayCount] = await Promise.all([
      this.emailTrackingService.countByAccountSince(accountObjectId, hourAgo),
      this.emailTrackingService.countByAccountSince(accountObjectId, dayAgo),
    ]);

    const maxPerHourGlobal = Math.max(
      1,
      Number(cfg.maxEmailsPerHourPerAccount || 40),
    );
    const maxPerDayGlobal = Math.max(
      maxPerHourGlobal,
      Number(cfg.maxEmailsPerDayPerAccount || 200),
    );
    const overrideEnabled = account?.sendLimitOverride?.enabled === true;
    const maxPerHour = overrideEnabled
      ? Math.max(
          1,
          Number(account?.sendLimitOverride?.maxEmailsPerHour ?? maxPerHourGlobal),
        )
      : maxPerHourGlobal;
    const maxPerDay = overrideEnabled
      ? Math.max(
          maxPerHour,
          Number(account?.sendLimitOverride?.maxEmailsPerDay ?? maxPerDayGlobal),
        )
      : maxPerDayGlobal;

    if (hourCount >= maxPerHour) {
      throw new BadRequestException(
        `Hourly send limit reached for this inbox account (${maxPerHour}/hour). Try again later.`,
      );
    }
    if (dayCount >= maxPerDay) {
      throw new BadRequestException(
        `Daily send limit reached for this inbox account (${maxPerDay}/day). Try again tomorrow.`,
      );
    }
  }

  async sendEmail(data: {
    sender: string;
    recipient: string;
    subject: string;
    body: string;
    module: string;
    entityId: string;
    accountId?: string;
    cc?: string[];
    attachments?: Array<{ filename: string; content: Buffer; contentType: string }>;
  }): Promise<Email> {
    await this.assertSendWithinDeliverabilityLimits(data.accountId);

    const settingsDoc = await this.globalSettingsModel
      .findOne({ key: 'default' })
      .select('emailDeliverability')
      .lean()
      .exec();
    const deliverabilityCfg = normalizeDeliverabilityConfig(
      settingsDoc?.emailDeliverability as any,
    );

    const listMailbox = resolveCrmListUnsubscribeMailbox(
      process.env.UNSUBSCRIBE_EMAIL,
      process.env.SMTP_USER,
    );
    // Detect if body is HTML; if not, preserve newlines for display in HTML email clients
    const isHtml = /<[a-z][\s\S]*>/i.test(data.body);
    const formattedBody = isHtml
      ? data.body
      : data.body.replace(/\n/g, '<br/>');
    const withFooter =
      listMailbox != null
        ? appendCrmEmailComplianceFooter(formattedBody, listMailbox, {
            footerStyle: deliverabilityCfg.optOutFooterStyle,
          })
        : formattedBody;
    const { body: processedBody, trackingToken } =
      this.emailTrackingService.applyTrackingIfEnabled(
        withFooter,
        deliverabilityCfg.emailTrackingEnabled,
      );

    try {
      const messageRef =
        trackingToken ||
        `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const messageId = `<${messageRef}-${Date.now()}@${process.env.SMTP_USER?.split('@')[1] || 'crm'}>`;
      let textFallback: string;
      if (listMailbox != null) {
        const inner = isHtml
          ? data.body
              .replace(/<br\s*\/?>/gi, '\n')
              .replace(/<\/p>/gi, '\n')
              .replace(/<[^>]+>/g, '')
              .replace(/\s+\n/g, '\n')
              .replace(/[ \t]+/g, ' ')
              .trim()
          : data.body.trim();
        textFallback = appendCrmEmailComplianceTextPlain(
          inner || data.subject,
          listMailbox,
          { footerStyle: deliverabilityCfg.optOutFooterStyle },
        );
      } else {
        textFallback = isHtml
          ? processedBody
              .replace(/<[^>]+>/g, ' ')
              .replace(/\s+/g, ' ')
              .trim()
          : data.body;
      }
      const ccList = (data.cc || [])
        .map((c) => String(c).trim())
        .filter((c) => c.includes('@'));
      const inlineAttachments: Array<{ filename: string; content: Buffer; contentType: string }> = (data.attachments || []).map(
        (a) => ({ filename: a.filename, content: a.content, contentType: a.contentType }),
      );
      const mailOptions: nodemailer.SendMailOptions = {
        from: `"Mathionix CRM" <${process.env.SMTP_USER}>`,
        to: data.recipient,
        ...(ccList.length ? { cc: ccList } : {}),
        subject: data.subject,
        html: processedBody,
        text: textFallback || data.subject,
        ...(inlineAttachments.length ? { attachments: inlineAttachments } : {}),
        headers: {
          'Message-ID': messageId,
          'X-Mailer': 'Mathionix CRM',
          Precedence: 'auto',
          ...(listMailbox != null && {
            'List-Unsubscribe': `<mailto:${listMailbox}>`,
          }),
        },
        ...(listMailbox != null && {
          list: {
            unsubscribe: {
              url: `mailto:${listMailbox}`,
              comment: 'Unsubscribe',
            },
          },
        }),
      };

      const info = await this.transporter.sendMail(mailOptions);

      const sentEmail = new this.emailModel({
        ...data,
        accountId: data.accountId ? new Types.ObjectId(data.accountId) : undefined,
        status: 'sent',
        hasAttachments: (data.attachments || []).length > 0,
        meta: info,
      });
      const saved = await sentEmail.save();

      if (trackingToken) {
        await this.emailTrackingService.createTracking({
          trackingToken,
          userId: data.sender,
          emailId: saved._id.toString(),
          recipient: data.recipient,
          subject: data.subject,
          module: data.module,
          entityId: data.entityId,
          fromEmail: process.env.SMTP_USER,
        });
      }

      let inboxEmailId: string | undefined;
      if (data.accountId) {
        const account = await this.accountModel
          .findById(new Types.ObjectId(data.accountId))
          .exec();
        if (account) {
          inboxEmailId = await this.inboxAccountsService.saveSentEmailCopy(
            data.sender,
            account,
            {
              to: data.recipient,
              subject: data.subject,
              bodyHtml: processedBody,
              cc: ccList,
              module: data.module,
              entityId: data.entityId,
              trackingToken: trackingToken ?? undefined,
              rfcMessageId: messageId,
              attachments: data.attachments,
            },
          );
        }
      }

      // Create CRM Activity
      const ccPart = ccList.length > 0 ? ` (CC: ${ccList.join(', ')})` : '';
      const smtpFrom = (process.env.SMTP_USER || '').trim();
      const fromPart = smtpFrom ? ` from ${smtpFrom}` : '';
      await new this.activityModel({
        type: 'Email',
        title: 'Email sent',
        content: `Email sent${fromPart} to ${data.recipient}${ccPart}: ${data.subject}`,
        relatedTo: new Types.ObjectId(data.entityId),
        relatedType:
          data.module === 'leads'
            ? 'Lead'
            : data.module === 'deals'
              ? 'Deal'
              : data.module === 'contacts'
                ? 'Contact'
                : data.module === 'clients'
                  ? 'Client'
                  : 'Organization',
        author: new Types.ObjectId(data.sender),
        metadata: {
          direction: 'outbound',
          emailId: saved._id,
          subject: data.subject,
          toEmail: data.recipient,
          ...(ccList.length ? { cc: ccList } : {}),
          ...(smtpFrom ? { fromEmail: smtpFrom } : {}),
          ...(trackingToken ? { trackingToken } : {}),
          ...(inboxEmailId ? { inboxEmailId } : {}),
          bodyHtml: processedBody,
          bodyPlain: textFallback,
        },
      }).save();

      return saved;
    } catch (error) {
      console.error('Email send failed:', error);
      const failedEmail = new this.emailModel({
        ...data,
        status: 'failed',
        meta: { error: error.message },
      });
      return failedEmail.save();
    }
  }

  async saveDraft(data: {
    sender: string;
    recipient: string;
    subject: string;
    body: string;
    module: string;
    entityId: string;
    accountId?: string;
  }): Promise<Email> {
    const draft = new this.emailModel({
      ...data,
      accountId: data.accountId ? new Types.ObjectId(data.accountId) : undefined,
      status: 'draft',
    });
    return draft.save();
  }

  async updateEmail(id: string, data: Partial<Email>): Promise<Email | null> {
    return this.emailModel.findByIdAndUpdate(id, data, { new: true }).exec();
  }

  async deleteEmail(id: string): Promise<any> {
    return this.emailModel.findByIdAndDelete(id).exec();
  }

  async findByEntity(entityId: string): Promise<Email[]> {
    return this.emailModel
      .find({ entityId })
      .sort({ createdAt: -1 })
      .populate('sender', 'firstName lastName')
      .exec();
  }

  async findAll(): Promise<Email[]> {
    return this.emailModel
      .find()
      .sort({ createdAt: -1 })
      .populate('sender', 'firstName lastName')
      .exec();
  }
}
