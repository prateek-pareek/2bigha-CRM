import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
    CloudAdapter,
    ConfigurationBotFrameworkAuthentication,
    ConfigurationServiceClientCredentialFactory,
    ConversationReference,
    Activity,
    TurnContext,
    TeamsInfo,
} from 'botbuilder';
import { ConversationRef, ConversationRefDocument } from './conversation-ref.schema';

export type BotDmResult = { success: true } | { success: false; error: string };

export interface BotDmMetadata {
    priority?: string;
    status?: string;
    projectName?: string;
    reporterName?: string;
}

export type TeamsDmConfigurationStatus = {
    botReady: boolean;
    teamsWebhookUrlConfigured: boolean;
};

@Injectable()
export class TeamsBotService implements OnModuleInit {
    private readonly logger = new Logger(TeamsBotService.name);
    private adapter: CloudAdapter | null = null;
    private appId: string = '';

    constructor(
        private readonly configService: ConfigService,
        @InjectModel(ConversationRef.name)
        private readonly convRefModel: Model<ConversationRefDocument>,
    ) {}

    onModuleInit() {
        this.appId = this.configService.get<string>('TEAMS_CLIENT_ID') || '';
        const appId = this.appId;
        const appPassword = this.configService.get<string>('TEAMS_CLIENT_SECRET') || '';

        if (!appId || !appPassword) {
            this.logger.warn(
                'TEAMS_CLIENT_ID or TEAMS_CLIENT_SECRET not set — Teams Bot proactive DMs disabled.',
            );
            return;
        }

        const tenantId = this.configService.get<string>('TEAMS_TENANT_ID') || '';

        // Modern CloudAdapter initialization ensures perfect tenant/audience validation
        const credentialsFactory = new ConfigurationServiceClientCredentialFactory({
            MicrosoftAppId: appId,
            MicrosoftAppPassword: appPassword,
            MicrosoftAppType: tenantId && tenantId.toLowerCase() !== 'common' ? 'SingleTenant' : 'MultiTenant',
            MicrosoftAppTenantId: tenantId,
        });

        const botFrameworkAuthentication = new ConfigurationBotFrameworkAuthentication({}, credentialsFactory);
        this.adapter = new CloudAdapter(botFrameworkAuthentication);

        // Catch-all error handler so the bot never crashes the server
        this.adapter.onTurnError = async (context: TurnContext, error: Error) => {
            this.logger.error(`[CloudAdapter] onTurnError: ${error.message}`, error.stack);
            try {
                await context.sendActivity('An error occurred. Please try again later.');
            } catch (_) {
                // ignore
            }
        };

        this.logger.log('Teams Bot adapter initialized successfully.');
    }

    /** Called by the controller to process every incoming Bot Framework activity */
    getAdapter(): CloudAdapter | null {
        return this.adapter;
    }

    /** Safe to expose in API — no secrets. */
    getConfigurationStatus(): TeamsDmConfigurationStatus {
        const webhook = (this.configService.get<string>('TEAMS_WEBHOOK_URL') || '').trim();
        return {
            botReady: this.adapter !== null,
            teamsWebhookUrlConfigured: webhook.length > 0,
        };
    }

    /**
     * Store or update the conversation reference for a user.
     * Called when the bot receives a conversationUpdate (user installs bot)
     * or any message activity from the user.
     */
    async saveConversationReference(context: TurnContext): Promise<void> {
        try {
            const activity = context.activity;
            const ref = TurnContext.getConversationReference(activity);
            let email = this.extractEmail(activity);

            // If payload doesn't contain email, natively lookup the member profile via TeamsInfo
            if (!email && activity.from?.id && activity.channelId === 'msteams') {
                try {
                    const member = await TeamsInfo.getMember(context, activity.from.id);
                    this.logger.log(`Teams member info found: ${JSON.stringify(member)}`);
                    const memberEmail = member.email || member.userPrincipalName;
                    if (memberEmail) {
                        email = memberEmail.toLowerCase();
                        this.logger.log(`Extracted email from TeamsInfo: ${email}`);
                    }
                } catch (teamsInfoError: any) {
                    this.logger.debug(`Could not lookup TeamsInfo for member: ${teamsInfoError.message}`);
                }
            }

            if (!email) {
                this.logger.debug('saveConversationReference: could not extract email from activity, skipping.');
                return;
            }

            const aadObjectId = activity.from?.aadObjectId || undefined;
            const serviceUrl = activity.serviceUrl || undefined;

            await this.convRefModel.findOneAndUpdate(
                { userEmail: email.toLowerCase() },
                {
                    userEmail: email.toLowerCase(),
                    aadObjectId,
                    conversationReference: ref as unknown as Record<string, unknown>,
                    serviceUrl,
                },
                { upsert: true, returnDocument: 'after' },
            );

            this.logger.log(`Conversation reference saved for ${email}`);
        } catch (err) {
            this.logger.error('Failed to save conversation reference', err);
        }
    }

