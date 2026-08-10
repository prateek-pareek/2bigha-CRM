import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { Public } from '../../auth/public.decorator';
import { ConfigService } from '@nestjs/config';
import { verifyUnsubscribeToken } from '../shared/crm-email-unsubscribe.util';
import { InboxAccountsService } from '../inbox/inbox-accounts.service';

@Controller('crm/unsubscribe')
export class EmailUnsubscribeController {
  constructor(
    private readonly inboxAccounts: InboxAccountsService,
    private readonly config: ConfigService,
  ) {}

  private secret(): string {
    return this.config.get<string>('JWT_SECRET') || 'supersecret';
  }

  @Get()
  @Public()
  async unsubscribePage(
    @Query('token') token: string,
    @Res() res: Response,
  ) {
    const payload = verifyUnsubscribeToken(token || '', this.secret());
    if (!payload) {
      res.status(400).type('html').send(this.htmlShell('Invalid or expired link', false));
      return;
    }
    const count = await this.inboxAccounts.suppressRecipientEmail(
      payload.e,
      'One-click unsubscribe (recipient request)',
    );
    const ok = count >= 0;
    res
      .status(200)
      .type('html')
      .send(
        this.htmlShell(
          ok
            ? `${payload.e} has been unsubscribed. You will not receive further sales emails at this address.`
            : 'Could not process unsubscribe.',
          ok,
        ),
      );
  }

  /** RFC 8058 List-Unsubscribe=One-Click (POST from mailbox providers). */
  @Post()
  @Public()
  async unsubscribeOneClick(
    @Query('token') token: string,
    @Body() body: Record<string, string>,
    @Res() res: Response,
  ) {
    const payload = verifyUnsubscribeToken(token || '', this.secret());
    if (!payload) {
      res.status(400).send('Invalid token');
      return;
    }
    const isOneClick =
      body?.['List-Unsubscribe'] === 'One-Click' ||
      body?.listUnsubscribe === 'One-Click';
    if (!isOneClick) {
      res.status(400).send('Expected List-Unsubscribe=One-Click');
      return;
    }
    await this.inboxAccounts.suppressRecipientEmail(
      payload.e,
      'One-click unsubscribe (List-Unsubscribe-Post)',
    );
    res.status(200).send('OK');
  }

  private htmlShell(message: string, success: boolean): string {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Unsubscribe</title>
<style>body{font-family:system-ui,sans-serif;max-width:480px;margin:48px auto;padding:24px;color:#33475b}
h1{font-size:20px;color:${success ? '#0f766e' : '#b91c1c'}}</style></head>
<body><h1>${success ? 'Unsubscribed' : 'Error'}</h1><p>${message}</p></body></html>`;
  }
}
