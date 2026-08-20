import { Controller, Get, Post, Query, Req, Res, Logger } from '@nestjs/common';
import * as express from 'express';
import * as crypto from 'crypto';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { WhatsAppService } from './whatsapp.service';
import { Integration } from './schemas/integration.schema';

@Controller('webhooks/whatsapp')
export class WhatsAppWebhookController {
  private readonly logger = new Logger(WhatsAppWebhookController.name);
  private warnedMissingAppSecret = false;

  constructor(
    private readonly whatsappService: WhatsAppService,
    @InjectModel(Integration.name, 'crmConnection')
    private readonly integrationModel: Model<any>,
  ) {}

  @Get()
  verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: express.Response,
  ) {
    const verifyToken =
      process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'mathionix-verify';
    if (mode === 'subscribe' && token === verifyToken) {
      this.logger.log('WhatsApp webhook verified');
      return res.status(200).send(challenge);
    }
    this.logger.warn('WhatsApp webhook verification failed');
    return res.status(403).send('Forbidden');
  }

  /**
   * Verifies the `X-Hub-Signature-256` header Meta attaches to every POST —
   * HMAC-SHA256 of the raw request body, keyed with the App Secret, hex
   * digest prefixed `sha256=`. Must run over the *raw* bytes (req.rawBody,
   * enabled via `rawBody: true` in main.ts) since re-serializing the parsed
   * JSON body would produce a different byte sequence and always fail.
   *
   * Returns true when there's no App Secret configured yet (permissive, with
   * a one-time warning) so existing unconfigured installs don't start
   * silently dropping webhooks the moment this shipped — but every account
   * should set one under Settings → Integrations → WhatsApp.
   */
  private async verifySignature(req: express.Request): Promise<boolean> {
    const config = await this.integrationModel
      .findOne({ type: 'whatsapp' })
      .select('appSecret')
      .lean()
      .exec();
    const appSecret = config?.appSecret ? String(config.appSecret) : '';

    if (!appSecret) {
      if (!this.warnedMissingAppSecret) {
        this.warnedMissingAppSecret = true;
        this.logger.warn(
          'No Meta App Secret configured — inbound webhook signature is NOT being verified. ' +
            'Set one under Settings → Integrations → WhatsApp to close this off.',
        );
      }
      return true;
    }

    const header = req.headers['x-hub-signature-256'];
    const signature = Array.isArray(header) ? header[0] : header;
    const raw = (req as any).rawBody as Buffer | undefined;
    if (!signature || !raw) return false;

    const expected =
      'sha256=' + crypto.createHmac('sha256', appSecret).update(raw).digest('hex');

    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }

  @Post()
  async handleWebhook(
    @Req() req: express.Request,
    @Res() res: express.Response,
  ) {
    if (!(await this.verifySignature(req))) {
      this.logger.warn('WhatsApp webhook signature verification failed — rejecting');
      return res.status(401).send('Invalid signature');
    }

    res.status(200).send('OK');

    const body = req.body;
    if (body?.object !== 'whatsapp_business_account') return;

    try {
      for (const entry of body.entry || []) {
        for (const change of entry.changes || []) {
          if (change.field !== 'messages') continue;
          const value = change.value;

          const messages = value?.messages || [];
          for (const msg of messages) {
            const from = msg.from;
            const id = msg.id;

            if (msg.type === 'text') {
              const text = msg.text?.body || '';
              await this.whatsappService.saveIncoming(String(from), text, id);
            } else if (['image', 'document', 'video', 'audio'].includes(msg.type)) {
              const mediaObj = msg[msg.type];
              if (mediaObj?.id) {
                void this.whatsappService.handleMediaMessage(
                  String(from),
                  String(mediaObj.id),
                  msg.type,
                  msg.caption,
                  id,
                ).catch((err) => this.logger.error(`Media download failed: ${err.message}`));
              }
            }
          }

          // Delivery/read receipts — value.statuses[]: { id, status: 'sent'
          // | 'delivered' | 'read' | 'failed', timestamp, recipient_id,
          // errors? }. Without this, WhatsAppMessage.status is set once on
          // send and never reflects what actually happened to the message.
          const statuses = value?.statuses || [];
          for (const st of statuses) {
            if (!st?.id || !st?.status) continue;
            await this.whatsappService.updateMessageStatus(String(st.id), String(st.status), {
              timestamp: st.timestamp,
              recipientId: st.recipient_id,
              errors: st.errors,
            });
          }
        }
      }
    } catch (e) {
      this.logger.error(`Webhook processing error: ${e}`);
    }
  }
}
