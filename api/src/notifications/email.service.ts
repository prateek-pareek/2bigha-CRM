import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import * as handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private configured = false;

  constructor(private configService: ConfigService) {
    const host = this.pick('SMTP_HOST', 'MAIL_HOST');
    const port = Number(this.pick('SMTP_PORT', 'MAIL_PORT') || 587);
    const user = this.pick('SMTP_USER', 'MAIL_USER');
    const pass = this.pick('SMTP_PASS', 'MAIL_PASSWORD', 'MAIL_PASS');

    if (!host) {
      this.logger.warn(
        'SMTP not configured (set MAIL_HOST / SMTP_HOST). Email notifications are disabled.',
      );
      return;
    }

    const isSecure = port === 465;
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: isSecure,
      auth: user && pass ? { user, pass } : undefined,
      tls: {
        rejectUnauthorized: false,
      },
    });
    this.configured = true;
  }

  private pick(...keys: string[]): string {
    for (const key of keys) {
      const v = this.configService.get<string>(key);
      if (v != null && String(v).trim()) return String(v).trim();
    }
    return '';
  }

  isConfigured(): boolean {
    return this.configured;
  }

  async sendMail(
    to: string,
    subject: string,
    templateName: string,
    context: any,
  ): Promise<boolean> {
    if (!this.transporter || !this.configured) {
      return false;
    }
    try {
      const templatePath = path.join(
        __dirname,
        'templates',
        `${templateName}.hbs`,
      );
      let html: string;

      if (fs.existsSync(templatePath)) {
        const source = fs.readFileSync(templatePath, 'utf8');
        const template = handlebars.compile(source);
        html = template(context);
      } else {
        html = `
                    <h1>${subject}</h1>
                    <p>${JSON.stringify(context, null, 2)}</p>
                `;
      }

      const info = await this.transporter.sendMail({
        from: this.pick('MAIL_FROM') || '"2Bigha CRM" <no-reply@2bigha.ai>',
        to,
        subject,
        html,
      });

      this.logger.log(`Message sent: ${info.messageId}`);
      return true;
    } catch (error) {
      this.logger.error('Error sending email', error as Error);
      return false;
    }
  }
}
