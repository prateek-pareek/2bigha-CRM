import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  Request,
  Res,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Response } from 'express';
import { InboxAccountsService } from './inbox-accounts.service';
import { InboxOAuthService } from './inbox-oauth.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RbacGuard } from '../crm-users/rbac.guard';
import { Permissions } from '../crm-users/permissions.decorator';
import { Public } from '../../auth/public.decorator';

const MAX_SEND_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB per file
const MAX_SEND_ATTACHMENT_COUNT = 10;

@Controller('crm/inbox-accounts')
@UseGuards(JwtAuthGuard, RbacGuard)
export class InboxAccountsController {
  constructor(
    private readonly inboxAccountsService: InboxAccountsService,
    private readonly inboxOAuthService: InboxOAuthService,
  ) { }

  @Get('oauth/google/authorize')
  @Permissions('inbox:connect', 'dashboard:read')
  getGoogleOAuthUrl(@Request() req: any, @Query('returnTo') returnTo?: string) {
    const state = this.inboxOAuthService.signOAuthState(
      req.user.userId,
      'gmail',
      returnTo === 'calendar' ? { returnTo: 'calendar' } : undefined,
    );
    return { url: this.inboxOAuthService.buildGoogleAuthorizeUrl(state) };
  }

  @Get('oauth/microsoft/authorize')
  @Permissions('inbox:connect', 'dashboard:read')
  getMicrosoftOAuthUrl(@Request() req: any, @Query('returnTo') returnTo?: string) {
    const state = this.inboxOAuthService.signOAuthState(
      req.user.userId,
      'outlook',
      returnTo === 'calendar' ? { returnTo: 'calendar' } : undefined,
    );
    return { url: this.inboxOAuthService.buildMicrosoftAuthorizeUrl(state) };
  }

