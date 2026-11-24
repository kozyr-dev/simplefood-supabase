import { Inject, Injectable } from '@nestjs/common';
import mailConfig, { type MailConfig } from '@/config/mail.config';
import { MailService } from '@/mail/services/mail.service';
import {
  accountLink,
  emailChangedEmail,
  emailVerificationEmail,
  passwordChangedEmail,
  passwordResetEmail,
} from '../templates/account-emails';

/**
 * The emails about an account: links and notices. Each method only queues
 * the email (MailService.send): call it after the transaction that issued
 * the token or made the change commits. Tokens come from
 * AccountTokensService, issued by the caller in that transaction.
 */
@Injectable()
export class AccountEmailsService {
  constructor(
    private readonly mail: MailService,
    @Inject(mailConfig.KEY) private readonly settings: MailConfig,
  ) {}

  /** A password-reset link (1 hour). */
  passwordReset(to: string, token: string): void {
    this.mail.send('password-reset', {
      to,
      ...passwordResetEmail(this.link('/reset-password', token)),
    });
  }

  /** A link that verifies the address it's sent to (48 hours). */
  emailVerification(to: string, token: string): void {
    this.mail.send('email-verification', {
      to,
      ...emailVerificationEmail(this.link('/verify-email', token)),
    });
  }

  /** "Your password was changed". Replies reach the shop. */
  passwordChanged(to: string): void {
    this.mail.send('password-changed', {
      to,
      replyTo: this.settings.notifyTo,
      ...passwordChangedEmail(),
    });
  }

  /** "Your email was changed", to the old address. Replies reach the shop. */
  emailChanged(oldAddress: string): void {
    this.mail.send('email-changed', {
      to: oldAddress,
      replyTo: this.settings.notifyTo,
      ...emailChangedEmail(),
    });
  }

  private link(path: string, token: string): string {
    return accountLink(this.settings.frontendUrl, path, token);
  }
}
