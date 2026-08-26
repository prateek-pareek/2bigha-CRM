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
 * a phone number + message text (or, failing that, a status update) using a
 * handful of common field-name guesses plus the raw Meta Cloud API shape,
 * since AiSensy is built on top of it and may forward it near-verbatim.
 * Tighten `extractInbound()`/`extractStatusUpdate()` once real payloads are
 * visible in the logs — do not assume this parsing is correct yet.
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
      const db = (this.whatsappService as any).integrationModel?.db || (this.whatsappService as any).messageModel?.db;
      if (db) {
        await db.collection('raw_webhooks').insertOne({
          receivedAt: new Date(),
          body,
          url: req.url,
          headers: req.headers,
        });
      }
    } catch (e: any) {
      this.logger.error(`Failed to save raw webhook for diagnostics: ${e?.message}`);
    }

    try {
      const inbound = this.extractInbound(body);
      if (inbound) {
        if (inbound.sender === 'AGENT' || inbound.sender === 'ASSISTANT') {
          await this.whatsappService.saveOutgoingWebhook(
            inbound.waId,
            inbound.text,
            inbound.messageId,
            inbound.attachment,
          );
        } else {
          await this.whatsappService.saveIncoming(
            inbound.waId,
            inbound.text,
            inbound.messageId,
            inbound.attachment,
          );
        }
        return;
      }

      const statusUpdate = this.extractStatusUpdate(body);
      if (statusUpdate) {
        await this.whatsappService.updateMessageStatus(
          statusUpdate.messageId,
          statusUpdate.status,
          { raw: body },
        );
        return;
      }

      this.logger.warn(
        'AiSensy webhook payload did not match any known inbound-message or status shape — skipped. ' +
          'See the raw payload logged above to extend extractInbound()/extractStatusUpdate().',
      );
    } catch (e: any) {
      this.logger.error(`AiSensy webhook processing error: ${e?.message}`);
    }
  }

  /**
   * Best-effort extraction of {waId, text, messageId, sender, attachment} from an unconfirmed
   * payload shape. Tries a handful of field names seen across common WABA
   * BSP webhook conventions (AiSensy's own, and the wider Meta-partner
   * ecosystem it's built on) — narrow this down to AiSensy's actual shape
   * once real traffic is observed.
   */
  private extractInbound(
    body: any,
  ): {
    waId: string;
    text: string;
    messageId: string;
    sender: string;
    attachment?: {
      type: 'image' | 'document' | 'video' | 'audio';
      url: string;
      filename?: string;
    };
  } | null {
    // 1. Check official AiSensy "message.created" or real "message.sender.user" topic
    if ((body?.topic === 'message.created' || body?.topic === 'message.sender.user') && body?.data) {
      const data = body.data.message || body.data;
      const rawPhone = data.phone_number || data.contact?.phoneNumber || data.contact?.phone || data.from;
      const waId = String(rawPhone || '').replace(/\D/g, '');
      const messageId = String(data.messageId || data.id || `aisensy_${Date.now()}`);
      const sender = String(data.sender || 'USER').toUpperCase();

      if (waId.length >= 10) {
        let text = '';
        let attachment: any = undefined;

        const typeUpper = String(data.message_type || data.type || '').toUpperCase();

        if (['IMAGE', 'DOCUMENT', 'VIDEO', 'AUDIO', 'FILE'].includes(typeUpper)) {
          attachment = {
            type: typeUpper === 'FILE' ? 'document' : typeUpper.toLowerCase(),
            url: data.message_content?.url || data.media?.url || (data.content?.startsWith('http') ? data.content : ''),
            filename: data.message_content?.filename || data.media?.filename || data.filename || undefined,
          };
          text = data.message_content?.caption || data.caption || (!data.content?.startsWith('http') ? data.content : '') || `[${typeUpper}]`;
        } else {
          text = data.message_content?.text || data.content || '';
        }

        return { waId, text, messageId, sender, attachment };
      }
    }

    // 2. Fallback to Meta Cloud API webhook forwarded shape
    const metaValue = body?.entry?.[0]?.changes?.[0]?.value;
    const metaMessage = metaValue?.messages?.[0];
    if (metaMessage?.from) {
      const waId = String(metaMessage.from).replace(/\D/g, '');
      const messageId = String(metaMessage.id);
      const sender = 'USER';

      if (waId.length >= 10) {
        let text = '';
        let attachment: any = undefined;

        if (metaMessage.type === 'text') {
          text = String(metaMessage.text?.body || '').trim();
        } else if (['image', 'document', 'video', 'audio'].includes(metaMessage.type)) {
          const mediaObj = metaMessage[metaMessage.type];
          if (mediaObj?.id) {
            attachment = {
              type: metaMessage.type,
              url: `meta_media://${mediaObj.id}`, // Placeholder prefix to resolve later
              filename: mediaObj.filename || undefined,
            };
            text = metaMessage.caption || `[${metaMessage.type.toUpperCase()}]`;
          }
        }

        if (text || attachment) {
          return { waId, text, messageId, sender, attachment };
        }
      }
    }

    // 3. Fallback to candidate fields
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
        return { waId, text, messageId: String(rawId || `aisensy_${Date.now()}`), sender: 'USER' };
      }
    }

    return null;
  }

  /**
   * Best-effort extraction of a delivery/read/failed status update — same
   * "unconfirmed shape, log + guess" approach as `extractInbound()`. Checked
   * only once `extractInbound()` finds nothing, since a status payload has
   * no message text to key off of.
   */
  private extractStatusUpdate(body: any): { messageId: string; status: string } | null {
    if (body?.topic === 'message.status.updated' && body?.data) {
      const data = body.data;
      const rawId = data.messageId || data.id;
      const rawStatus = data.status || data.messageStatus || data.event;
      const status = String(rawStatus || '').toLowerCase();
      if (rawId && ['sent', 'delivered', 'read', 'failed'].includes(status)) {
        return { messageId: String(rawId), status };
      }
    }

    const metaStatus = body?.entry?.[0]?.changes?.[0]?.value?.statuses?.[0];
    if (metaStatus?.id && metaStatus?.status) {
      return { messageId: String(metaStatus.id), status: String(metaStatus.status) };
    }

    const candidates = [body, body?.data, body?.payload];
    for (const c of candidates) {
      if (!c) continue;
      const rawId = c.messageId || c.msgId || c.message_id || c.id;
      const rawStatus = c.status || c.messageStatus || c.event;
      const status = String(rawStatus || '').toLowerCase();
      if (
        rawId &&
        ['sent', 'delivered', 'read', 'failed'].includes(status)
      ) {
        return { messageId: String(rawId), status };
      }
    }
    return null;
  }
}
