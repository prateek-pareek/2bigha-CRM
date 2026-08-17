import { Controller, Get, Headers, Logger, Post, Query, Req, Res } from '@nestjs/common';
import * as express from 'express';
import { WhatsAppService } from './whatsapp.service';

/**
 * Inbound webhook for AiSensy (https://aisensy.com).
 *
 * UNLIKE `whatsapp-webhook.controller.ts` (Meta's Cloud API, payload shape
 * confirmed against Meta's own docs), AiSensy's inbound webhook payload
 * shape is NOT publicly documented — this controller is deliberately
 * defensive: it always logs the raw body (critical for figuring out the
 * real shape once this account's webhook is actually wired up and firing),
 * and only calls into message persistence when it can confidently pick out
 * a phone number + message text using a handful of common field-name
 * guesses. Tighten `extractInboundText()` once real payloads are visible in
 * the logs — do not assume this parsing is correct yet.
 */
@Controller('webhooks/aisensy')
export class AiSensyWebhookController {
  private readonly logger = new Logger(AiSensyWebhookController.name);

  constructor(private readonly whatsappService: WhatsAppService) {}

  /** Harmless liveness check — some dashboards ping the URL before saving it. */
  @Get()
  ping(@Res() res: express.Response) {
    return res.status(200).send('OK');
  }

  @Post()
  async handleWebhook(
    @Req() req: express.Request,
    @Res() res: express.Response,
    @Query('secret') querySecret?: string,
    @Headers('x-aisensy-secret') headerSecret?: string,
  ) {
    const expectedSecret = process.env.AISENSY_WEBHOOK_SECRET;
    if (expectedSecret && querySecret !== expectedSecret && headerSecret !== expectedSecret) {
      this.logger.warn('AiSensy webhook received with an invalid/missing secret — rejecting');
      return res.status(401).send('Unauthorized');
    }

    // Ack immediately — never let our processing time or a downstream error
    // trigger the provider's retry logic (same pattern as the Meta webhook).
    res.status(200).send('OK');

    const body = req.body || {};
    this.logger.log(`AiSensy webhook payload: ${JSON.stringify(body)}`);

    try {
      const inbound = this.extractInbound(body);
      if (inbound) {
        await this.whatsappService.saveIncoming(
          inbound.waId,
          inbound.text,
          inbound.messageId,
        );
      } else {
        this.logger.warn(
          'AiSensy webhook payload did not match any known inbound-message shape — skipped. ' +
            'See the raw payload logged above to extend extractInbound().',
        );
      }
    } catch (e: any) {
      this.logger.error(`AiSensy webhook processing error: ${e?.message}`);
    }
  }

  /**
   * Best-effort extraction of {waId, text, messageId} from an unconfirmed
   * payload shape. Tries a handful of field names seen across common WABA
   * BSP webhook conventions (AiSensy's own, and the wider Meta-partner
   * ecosystem it's built on) — narrow this down to AiSensy's actual shape
   * once real traffic is observed.
   */
  private extractInbound(
    body: any,
  ): { waId: string; text: string; messageId: string } | null {
    const candidates = [body, body?.data, body?.payload, body?.message, body?.entry?.[0]];

    for (const c of candidates) {
      if (!c) continue;
      const rawPhone =
        c.from || c.waId || c.mobile || c.sender || c.contact?.phone || c.destination;
      const rawText =
        (typeof c.text === 'string' ? c.text : c.text?.body) ||
        c.message ||
        c.body ||
        c.messageText;
      const rawId = c.id || c.messageId || c.msgId || c.message_id;

      const waId = String(rawPhone || '').replace(/\D/g, '');
      const text = String(rawText || '').trim();
      if (waId.length >= 10 && text) {
        return { waId, text, messageId: String(rawId || `aisensy_${Date.now()}`) };
      }
    }
    return null;
  }
}