    /**
     * Send a proactive Teams DM to user by email.
     * Requires the conversation reference to be previously stored (bot installed by the user).
     */
    async sendProactiveDM(
        recipientEmail: string,
        title: string,
        body: string,
        link?: string,
        metadata?: BotDmMetadata,
    ): Promise<BotDmResult> {
        if (!this.adapter) {
            this.logger.warn('Cannot send proactive DM: Teams Bot adapter is missing TEAMS_CLIENT_ID / TEAMS_CLIENT_SECRET');
            return { success: false, error: 'Teams Bot adapter not initialized (missing TEAMS_CLIENT_ID / TEAMS_CLIENT_SECRET).' };
        }

        const email = (recipientEmail || '').toLowerCase().trim();
        if (!email || !email.includes('@')) {
            return { success: false, error: 'Invalid recipient email.' };
        }

        const doc = await this.convRefModel.findOne({ userEmail: email }).lean().exec();
        if (!doc) {
            this.logger.warn(
                `No conversation reference for ${email} — bot not yet installed for this user. Skipping Teams DM.`,
            );
            return {
                success: false,
                error: `Bot not installed for ${email}. Install the 2Bigha Notifier app in Teams first.`,
            };
        }

        const ref = doc.conversationReference as unknown as ConversationReference;

        // Build the Adaptive Card message body
        const safeLink = link && (link.startsWith('http://') || link.startsWith('https://')) ? link : undefined;
        const cleanBody = this.stripHtml(body);

        const messageText = `**${title}**\n\n${cleanBody}${safeLink ? `\n\n[View details](${safeLink})` : ''}`;

        const adaptiveCard = {
            type: 'AdaptiveCard',
            $schema: 'https://adaptivecards.io/schemas/adaptive-card.json',
            version: '1.3',
            body: [
                {
                    type: 'TextBlock',
                    text: title,
                    weight: 'Bolder',
                    size: 'Medium',
                    wrap: true,
                    color: 'Accent',
                },
                {
                    type: 'TextBlock',
                    text: cleanBody,
                    wrap: true,
                    spacing: 'Medium',
                },
                ...(metadata
                    ? [
                          {
                              type: 'FactSet',
                              spacing: 'Medium',
                              facts: [
                                  ...(metadata.projectName ? [{ title: 'Project', value: metadata.projectName }] : []),
                                  ...(metadata.status ? [{ title: 'Status', value: metadata.status }] : []),
                                  ...(metadata.priority ? [{ title: 'Priority', value: metadata.priority }] : []),
                                  ...(metadata.reporterName ? [{ title: 'Reported By', value: metadata.reporterName }] : []),
                              ],
                          },
                      ]
                    : []),
            ],
            ...(safeLink
                ? {
                      actions: [
                          {
                              type: 'Action.OpenUrl',
                              title: 'View Details',
                              url: safeLink,
                              style: 'positive',
                          },
                      ],
                  }
                : {}),
        };

        const activity: Partial<Activity> = {
            type: 'message',
            text: messageText, // fallback text for notifications
            attachments: [
                {
                    contentType: 'application/vnd.microsoft.card.adaptive',
                    content: adaptiveCard,
                },
            ],
        };

        try {
            await this.adapter.continueConversationAsync(this.appId, ref, async (turnContext: TurnContext) => {
                await turnContext.sendActivity(activity);
            });

            this.logger.log(`Proactive Teams DM sent to ${email}: "${title}"`);
            return { success: true };
        } catch (err: any) {
            const msg = err?.message || String(err);
            this.logger.error(`Failed to send proactive Teams DM to ${email}: ${msg}`, err);
            return { success: false, error: msg };
        }
    }

    /**
     * Check if a user has the bot installed (has a stored conversation reference).
     */
    async isBotInstalledForUser(email: string): Promise<boolean> {
        const doc = await this.convRefModel
            .findOne({ userEmail: email.toLowerCase().trim() })
            .lean()
            .exec();
        return !!doc;
    }

    // ─── Private helpers ─────────────────────────────────────────────────────

    /**
     * Converts basic HTML to Adaptive Card markdown and strips remaining tags.
     * <b>text</b> → **text**, <br> → newline, strips all other tags.
     */
    private stripHtml(html: string): string {
        return html
            .replace(/<b>(.*?)<\/b>/gi, '**$1**')
            .replace(/<strong>(.*?)<\/strong>/gi, '**$1**')
            .replace(/<i>(.*?)<\/i>/gi, '_$1_')
            .replace(/<em>(.*?)<\/em>/gi, '_$1_')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<[^>]+>/g, '')  // strip remaining tags
            .trim();
    }

    /**
     * Try to extract the user's Microsoft 365 email from the Bot activity.
     */
    private extractEmail(activity: Partial<Activity>): string | null {
        // 1. Direct email in from (not always present in Teams)
        const fromName = activity.from?.name || '';
        if (fromName.includes('@')) return fromName.toLowerCase();

        // 2. Check channelData for Teams-specific user info
        const channelData = activity.channelData as Record<string, any> | undefined;
        const teamsEmail =
            channelData?.teamsUserEmail ||
            channelData?.tenant?.userEmail ||
            channelData?.userEmail;
        if (teamsEmail && teamsEmail.includes('@')) return String(teamsEmail).toLowerCase();

        // 3. If the bot was handed the email via the entities array (teams enrichment)
        if (Array.isArray((activity as any).entities)) {
            for (const ent of (activity as any).entities) {
                if (ent?.type === 'mention' && ent?.mentioned?.name?.includes('@')) {
                    return String(ent.mentioned.name).toLowerCase();
                }
            }
        }

        return null;
    }
}
