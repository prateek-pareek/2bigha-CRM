import { Body, Controller, Get, Post, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { Public } from '../../auth/public.decorator';
import { InboxPushService } from './inbox-push.service';

@Controller('crm/inbox-push')
export class InboxPushController {
  constructor(private readonly inboxPushService: InboxPushService) {}

  @Get('microsoft/webhook')
  @Public()
  verifyMicrosoftWebhook(
    @Query('validationToken') validationToken: string,
    @Res() res: Response,
  ) {
    return res
      .status(200)
      .set('Content-Type', 'text/plain')
      .send(this.inboxPushService.handleMicrosoftValidation(validationToken));
  }

  @Post('microsoft/webhook')
  @Public()
  async receiveMicrosoftWebhook(@Body() body: any, @Res() res: Response) {
    res.status(202).send('Accepted');
    await this.inboxPushService.handleMicrosoftNotification(body);
  }

  @Post('google/webhook')
  @Public()
  async receiveGoogleWebhook(@Body() body: any, @Res() res: Response) {
    res.status(202).send('Accepted');
    await this.inboxPushService.handleGmailNotification(body);
  }
}
