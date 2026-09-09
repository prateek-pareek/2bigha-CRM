import { Module, Global } from '@nestjs/common';
import { MailerModule } from '@nestjs-modules/mailer';
import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';

@Global()
@Module({
  imports: [
    MailerModule.forRootAsync({
      useFactory: (config: ConfigService) => {
        const host =
          config.get('SMTP_HOST') || config.get('MAIL_HOST') || undefined;
        const port = config.get('SMTP_PORT') || config.get('MAIL_PORT') || 587;
        const isSecure = port === 465 || port === '465';
        const user = config.get('SMTP_USER') || config.get('MAIL_USER');
        const pass =
          config.get('SMTP_PASS') ||
          config.get('MAIL_PASSWORD') ||
          config.get('MAIL_PASS');

        return {
          transport: {
            host,
            port,
            secure: isSecure,
            auth: user && pass ? { user, pass } : undefined,
            tls: {
              rejectUnauthorized: false,
            },
          },
          defaults: {
            from:
              config.get('MAIL_FROM') ||
              '"2Bigha CRM" <no-reply@2bigha.ai>',
          },
        };
      },
      inject: [ConfigService],
    }),
  ],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
