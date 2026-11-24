import type { INestApplication } from '@nestjs/common';
import type { SendMailOptions } from 'nodemailer';
import { MailService } from '@/mail/services/mail.service';
import { MAIL_TRANSPORT, type MailTransport } from '@/mail/types/mail.types';

/**
 * Stands in for SMTP in every app createTestApp() builds: keeps what would
 * have been sent, so tests can read it, and never opens a connection.
 */
export class FakeMailTransport implements MailTransport {
  readonly sent: SendMailOptions[] = [];
  private failures = 0;

  /**
   * The next `count` sends fail like a rejected recipient (a permanent 550),
   * so MailService gives up at once instead of retrying for 6 s.
   */
  failNext(count = 1): void {
    this.failures += count;
  }

  /** Forgets what was sent; call it in `beforeEach` when the app is shared. */
  clear(): void {
    this.sent.length = 0;
    this.failures = 0;
  }

  sendMail(message: SendMailOptions): Promise<unknown> {
    if (this.failures > 0) {
      this.failures--;
      return Promise.reject(
        Object.assign(new Error('Fake SMTP: recipient rejected'), {
          code: 'EENVELOPE',
          responseCode: 550,
          command: 'RCPT TO',
          permanent: true,
        }),
      );
    }
    this.sent.push(message);
    return Promise.resolve({});
  }
}

/**
 * The fake transport, once all mail in flight is done: emails go out after
 * the response, so a test reads them through this, e.g.
 * `expect((await mailbox(app)).sent).toHaveLength(1)`.
 *
 * Also await it before `resetDatabase()` in suites whose background mail
 * jobs touch the database (forgot-password): a job still writing while the
 * tables are truncated can deadlock with the TRUNCATE.
 */
export async function mailbox(
  app: INestApplication,
): Promise<FakeMailTransport> {
  await app.get(MailService).idle();
  return app.get<FakeMailTransport>(MAIL_TRANSPORT);
}

/**
 * The token of the account link in an email's text (`…#token=…`), e.g.
 * `linkToken((await mailbox(app)).sent.at(-1))`. Throws if there's none.
 */
export function linkToken(message: SendMailOptions | undefined): string {
  const text = typeof message?.text === 'string' ? message.text : '';
  const token = /#token=([\w-]+)/.exec(text)?.[1];
  if (!token) {
    throw new Error('no link with a token in this email');
  }
  return token;
}
