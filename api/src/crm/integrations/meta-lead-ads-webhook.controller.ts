import { Controller, Get, Post, Query, Req, Res, Logger } from '@nestjs/common';
import * as express from 'express';
import * as crypto from 'crypto';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MetaLeadAdsService } from './meta-lead-ads.service';
import { Integration } from './schemas/integration.schema';

@Controller('webhooks/meta-leadgen')
export class MetaLeadAdsWebhookController {
  private readonly logger = new Logger(MetaLeadAdsWebhookController.name);
  private warnedMissingAppSecret = false;

  constructor(
    private readonly metaLeadAdsService: MetaLeadAdsService,
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
      process.env.META_LEAD_ADS_WEBHOOK_VERIFY_TOKEN || 'mathionix-verify';
    if (mode === 'subscribe' && token === verifyToken) {
      this.logger.log('Meta Lead Ads webhook verified');
      return res.status(200).send(challenge);
    }
    this.logger.warn('Meta Lead Ads webhook verification failed');
    return res.status(403).send('Forbidden');
  }

  /**
   * Same HMAC-SHA256-over-raw-body scheme as WhatsAppWebhookController (see
   * its doc comment for the full rationale) — reads the App Secret off the
   * `type: 'meta-leadgen'` Integration doc instead of `'whatsapp'`, since a
   * CRM can have a distinct Meta App (or none configured yet) behind each.
   */
  private async verifySignature(req: express.Request): Promise<boolean> {
    const config = await this.integrationModel
      .findOne({ type: 'meta-leadgen' })
      .select('appSecret')
      .lean()
      .exec();
    const appSecret = config?.appSecret ? String(config.appSecret) : '';

    if (!appSecret) {
      if (!this.warnedMissingAppSecret) {
        this.warnedMissingAppSecret = true;
        this.logger.warn(
          'No Meta App Secret configured for Lead Ads — inbound webhook signature is NOT being verified. ' +
            'Set one under Settings → Integrations → Meta Lead Ads to close this off.',
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
  async handleWebhook(@Req() req: express.Request, @Res() res: express.Response) {
    if (!(await this.verifySignature(req))) {
      this.logger.warn('Meta Lead Ads webhook signature verification failed — rejecting');
      return res.status(401).send('Invalid signature');
    }

    // Ack immediately — Meta retries delivery aggressively on anything but a
    // fast 200, and the actual Graph API lookup + Lead creation can take a
    // moment. See WhatsAppWebhookController for the same pattern.
    res.status(200).send('OK');

    const body = req.body;
    if (body?.object !== 'page') return;

    try {
      for (const entry of body.entry || []) {
        for (const change of entry.changes || []) {
          if (change.field !== 'leadgen') continue;
          const value = change.value || {};
          const leadgenId = value.leadgen_id ? String(value.leadgen_id) : undefined;
          if (!leadgenId) continue;
          await this.metaLeadAdsService.processLeadgenEvent({
            leadgenId,
            formId: value.form_id ? String(value.form_id) : undefined,
            pageId: value.page_id
              ? String(value.page_id)
              : entry.id
                ? String(entry.id)
                : undefined,
          });
        }
      }
    } catch (e) {
      this.logger.error(`Meta Lead Ads webhook processing error: ${e}`);
    }
  }
}
