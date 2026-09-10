import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import * as express from 'express';
import { FormSubmissionsService } from './form-submissions.service';
import { SubmitFormDto } from './dto/submit-form.dto';

/**
 * Anonymous intake side of the Form Builder — no auth, reachable by any
 * website visitor (the hosted `/forms/:id` portal page, an embedded
 * iframe, or a Meta/Google Ads landing-page redirect). Mirrors the
 * no-guard-here-does-its-own-thing shape of the webhook controllers
 * (see MetaLeadAdsWebhookController) even though this isn't a webhook —
 * both need to accept traffic that never carries a CRM JWT.
 */
@Controller('forms/public')
export class FormsPublicController {
  constructor(private readonly submissionsService: FormSubmissionsService) {}

  @Get(':id')
  getForm(@Param('id') id: string) {
    return this.submissionsService.getPublicForm(id);
  }

  @Post(':id/submit')
  submit(@Param('id') id: string, @Body() dto: SubmitFormDto, @Req() req: express.Request) {
    return this.submissionsService.submit(id, dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      referrer: (req.headers['referer'] as string) || (req.headers['referrer'] as string),
    });
  }
}
