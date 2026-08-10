import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import * as handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor(private configService: ConfigService) {
    const port = this.configService.get<number>('SMTP_PORT', 587);
    // secure: true is for port 465, secure: false is for 587 and 25 (STARTTLS)
    const isSecure = port === 465;

    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('SMTP_HOST', 'localhost'),
      port: port,
      secure: isSecure,
      auth: {
        user: this.configService.get<string>('SMTP_USER'),
        pass: this.configService.get<string>('SMTP_PASS'),
      },
      tls: {
        // Do not fail on invalid certs
        rejectUnauthorized: false,
      },
    });
  }

  async sendMail(
    to: string,
    subject: string,
    templateName: string,
    context: any,
  ): Promise<boolean> {
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
        // Fallback to simple string if template not found (mostly for dev/testing)
        html = `
                    <h1>${subject}</h1>
                    <p>${JSON.stringify(context, null, 2)}</p>
                `;
      }

      const info = await this.transporter.sendMail({
        from: this.configService.get<string>(
          'MAIL_FROM',
          '"HRMS Support" <support@hrms.com>',
        ),
        to,
        subject,
        html,
      });

      console.log('[EmailService] Message sent: %s', info.messageId);
      return true;
    } catch (error) {
      console.error('[EmailService] Error sending email:', error);
      return false;
    }
  }
}
