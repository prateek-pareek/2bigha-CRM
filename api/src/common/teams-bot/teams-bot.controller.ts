import { All, Controller, Logger, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { TeamsBotService } from './teams-bot.service';
import { TurnContext, ActivityTypes } from 'botbuilder';

/**
 * Receives all Bot Framework webhook calls from Microsoft Teams.
 * This endpoint must be set as the Messaging Endpoint in your Azure Bot resource:
 *   https://your-api-domain.com/api/teams-bot/messages
 *
 * Public — no JWT auth (Bot Framework signs requests with the app credentials internally).
 */
@Controller('teams-bot')
export class TeamsBotController {
  private readonly logger = new Logger(TeamsBotController.name);

    constructor(private readonly teamsBotService: TeamsBotService) { }

  @All('messages')
  async handleMessages(
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const adapter = this.teamsBotService.getAdapter();
    if (!adapter) {
      res.status(503).json({ error: 'Teams bot adapter not initialized' });
      return;
    }

    await adapter.process(req, res, async (turnContext: TurnContext) => {
      const activity = turnContext.activity;
      const activityType = activity.type;

      // ── Case 1: Bot installed / user added to conversation ────────────
      if (activityType === ActivityTypes.ConversationUpdate) {
        const membersAdded = activity.membersAdded || [];
        const botId = activity.recipient?.id;

        for (const member of membersAdded) {
          // Only process the bot being added (not the user being added to a group)
          if (member.id !== botId) continue;

          this.logger.log(
            `Bot installed — conversation update from: ${activity.from?.name || 'unknown'} (${activity.from?.id || 'no-id'})`,
          );

                    // Save the conversation reference for whoever triggered the install
                    // In org-wide install, Teams sends this from the user's context
                    await this.teamsBotService.saveConversationReference(turnContext);

          // Welcome the user
          try {
            await turnContext.sendActivity(
              "👋 Hi! I'm the **2Bigha Notifier**. I'll send you proactive notifications directly here in Teams whenever a task is assigned to you or you're mentioned.",
            );
          } catch (err) {
            this.logger.warn('Failed to send welcome message', err);
          }
        }
        return;
      }

      // ── Case 2: User sends a message to the bot ───────────────────────
      if (activityType === ActivityTypes.Message) {
        const text = (activity.text || '').trim().toLowerCase();

                // Always update/save the conversation reference when user messages the bot
                // This is the most reliable way to get an email-mapped ref
                await this.teamsBotService.saveConversationReference(turnContext);

        // Simple command responses
        if (text === 'help' || text === '/help') {
          await turnContext.sendActivity(
            '**2Bigha Notifier** — available commands:\n\n' +
              '• `status` — check if your notifications are set up\n' +
              '• `help` — show this message\n\n' +
              "You'll automatically receive DMs when tasks are assigned to you in 2Bigha.",
          );
        } else if (text === 'status') {
          const email = activity.from?.name?.includes('@')
            ? activity.from.name
            : 'your account';
          await turnContext.sendActivity(
            `✅ You're all set, ${activity.from?.name || 'there'}! Your conversation reference has been saved. ` +
              `Future task assignment notifications will be sent here for **${email}**.`,
          );
        } else {
          await turnContext.sendActivity(
            `Hi ${activity.from?.name?.split(' ')[0] || 'there'}! I'm here to notify you about tasks. ` +
              `Type \`help\` to see available commands.`,
          );
        }
        return;
      }

      // ── Other activity types — silently handled ────────────────────────
      this.logger.debug(`Received unhandled activity type: ${activityType}`);
    });
  }
}
