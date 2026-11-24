import type { SendMailOptions } from 'nodemailer';

/**
 * Provider token for the transport: nodemailer's SMTP transport in the app,
 * an in-memory fake in the e2e tests (test/utils/mail.ts).
 */
export const MAIL_TRANSPORT = Symbol('MAIL_TRANSPORT');

/** The part of a nodemailer transporter that MailService uses. */
export interface MailTransport {
  sendMail(message: SendMailOptions): Promise<unknown>;
}

/** One email: always a plain-text and an HTML version. */
export interface MailMessage {
  to: string;
  /** Where replies go, e.g. the customer on the shop's order notification. */
  replyTo?: string;
  /** Fixed text, at most with an order number: never user input. */
  subject: string;
  text: string;
  html: string;
}

/** What a template builds; the sender adds `to` (and `replyTo`). */
export type MailContent = Pick<MailMessage, 'subject' | 'text' | 'html'>;
