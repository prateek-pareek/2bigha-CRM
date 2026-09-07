import {
  Controller,
  Post,
  Get,
  Body,
  Headers,
  Query,
  Res,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { HrmsIntegrationService } from './hrms-integration.service';
import { HrmsSyncEnvelope } from './hrms-sync.types';

@Controller('webhooks/hrms')
export class HrmsWebhookController {
  private readonly logger = new Logger(HrmsWebhookController.name);

  constructor(private readonly hrmsIntegration: HrmsIntegrationService) {}

  @Get('health')
  health() {
    return { ok: true, service: 'hrms-webhook' };
  }

  /**
   * Inbound HRMS sync events.
   * Auth: HRMS_WEBHOOK_SECRET via header `x-hrms-secret` / query `secret`,
   * or HMAC-SHA256 of raw body in `x-hrms-signature` (hex) using the same secret.
   */
  @Post()
  async handle(
    @Body() body: HrmsSyncEnvelope | { events?: HrmsSyncEnvelope[] },
    @Res() res: Response,
    @Query('secret') querySecret?: string,
    @Headers('x-hrms-secret') headerSecret?: string,
    @Headers('x-hrms-signature') signature?: string,
  ) {
    const expected = process.env.HRMS_WEBHOOK_SECRET;
    if (expected) {
      const provided = headerSecret || querySecret;
      const hmacOk = this.verifyHmac(signature, body, expected);
      const secretOk = provided && provided === expected;
      if (!hmacOk && !secretOk) {
        return res.status(401).send('Unauthorized');
      }
    }

    // Ack quickly; process synchronously for reliability in this deploy
    res.status(200).json({ accepted: true });

    const events: HrmsSyncEnvelope[] = Array.isArray((body as any)?.events)
      ? (body as any).events
      : [body as HrmsSyncEnvelope];

    for (const event of events) {
      try {
        await this.hrmsIntegration.handleEnvelope(event);
      } catch (err) {
        this.logger.error('Failed processing HRMS webhook event', err as Error);
      }
    }
  }

  private verifyHmac(
    signature: string | undefined,
    body: unknown,
    secret: string,
  ): boolean {
    if (!signature) return false;
    try {
      const raw =
        typeof body === 'string' ? body : JSON.stringify(body ?? {});
      const digest = createHmac('sha256', secret).update(raw).digest('hex');
      const a = Buffer.from(digest);
      const b = Buffer.from(String(signature).replace(/^sha256=/i, ''));
      return a.length === b.length && timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }
}
