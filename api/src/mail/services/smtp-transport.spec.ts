import type { MailConfig } from '@/config/mail.config';
import { createSmtpTransport } from './smtp-transport';

const config = {
  host: 'smtp.example.com',
  port: 587,
  secure: false,
  requireTLS: true,
  auth: { user: 'api', pass: 'secret' },
} as MailConfig;

/** The options nodemailer keeps on the transporter. */
const optionsOf = (transport: unknown) =>
  (transport as { options: Record<string, unknown> }).options;

describe('createSmtpTransport', () => {
  it('passes the server, TLS and login settings through', () => {
    expect(optionsOf(createSmtpTransport(config))).toMatchObject({
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      requireTLS: true,
      auth: { user: 'api', pass: 'secret' },
    });
  });

  it('times out in seconds, not minutes', () => {
    expect(optionsOf(createSmtpTransport(config))).toMatchObject({
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  });

  it('never logs the SMTP conversation (login, addresses, bodies)', () => {
    expect(optionsOf(createSmtpTransport(config))).toMatchObject({
      logger: false,
      debug: false,
    });
  });
});
