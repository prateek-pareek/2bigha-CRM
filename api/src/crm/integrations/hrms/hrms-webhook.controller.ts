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
import {
  HRMS_SYNC_RESPONSE_EVENT_TYPES,
  HrmsSyncEnvelope,
} from './hrms-sync.types';

@Controller('webhooks/hrms')
export class HrmsWebhookController {
  private readonly logger = new Logger(HrmsWebhookController.name);

  constructor(private readonly hrmsIntegration: HrmsIntegrationService) {}

  @Get('health')
  health() {
    return { ok: true, service: 'hrms-webhook' };
  }

  /** Roles + HRMS-linked users for the HRMS "Pull from CRM" reconcile. Same secret as POST. */
  @Get('snapshot')
  async snapshot(
    @Res() res: Response,
    @Headers('x-hrms-secret') headerSecret?: string,
  ) {
    const expected = process.env.HRMS_WEBHOOK_SECRET;
    // Exposes users — never serve it without a configured shared secret.
    if (!expected || headerSecret !== expected) {
      return res.status(401).send('Unauthorized');
    }
    return res.status(200).json(await this.hrmsIntegration.snapshot());
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

    const events: HrmsSyncEnvelope[] = Array.isArray((body as any)?.events)
      ? (body as any).events
      : [body as HrmsSyncEnvelope];

    // Role / assignment events answer with the resulting CRM state (role id, user status),
    // so process them before responding. Everything else is acked first, as before.
    const respondWithResults = events.some((e) =>
      HRMS_SYNC_RESPONSE_EVENT_TYPES.has(String(e?.eventType)),
    );
    if (!respondWithResults) {
      res.status(200).json({ accepted: true });
    }

    const results: unknown[] = [];
    for (const event of events) {
      try {
        results.push(await this.hrmsIntegration.handleEnvelope(event));
      } catch (err: any) {
        this.logger.error('Failed processing HRMS webhook event', err as Error);
        results.push({ ok: false, detail: err?.message || 'processing_failed' });
      }
    }
    if (respondWithResults) {
      res.status(200).json({ accepted: true, results });
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