  @Get('oauth/google/callback')
  @Public()
  async googleOAuthCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Query('error_description') errorDescription: string,
    @Res() res: Response,
  ) {
    let returnTo: string | undefined;
    if (state) {
      try {
        returnTo = this.inboxOAuthService.verifyOAuthState(state).returnTo;
      } catch {
        returnTo = undefined;
      }
    }
    if (error) {
      return res.redirect(
        this.inboxOAuthService.redirectAfterOAuth(
          false,
          errorDescription || error || 'OAuth denied',
          returnTo,
        ),
      );
    }
    if (!code || !state) {
      return res.redirect(
        this.inboxOAuthService.redirectAfterOAuth(
          false,
          'Missing OAuth parameters',
          returnTo,
        ),
      );
    }
    try {
      await this.inboxOAuthService.completeGoogleOAuth(code, state);
      return res.redirect(
        this.inboxOAuthService.redirectAfterOAuth(true, undefined, returnTo),
      );
    } catch (e: any) {
      return res.redirect(
        this.inboxOAuthService.redirectAfterOAuth(
          false,
          e?.message || 'Connection failed',
          returnTo,
        ),
      );
    }
  }

  @Get('oauth/microsoft/callback')
  @Public()
  async microsoftOAuthCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Query('error_description') errorDescription: string,
    @Res() res: Response,
  ) {
    let returnTo: string | undefined;
    if (state) {
      try {
        returnTo = this.inboxOAuthService.verifyOAuthState(state).returnTo;
      } catch {
        returnTo = undefined;
      }
    }
    if (error) {
      return res.redirect(
        this.inboxOAuthService.redirectAfterOAuth(
          false,
          errorDescription || error || 'OAuth denied',
          returnTo,
        ),
      );
    }
    if (!code || !state) {
      return res.redirect(
        this.inboxOAuthService.redirectAfterOAuth(
          false,
          'Missing OAuth parameters',
          returnTo,
        ),
      );
    }
    try {
      await this.inboxOAuthService.completeMicrosoftOAuth(code, state);
      return res.redirect(
        this.inboxOAuthService.redirectAfterOAuth(true, undefined, returnTo),
      );
    } catch (e: any) {
      return res.redirect(
        this.inboxOAuthService.redirectAfterOAuth(
          false,
          e?.message || 'Connection failed',
          returnTo,
        ),
      );
    }
  }

  @Get('providers')
  @Permissions('inbox:read', 'inbox:connect')
  getProviders() {
    return this.inboxAccountsService.getProviderConfigs();
  }

  @Get()
  @Permissions('inbox:read')
  listAccounts(@Request() req: any) {
    return this.inboxAccountsService.listAccountsForUser(
      req.user.userId,
      req.user.email,
    );
  }

  @Post()
  @Permissions('inbox:connect')
  createAccount(
    @Request() req: any,
    @Body()
    body: {
      email: string;
      provider: string;
      displayName?: string;
      password: string;
      imapHost?: string;
      imapPort?: number;
      smtpHost?: string;
      smtpPort?: number;
      outreachType?: 'agency' | 'freelancer' | 'both';
    },
  ) {
    return this.inboxAccountsService.createAccount(req.user.userId, body);
  }

  @Get('resolve-recipient')
  @Permissions('leads:read', 'deals:read', 'contacts:read', 'dashboard:read')
  resolveRecipient(@Query('email') email: string) {
    return this.inboxAccountsService.resolveRecipientEmail(email || '');
  }

  @Get('compose-recipient-search')
  @Permissions('leads:read', 'deals:read', 'contacts:read', 'dashboard:read')
  composeRecipientSearch(@Query('q') q: string) {
    return this.inboxAccountsService.searchComposeRecipients(q || '');
  }

  @Post('check-recipient-suppression')
  @Permissions('inbox:read', 'leads:read', 'deals:read', 'contacts:read')
  checkRecipientSuppression(@Body() body: { emails?: string[] }) {
    return this.inboxAccountsService.checkRecipientSuppression(
      Array.isArray(body?.emails) ? body.emails : [],
    );
  }

  @Get('suggested-send-from')
  @Permissions('inbox:read', 'leads:read', 'deals:read', 'contacts:read')
  suggestedSendFrom(
    @Request() req: any,
    @Query('email') email: string,
    @Query('module') module?: string,
    @Query('entityId') entityId?: string,
  ) {
    return this.inboxAccountsService.getSuggestedSendFromForRecipient(
      req.user.userId,
      email || '',
      { module, entityId },
    );
  }

  @Post('resolve-recipient/create-lead')
  @Permissions('leads:write')
  createQuickLeadFromInbox(
    @Request() req: any,
    @Body() body: { email: string; name?: string },
  ) {
    return this.inboxAccountsService.createQuickLead(
      req.user.userId,
      body.email,
      (body as any).name,
    );
  }

  @Post('send')
  @Permissions('inbox:read', 'leads:write', 'deals:write', 'contacts:write')
  @UseInterceptors(
    FilesInterceptor('attachments', MAX_SEND_ATTACHMENT_COUNT, {
      storage: memoryStorage(),
      limits: { fileSize: MAX_SEND_FILE_SIZE_BYTES },
    }),
  )
  sendFromAccount(
    @Request() req: any,
    @UploadedFiles() files: Express.Multer.File[],
    @Body()
    body: {
      accountId: string;
      to: string;
      subject: string;
      body: string;
      module?: string;
      entityId?: string;
      replyToInboxEmailId?: string;
      enforceCrmRecipient?: string;
      saveCcEmailsToRecord?: string;
      /** When set, links the send to an EmailTemplate for performance reporting */
      templateId?: string;
      /** FormData: repeated `cc` / `bcc`, or legacy `cc[]` / `bcc[]` keys */
      cc?: string | string[];
      bcc?: string | string[];
      'cc[]'?: string | string[];
      'bcc[]'?: string | string[];
    },
  ) {
    const normArr = (v: string | string[] | undefined): string[] => {
      if (!v) return [];
      return Array.isArray(v) ? v : [v];
    };
    const mergeRecipientFields = (
      ...values: Array<string | string[] | undefined>
    ): string[] => {
      const out: string[] = [];
      for (const v of values) {
        out.push(...normArr(v));
      }
      return out;
    };
    const cc = mergeRecipientFields(body.cc, body['cc[]']);
    const bcc = mergeRecipientFields(body.bcc, body['bcc[]']);
    const attachments = (files || []).map((f) => ({
      filename: f.originalname || 'attachment',
      content: f.buffer,
      contentType: f.mimetype || 'application/octet-stream',
    }));

    return this.inboxAccountsService.sendFromAccount(
      req.user.userId,
      body.accountId,
      {
        to: body.to,
        subject: body.subject,
        body: body.body,
        module: body.module,
        entityId: body.entityId,
        replyToInboxEmailId: body.replyToInboxEmailId,
        enforceCrmRecipient: body.enforceCrmRecipient === 'true',
        cc,
        bcc,
        saveCcEmailsToRecord: body.saveCcEmailsToRecord !== 'false',
        templateId: body.templateId,
        attachments,
      },
      req.user.email,
    );
  }

  @Post('send-bulk-smart')
  @Permissions('inbox:read', 'leads:write', 'deals:write', 'contacts:write')
  sendBulkSmart(
    @Request() req: any,
    @Body()
    body: {
      recipients: Array<{
        email: string;
        name?: string;
        module?: 'leads' | 'contacts' | 'organizations' | 'deals' | 'clients';
        entityId?: string;
      }>;
      subject?: string;
      body?: string;
      cc?: string[];
      bcc?: string[];
      enforceCrmRecipient?: boolean;
      mailboxSplit?: { mode?: 'round_robin' | 'random' | 'sticky_entity'; accountIds?: string[] };
      retryOnSendFail?: boolean;
      fallbackInboxAccountIds?: string[];
      aiDraftPerRecipient?: boolean;
      aiInstructions?: string;
      maxEmailsPerSenderInBatch?: number;
      preferredAccountId?: string;
    },
  ) {
    return this.inboxAccountsService.sendBulkSmart(
      req.user.userId,
      body,
      req.user.email,
    );
  }

  @Post(':id/test-smtp')
  @Permissions('inbox:connect')
  testSmtp(@Request() req: any, @Param('id') id: string) {
    return this.inboxAccountsService.testAccountSmtp(
      req.user.userId,
      id,
      req.user.email,
    );
  }

  @Post(':id')
  @Permissions('inbox:connect')
  updateAccount(
    @Request() req: any,
    @Param('id') id: string,
    @Body()
    body: Partial<{
      displayName: string;
      password: string;
      isActive: boolean;
      isDefault: boolean;
      preferImapIdle: boolean;
      sendLimitOverrideEnabled: boolean;
      sendLimitOverrideMaxEmailsPerHour: number | null;
      sendLimitOverrideMaxEmailsPerDay: number | null;
      accountLabel: string;
      outreachType: 'agency' | 'freelancer' | 'both' | null;
      provider: string;
      imapHost: string;
      imapPort: number;
      imapSecure: boolean;
      smtpHost: string;
      smtpPort: number;
      smtpSecure: boolean;
    }>,
  ) {
    return this.inboxAccountsService
      .updateAccount(req.user.userId, id, body, req.user.email)
      .then((account) => {
        if (!account) {
          throw new NotFoundException(
            'Account not found or you do not have permission to edit it',
          );
        }
        return account;
      });
  }

  @Post(':id/sync-profile')
  @Permissions('inbox:connect')
  syncProfile(@Request() req: any, @Param('id') id: string) {
    return this.inboxAccountsService.syncAccountDisplayName(req.user.userId, id);
  }

  @Delete(':id')
  @Permissions('inbox:connect', 'inbox:delete')
  async deleteAccount(@Request() req: any, @Param('id') id: string) {
    const ok = await this.inboxAccountsService.deleteAccount(
      req.user.userId,
      id,
      req.user.email,
    );
    if (!ok) {
      throw new NotFoundException(
        'Account not found or you do not have permission to remove it',
      );
    }
    return { success: true };
  }

  @Post(':id/sync')
  @Permissions('dashboard:read')
  async syncInbox(
    @Request() req: any,
    @Param('id') id: string,
    @Body()
    body?: {
      folder?: string;
      limit?: number;
      all?: boolean;
      folderType?: 'inbox' | 'sent' | 'drafts' | 'trash' | 'spam';
    },
  ) {
    try {
      if (body?.all) {
        const result = await this.inboxAccountsService.syncAllFolders(
          req.user.userId,
          id,
          body?.limit || 100,
          req.user.email,
        );
        return { success: true, ...result };
      }
      const folder =
        body?.folder?.trim() ||
        (body?.folderType
          ? this.inboxAccountsService.resolveSyncFolderPath(body.folderType)
          : 'INBOX');
      const { synced, lockSkipped } = await this.inboxAccountsService.syncInbox(
        req.user.userId,
        id,
        folder,
        body?.limit || 500,
        req.user.email,
      );
      if (lockSkipped) {
        return {
          success: true,
          total: 0,
          folder,
          lockSkipped: true,
          message: 'Sync already in progress for this mailbox',
        };
      }
      return { success: true, total: synced, folder };
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : String(err ?? 'Sync failed');
      throw new BadRequestException(message);
    }
  }

  @Get(':id/send-limit-status')
  @Permissions('inbox:read', 'leads:read', 'deals:read', 'contacts:read')
  getSendLimitStatus(@Request() req: any, @Param('id') id: string) {
    return this.inboxAccountsService.getSendLimitStatus(req.user.userId, id, req.user.email);
  }

  @Get('emails')
  @Permissions('leads:read', 'deals:read', 'contacts:read', 'dashboard:read')
  getInboxEmails(
    @Request() req: any,
    @Query('accountId') accountId?: string,
    @Query('folder') folder?: string,
    @Query('folderType')
    folderType?: 'inbox' | 'sent' | 'drafts' | 'trash' | 'spam' | 'business' | 'promotional' | 'social' | 'other',
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
    /** ISO-8601 datetimes (e.g. from local day start/end) — filter synced emails by `date` */
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('relationshipLabel')
    relationshipLabel?: 'freelancer' | 'agency' | 'both',
    @Query('accountOutreachType')
    accountOutreachType?: 'freelancer' | 'agency' | 'both',
  ) {
    return this.inboxAccountsService.getInboxEmails(req.user.userId, {
      accountId,
      folder,
      folderType,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      search,
      dateFrom,
      dateTo,
      relationshipLabel,
      accountOutreachType,
      userEmail: req.user.email,
    });
  }

  /** One synced message (for reply from record timeline — matches list API shape). */
  @Get('emails/:emailId')
  @Permissions(
    'leads:read',
    'deals:read',
    'contacts:read',
    'organizations:read',
    'dashboard:read',
  )
  async getInboxEmailById(@Request() req: any, @Param('emailId') emailId: string) {
    const email = await this.inboxAccountsService.getInboxEmailByIdForUser(
      req.user.userId,
      emailId,
      req.user.email,
    );
    if (!email) {
      throw new NotFoundException('Email not found');
    }
    return email;
  }

  @Delete('emails/:emailId')
  @Permissions('inbox:connect', 'inbox:delete')
  async deleteInboxEmail(@Request() req: any, @Param('emailId') emailId: string) {
    await this.inboxAccountsService.deleteInboxEmail(
      req.user.userId,
      emailId,
      req.user.email,
    );
    return { success: true };
  }

  /** Conversation view: Inbox + Sent for a participant. */
  @Get(':id/conversation')
  @Permissions('dashboard:read')
  getConversation(
    @Request() req: any,
    @Param('id') id: string,
    @Query('participant') participant?: string,
    @Query('limit') limit?: string,
  ) {
    return this.inboxAccountsService.getConversationEmails(
      req.user.userId,
      id,
      participant || '',
      {
        limit: limit ? parseInt(limit, 10) : undefined,
        userEmail: req.user.email,
      },
    );
  }

  @Post('emails/:id/read')
  @Permissions('dashboard:read')
  markEmailAsRead(@Request() req: any, @Param('id') id: string) {
    return this.inboxAccountsService.markAsRead(
      req.user.userId,
      id,
      req.user.email,
    );
  }

  @Post('emails/:id/label')
  @Permissions('dashboard:read')
  setRelationshipLabel(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: { label?: 'freelancer' | 'agency' | 'both' | null },
  ) {
    return this.inboxAccountsService.updateRelationshipLabel(
      req.user.userId,
      id,
      body?.label ?? null,
      req.user.email,
    );
  }

  @Post('emails/:id/classify')
  @Permissions('dashboard:read')
  updateClassification(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: { category: string; scope?: 'email' | 'sender' | 'domain' },
  ) {
    return this.inboxAccountsService.updateClassificationOverride(
      req.user.userId,
      id,
      body.category,
      body.scope || 'sender',
      req.user.email,
    );
  }

  @Post(':id/share')
  @Permissions('leads:write', 'contacts:write')
  shareAccount(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: { sharedWithUserIds: string[] },
  ) {
    return this.inboxAccountsService.updateEmailAccountSharing(
      req.user.userId,
      id,
      body.sharedWithUserIds,
    );
  }

  /**
   * Stream an email attachment directly from the provider (Outlook Graph / Gmail API / IMAP).
   * No file data is stored on the server — the bytes stream from the provider to the browser.
   */
  @Get('emails/:emailId/attachments/:attachmentId')
  @Permissions('dashboard:read', 'leads:read', 'deals:read', 'contacts:read')
  async downloadAttachment(
    @Request() req: any,
    @Param('emailId') emailId: string,
    @Param('attachmentId') attachmentId: string,
    @Res() res: Response,
  ) {
    const { stream, filename, contentType } =
      await this.inboxAccountsService.streamAttachment(
        req.user.userId,
        emailId,
        attachmentId,
        req.user.email,
      );
    const isPreviewable =
      /^image\//i.test(contentType) || /pdf/i.test(contentType);
    res.setHeader('Content-Type', contentType);
    res.setHeader(
      'Content-Disposition',
      `${isPreviewable ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    // Allow short private cache so thumb + open can reuse the same download.
    res.setHeader(
      'Cache-Control',
      isPreviewable ? 'private, max-age=300' : 'no-store',
    );
    res.setHeader('X-Accel-Buffering', 'no');
    (res as any).flushHeaders?.();
    stream.pipe(res);
  }
}
