import {
  Inject,
  Injectable,
  Logger,
  type BeforeApplicationShutdown,
} from '@nestjs/common';
import type { NodemailerError } from 'nodemailer';
import mailConfig, { type MailConfig } from '@/config/mail.config';
import {
  MAIL_TRANSPORT,
  type MailMessage,
  type MailTransport,
} from '../types/mail.types';

/** The sender's display name; the address is MAIL_FROM. */
const SENDER_NAME = 'SimpleFood';

/** The waits before the 2nd and the 3rd attempt. */
const RETRY_DELAYS_MS = [1_000, 5_000];

/**
 * How long shutdown waits for mail in flight. Docker kills the process 10 s
 * after SIGTERM; the rest of the shutdown needs some of that time too.
 */
export const SHUTDOWN_WAIT_MS = 5_000;

/** Resolves after `ms`, or at once when `signal` aborts. */
function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener('abort', done, { once: true });
  });
}

function smtpError(error: unknown): Partial<NodemailerError> {
  return typeof error === 'object' && error !== null
    ? (error as Partial<NodemailerError>)
    : {};
}

/**
 * Only what can't identify anyone: the error code, the SMTP reply code and
 * the command. Never `message` or `response`: SMTP replies quote addresses
 * ("550 <ivan@…>: Recipient address rejected").
 */
function describe(error: unknown): string {
  const { code, responseCode, command } = smtpError(error);
  return (
    [code, responseCode, command]
      .filter((part) => part !== undefined)
      .join(' ') || 'unknown error'
  );
}

/**
 * Sends email in the background: a request never waits for SMTP, and a
 * failed email never fails a request. Call it after the transaction commits,
 * so nothing is announced that was rolled back.
 *
 * Nothing is persisted: mail still queued when the process dies is lost.
 * Orders and messages are saved before their emails go out, so that loses no
 * data; an outbox table with a worker is the upgrade if it ever matters.
 *
 * Logs never contain an address, a subject or a body.
 */
@Injectable()
export class MailService implements BeforeApplicationShutdown {
  private readonly logger = new Logger(MailService.name);
  private readonly from: { name: string; address: string };
  private readonly pending = new Set<Promise<void>>();
  /** Aborted at shutdown: wakes retries that are waiting. */
  private readonly stopping = new AbortController();

  constructor(
    @Inject(MAIL_TRANSPORT) private readonly transport: MailTransport,
    @Inject(mailConfig.KEY) config: MailConfig,
  ) {
    this.from = { name: SENDER_NAME, address: config.from };
  }

  /**
   * Sends `message` in the background, retrying twice (after 1 s and 5 s)
   * unless the server refused it for good. Returns at once, never throws.
   * `label` names the kind of email in the logs, e.g. `order-shop`.
   */
  send(label: string, message: MailMessage): void {
    this.defer(label, () => this.deliver(label, message));
  }

  /**
   * Runs `task` in the background, like send(): for work that has to happen
   * before sending, e.g. looking up the account. Returns at once; an error is
   * logged, never thrown.
   */
  defer(label: string, task: () => Promise<void>): void {
    const run: Promise<void> = Promise.resolve()
      .then(task)
      .catch((error: unknown) => {
        // Not an SMTP error (deliver() logs its own): logged like a 500.
        this.logger.error(
          `Mail task "${label}" failed`,
          error instanceof Error ? error.stack : String(error),
        );
      })
      .finally(() => this.pending.delete(run));
    this.pending.add(run);
  }

  /** Resolves when nothing is in flight, counting tasks started by tasks. */
  async idle(): Promise<void> {
    while (this.pending.size > 0) {
      await Promise.all(this.pending);
    }
  }

  /**
   * Waits up to SHUTDOWN_WAIT_MS for mail in flight; a retry that is waiting
   * makes its last attempt at once. Before, not on, application shutdown:
   * TypeORM closes the database then, and a task may still need it.
   */
  async beforeApplicationShutdown(): Promise<void> {
    this.stopping.abort();
    const timeout = new AbortController();
    const finished = await Promise.race([
      this.idle().then(() => true),
      wait(SHUTDOWN_WAIT_MS, timeout.signal).then(() => false),
    ]);
    timeout.abort(); // clears the timer when idle() won
    if (!finished) {
      this.logger.error(
        `Shutting down with ${this.pending.size} mail task(s) unfinished`,
      );
    }
  }

  private async deliver(label: string, message: MailMessage): Promise<void> {
    for (let attempt = 1; ; attempt++) {
      try {
        await this.transport.sendMail({ from: this.from, ...message });
        this.logger.debug(`Mail "${label}" sent`);
        return;
      } catch (error) {
        const delay = RETRY_DELAYS_MS[attempt - 1];
        const problem = `Mail "${label}" not sent (attempt ${attempt}): ${describe(error)}`;
        // `permanent`: a 5xx reply such as an unknown mailbox; a retry won't help.
        if (
          delay === undefined ||
          smtpError(error).permanent === true ||
          this.stopping.signal.aborted
        ) {
          this.logger.error(problem);
          return;
        }
        this.logger.warn(`${problem}; retrying in ${delay / 1000} s`);
        // Aborted by shutdown: stop waiting and try once more now.
        await wait(delay, this.stopping.signal);
      }
    }
  }
}
