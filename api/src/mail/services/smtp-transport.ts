import { createTransport } from 'nodemailer';
import type { MailConfig } from '@/config/mail.config';
import type { MailTransport } from '../types/mail.types';

/**
 * nodemailer's SMTP transport: one connection per message (no pool; mail is
 * rare here), nothing to close on shutdown.
 */
export function createSmtpTransport(config: MailConfig): MailTransport {
  return createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    requireTLS: config.requireTLS,
    auth: config.auth,
    // The defaults are minutes long (socket: 10 min); a hung server would
    // hold a send, and the shutdown, that long.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    // Its debug output is the whole SMTP conversation: the login, every
    // address and the message bodies. MailService logs failures instead.
    logger: false,
    debug: false,
  });
}
