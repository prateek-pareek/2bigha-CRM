import { Controller, Get, Post, Query, Req, Res, Logger } from '@nestjs/common';
import * as express from 'express';
import { WhatsAppService } from './whatsapp.service';

@Controller('webhooks/whatsapp')
export class WhatsAppWebhookController {
  private readonly logger = new Logger(WhatsAppWebhookController.name);

  constructor(private readonly whatsappService: WhatsAppService) {}

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

  @Post()
  async handleWebhook(
    @Req() req: express.Request,
    @Res() res: express.Response,
  ) {
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
            if (msg.type === 'text') {
              const from = msg.from;
              const text = msg.text?.body || '';
              const id = msg.id;
              await this.whatsappService.saveIncoming(String(from), text, id);
            }
          }
        }
      }
    } catch (e) {
      this.logger.error(`Webhook processing error: ${e}`);
    }
  }
}
