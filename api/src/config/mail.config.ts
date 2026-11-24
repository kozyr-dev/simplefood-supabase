import { registerAs, type ConfigType } from '@nestjs/config';

/**
 * Mail config under the `mail` namespace. Inject it with
 * `@Inject(mailConfig.KEY) config: MailConfig`.
 *
 * Reading `process.env` here is safe: ConfigModule validates it with the Joi
 * schema (config/env.validation.ts) and fills in defaults before any
 * `registerAs` factory runs. A variable that was already set keeps its raw
 * text, so booleans are compared without regard to case (`TRUE` is valid).
 */
const mailConfig = registerAs('mail', () => {
  const secure = process.env.SMTP_SECURE?.toLowerCase() === 'true';
  const user = process.env.SMTP_USER;

  return {
    host: process.env.SMTP_HOST as string,
    port: Number(process.env.SMTP_PORT),
    /** TLS from the first byte; otherwise STARTTLS when the server offers it. */
    secure,
    /**
     * Production refuses to send unencrypted: without this, a server (or
     * anyone in between) that hides STARTTLS gets the login and the mail in
     * plain text. Mailpit offers no TLS, so it's off locally.
     */
    requireTLS: process.env.NODE_ENV === 'production' && !secure,
    // The schema allows both or neither.
    auth: user
      ? { user, pass: process.env.SMTP_PASSWORD as string }
      : undefined,

    /** Sender address; MailService adds the name. */
    from: process.env.MAIL_FROM as string,
    /** The shop's inbox for order and contact notifications. */
    notifyTo: process.env.MAIL_NOTIFY_TO as string,
    /** The site's address, for links in emails. */
    frontendUrl: process.env.FRONTEND_URL as string,
  };
});

export type MailConfig = ConfigType<typeof mailConfig>;

export default mailConfig;
