import { Injectable } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';

@Injectable()
export class MailService {
  constructor(private readonly mailerService: MailerService) {}

  async sendMail(options: { to: string; subject: string; html: string }) {
    try {
      await this.mailerService.sendMail({
        to: options.to,
        subject: options.subject,
        html: options.html,
      });
      console.log(`Transmission successful via SMTP to: ${options.to}`);
    } catch (error) {
      console.error('Transmission failure:', error);
    }
  }

  async sendWelcomeEmail(userEmail: string, fullName: string) {
    try {
      await this.mailerService.sendMail({
        to: userEmail,
        subject: 'Welcome to 2Bigha CRM',
        html: `
          <div style="font-family: Inter, sans-serif; padding: 32px;">
            <h1>Welcome, ${fullName}</h1>
            <p>Your 2Bigha CRM account is ready.</p>
          </div>
        `,
      });
      console.log(`Welcome email sent to: ${userEmail}`);
    } catch (error) {
      console.error('Welcome email failure:', error);
    }
  }
}
