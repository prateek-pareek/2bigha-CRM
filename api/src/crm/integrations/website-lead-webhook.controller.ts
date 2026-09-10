import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Options,
  Post,
  Res,
} from '@nestjs/common';
import * as express from 'express';
import { CRMService } from '../core/crm.service';

/**
 * Fields understood by name/shape. Anything else in the body falls through to
 * `Lead.customFields` unchanged — same approach as MetaLeadAdsService's
 * `mapFieldData`, so a form can add extra questions without a code change.
 */
interface WebsiteLeadPayload {
  firstName?: string;
  lastName?: string;
  /** Convenience alias — split on whitespace into firstName/lastName when those aren't given directly. */
  name?: string;
  email?: string;
  phone?: string;
  mobileNo?: string;
  organization?: string;
  /** Alias for organization. */
  company?: string;
  /** Alias for notes — the form's free-text field is usually called "message". */
  message?: string;
  notes?: string;
  /** URL of the page the form was submitted from, for `sourceMetadata`. */
  page?: string;
  /** Which form on the site this came from (e.g. "Contact us", "Book a demo"). */
  formName?: string;
  [key: string]: unknown;
}

const KNOWN_KEYS = new Set([
  'firstName',
  'lastName',
  'name',
  'email',
  'phone',
  'mobileNo',
  'organization',
  'company',
  'message',
  'notes',
  'page',
  'formName',
]);

/**
 * Public lead-capture endpoint a customer's own website posts to (a contact
 * form, "Book a demo" form, etc.) — creates a CRM Lead with `source:
 * 'Website'` via the same `CRMService.createLead` path every other lead
 * source uses (see MetaLeadAdsService for the analogous pattern).
 *
 * Auth is a shared secret (`CRM_WEBSITE_PUBLIC_API_KEY`) rather than Meta-style
 * signature verification, since there's no platform on the other end to sign
 * requests — just whatever the website's form-handler sends. CORS is opened
 * up explicitly on this route only: the app-wide policy in main.ts is
 * restricted to the portal's own origin, which would otherwise block a
 * browser-side POST straight from the customer's website.
 */
@Controller('webhooks/website-lead')
export class WebsiteLeadWebhookController {
  private readonly logger = new Logger(WebsiteLeadWebhookController.name);
  private warnedMissingApiKey = false;

  constructor(private readonly crmService: CRMService) {}

  private setCorsHeaders(res: express.Response): void {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
  }

  @Options()
  preflight(@Res() res: express.Response): void {
    this.setCorsHeaders(res);
    res.status(HttpStatus.NO_CONTENT).send();
  }

  /**
   * Same "warn once, don't block" convenience as MetaLeadAdsWebhookController's
   * missing-app-secret case — an admin who hasn't set the key yet gets a
   * loud log line instead of a silently-broken integration during setup.
   */
  private isAuthorized(apiKey?: string): boolean {
    // Reuses the env var already reserved for this in .env.example ("Website
    // inbound (public lead/chat widgets)") but never wired to anything until now.
    const expected = process.env.CRM_WEBSITE_PUBLIC_API_KEY;
    if (!expected) {
      if (!this.warnedMissingApiKey) {
        this.warnedMissingApiKey = true;
        this.logger.warn(
          'CRM_WEBSITE_PUBLIC_API_KEY is not set — the website lead webhook is accepting requests ' +
            'unauthenticated. Set it in the API environment to close this off.',
        );
      }
      return true;
    }
    return !!apiKey && apiKey === expected;
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async handle(
    @Body() body: WebsiteLeadPayload,
    @Headers('x-api-key') apiKey: string | undefined,
    @Res({ passthrough: true }) res: express.Response,
  ): Promise<{ success: boolean; leadId?: string; error?: string }> {
    this.setCorsHeaders(res);

    if (!this.isAuthorized(apiKey)) {
      res.status(HttpStatus.UNAUTHORIZED);
      return { success: false, error: 'Invalid or missing API key' };
    }

    const fullName = String(body?.name || '').trim();
    let firstName = String(body?.firstName || '').trim();
    let lastName = String(body?.lastName || '').trim();
    if (!firstName && fullName) {
      const parts = fullName.split(/\s+/);
      firstName = parts.shift() || '';
      lastName = lastName || parts.join(' ');
    }
    firstName = firstName || 'Website Lead';

    const email = String(body?.email || '').trim() || undefined;
    const phone = String(body?.phone || body?.mobileNo || '').trim() || undefined;
    if (!email && !phone) {
      res.status(HttpStatus.BAD_REQUEST);
      return { success: false, error: 'email or phone is required' };
    }

    const customFields: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body || {})) {
      if (!KNOWN_KEYS.has(key) && value !== undefined && value !== null && value !== '') {
        customFields[key] = value;
      }
    }

    const dto: Record<string, any> = {
      firstName,
      lastName: lastName || undefined,
      email,
      phone,
      mobileNo: phone,
      organization: String(body?.organization || body?.company || '').trim() || undefined,
      notes: String(body?.message || body?.notes || '').trim() || undefined,
      source: 'Website',
      status: 'New',
      stage: 'New',
      sourceMetadata: {
        type: 'website',
        url: body?.page ? String(body.page) : undefined,
        title: body?.formName ? String(body.formName) : 'Website form',
      },
      customFields,
    };

    try {
      const lead = await this.crmService.createLead(dto);
      this.logger.log(`Created CRM lead ${lead._id} from website form submission`);
      return { success: true, leadId: String(lead._id) };
    } catch (e: any) {
      this.logger.error(`Failed to create CRM lead from website form: ${e?.message}`);
      res.status(HttpStatus.INTERNAL_SERVER_ERROR);
      return { success: false, error: 'Failed to create lead' };
    }
  }
}
