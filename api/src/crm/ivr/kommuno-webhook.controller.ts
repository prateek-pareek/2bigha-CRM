import { Controller, Get, Headers, Logger, Post, Query, Req, Res } from '@nestjs/common';
import * as express from 'express';
import { IvrService } from './ivr.service';

/**
 * Inbound "Response URL" webhook for Kommuno (KOMMUNO Developers Guide v4.9,
 * `POST call/event/callback`) — fires when a call (incoming or outgoing)
 * completes, carrying duration/status/recording. Register this controller's
 * URL with Kommuno's team as your account's Response URL.
 *
 * No auth scheme is documented by Kommuno for this callback, so — same
 * pattern as the AiSensy WhatsApp webhook — an optional shared secret
 * (KOMMUNO_WEBHOOK_SECRET) is checked only if you've set one.
 */
@Controller('webhooks/kommuno')
export class KommunoWebhookController {
  private readonly logger = new Logger(KommunoWebhookController.name);

  constructor(private readonly ivrService: IvrService) {}

  /** Liveness check — useful when pasting the URL into Kommuno's dashboard. */
  @Get()
  ping(@Res() res: express.Response) {
    return res.status(200).send('OK');
  }

  @Post()
  async handleCallback(
    @Req() req: express.Request,
    @Res() res: express.Response,
    @Query('secret') querySecret?: string,
    @Headers('x-kommuno-secret') headerSecret?: string,
  ) {
    const expectedSecret = process.env.KOMMUNO_WEBHOOK_SECRET;
    if (expectedSecret && querySecret !== expectedSecret && headerSecret !== expectedSecret) {
      this.logger.warn('Kommuno webhook received with an invalid/missing secret — rejecting');
      return res.status(401).send('Unauthorized');
    }

    // Ack immediately — never let processing time or a downstream error
    // trigger Kommuno's retry logic.
    res.status(200).send('OK');

    const body = req.body || {};
    this.logger.log(`Kommuno webhook payload: ${JSON.stringify(body).slice(0, 1000)}`);

    try {
      await this.ivrService.handleKommunoCallback(body);
    } catch (e: any) {
      this.logger.error(`Kommuno webhook processing error: ${e?.message}`);
    }
  }
}
