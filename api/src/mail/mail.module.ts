import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import mailConfig, { type MailConfig } from '@/config/mail.config';
import { MailService } from './services/mail.service';
import { createSmtpTransport } from './services/smtp-transport';
import { MAIL_TRANSPORT } from './types/mail.types';

/**
 * Sending email. Import it in each module that sends mail; their emails
 * live in their own `templates/` folder, built with the helpers in
 * `mail/templates/`. Tests replace MAIL_TRANSPORT (see test/utils/mail.ts).
 */
@Module({
  imports: [ConfigModule.forFeature(mailConfig)],
  providers: [
    {
      provide: MAIL_TRANSPORT,
      inject: [mailConfig.KEY],
      useFactory: (config: MailConfig) => createSmtpTransport(config),
    },
    MailService,
  ],
  exports: [MailService],
})
export class MailModule {}
