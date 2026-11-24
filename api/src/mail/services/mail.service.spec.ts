import { Logger } from '@nestjs/common';
import type { MailConfig } from '@/config/mail.config';
import type { MailMessage, MailTransport } from '../types/mail.types';
import { MailService, SHUTDOWN_WAIT_MS } from './mail.service';

const message: MailMessage = {
  to: 'ivan@example.com',
  replyTo: 'olena@example.com',
  subject: 'Замовлення №42 прийнято',
  text: 'Борщ × 2',
  html: '<p>Борщ × 2</p>',
};

/** What an SMTP error looks like: the reply quotes the address. */
function smtpFailure(permanent: boolean): Error {
  return Object.assign(new Error("Can't send mail to <ivan@example.com>"), {
    code: permanent ? 'EENVELOPE' : 'ECONNECTION',
    responseCode: permanent ? 550 : undefined,
    command: permanent ? 'RCPT TO' : undefined,
    response: '550 5.1.1 <ivan@example.com>: Recipient address rejected',
    permanent: permanent || undefined,
  });
}

/** A promise the test resolves itself. */
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => (resolve = done));
  return { promise, resolve };
}

describe('MailService', () => {
  let sendMail: jest.Mock<
    Promise<unknown>,
    Parameters<MailTransport['sendMail']>
  >;
  let mail: MailService;
  let warn: jest.SpyInstance;
  let error: jest.SpyInstance;

  beforeEach(() => {
    sendMail = jest.fn().mockResolvedValue({});
    mail = new MailService({ sendMail }, {
      from: 'noreply@example.com',
    } as MailConfig);
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'debug').mockImplementation();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  /** Every logged line, to search for personal data. */
  const logged = () =>
    JSON.stringify([...warn.mock.calls, ...error.mock.calls]);

  it('sends in the background, from "SimpleFood" <MAIL_FROM>', async () => {
    expect(mail.send('order-customer', message)).toBeUndefined();
    expect(sendMail).not.toHaveBeenCalled(); // the caller never waits

    await mail.idle();

    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail).toHaveBeenCalledWith({
      from: { name: 'SimpleFood', address: 'noreply@example.com' },
      ...message,
    });
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it('retries a temporary failure after 1 s', async () => {
    jest.useFakeTimers();
    sendMail.mockRejectedValueOnce(smtpFailure(false));

    mail.send('order-shop', message);
    await jest.advanceTimersByTimeAsync(999);
    expect(sendMail).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    await mail.idle();

    expect(sendMail).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith(
      'Mail "order-shop" not sent (attempt 1): ECONNECTION; retrying in 1 s',
    );
    expect(error).not.toHaveBeenCalled();
  });

  it('gives up after 3 attempts (waits of 1 s and 5 s) without throwing', async () => {
    jest.useFakeTimers();
    sendMail.mockRejectedValue(smtpFailure(false));

    mail.send('order-shop', message);
    await jest.advanceTimersByTimeAsync(1_000 + 5_000);
    await mail.idle();

    expect(sendMail).toHaveBeenCalledTimes(3);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith(
      'Mail "order-shop" not sent (attempt 3): ECONNECTION',
    );
  });

  it("doesn't retry a permanent rejection (5xx)", async () => {
    sendMail.mockRejectedValue(smtpFailure(true));

    mail.send('order-customer', message);
    await mail.idle();

    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith(
      'Mail "order-customer" not sent (attempt 1): EENVELOPE 550 RCPT TO',
    );
  });

  it('never logs an address, the subject or the body', async () => {
    jest.useFakeTimers();
    sendMail
      .mockRejectedValueOnce(smtpFailure(false))
      .mockRejectedValueOnce(smtpFailure(true));

    mail.send('order-customer', message);
    await jest.advanceTimersByTimeAsync(1_000);
    await mail.idle();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledTimes(1);
    for (const value of [
      'ivan@example.com',
      'olena@example.com',
      'noreply@example.com',
      message.subject,
      'Борщ',
    ]) {
      expect(logged()).not.toContain(value);
    }
  });

  it('logs an error without a code as "unknown error"', async () => {
    sendMail.mockRejectedValue('connection lost');
    jest.useFakeTimers();

    mail.send('contact-shop', message);
    await jest.advanceTimersByTimeAsync(6_000);
    await mail.idle();

    expect(error).toHaveBeenCalledWith(
      'Mail "contact-shop" not sent (attempt 3): unknown error',
    );
  });

  describe('defer()', () => {
    it('logs a failed task and keeps working', async () => {
      mail.defer('password-reset', () =>
        Promise.reject(new Error('database is down')),
      );
      await mail.idle();

      expect(error).toHaveBeenCalledWith(
        'Mail task "password-reset" failed',
        expect.stringContaining('Error: database is down'),
      );

      mail.send('order-shop', message);
      await mail.idle();
      expect(sendMail).toHaveBeenCalledTimes(1);
    });

    it('runs the task after the caller returns', async () => {
      const task = jest.fn(() => Promise.resolve());

      mail.defer('verify-email', task);
      expect(task).not.toHaveBeenCalled();

      await mail.idle();
      expect(task).toHaveBeenCalledTimes(1);
    });

    it('idle() also waits for mail a task sends', async () => {
      const lookup = deferred();

      mail.defer('password-reset', async () => {
        await lookup.promise; // e.g. finding the account
        mail.send('password-reset', message);
      });
      const idle = mail.idle();
      lookup.resolve();
      await idle;

      expect(sendMail).toHaveBeenCalledTimes(1);
    });
  });

  describe('shutdown', () => {
    it('waits for mail in flight', async () => {
      const smtp = deferred();
      sendMail.mockReturnValue(smtp.promise);
      mail.send('order-shop', message);
      await Promise.resolve(); // let the send start

      let done = false;
      const shutdown = mail
        .beforeApplicationShutdown()
        .then(() => (done = true));
      await new Promise((resolve) => setImmediate(resolve));
      expect(done).toBe(false);

      smtp.resolve();
      await shutdown;
      expect(error).not.toHaveBeenCalled();
    });

    it('cuts a retry wait short: one last attempt at once', async () => {
      jest.useFakeTimers();
      sendMail.mockRejectedValueOnce(smtpFailure(false));
      mail.send('order-shop', message);
      await jest.advanceTimersByTimeAsync(0); // 1st attempt failed, waiting

      await mail.beforeApplicationShutdown(); // no timers advanced

      expect(sendMail).toHaveBeenCalledTimes(2);
      expect(error).not.toHaveBeenCalled();
    });

    it('makes that last attempt final: no more waiting', async () => {
      jest.useFakeTimers();
      sendMail.mockRejectedValue(smtpFailure(false));
      mail.send('order-shop', message);
      await jest.advanceTimersByTimeAsync(0);

      await mail.beforeApplicationShutdown();

      expect(sendMail).toHaveBeenCalledTimes(2);
      expect(error).toHaveBeenCalledWith(
        'Mail "order-shop" not sent (attempt 2): ECONNECTION',
      );
    });

    it(`gives up after ${SHUTDOWN_WAIT_MS} ms and says how much was left`, async () => {
      jest.useFakeTimers();
      sendMail.mockReturnValue(new Promise(() => {})); // a hung server
      mail.send('order-shop', message);
      mail.send('order-customer', message);

      const shutdown = mail.beforeApplicationShutdown();
      await jest.advanceTimersByTimeAsync(SHUTDOWN_WAIT_MS);
      await shutdown;

      expect(error).toHaveBeenCalledWith(
        'Shutting down with 2 mail task(s) unfinished',
      );
    });

    it('returns at once when nothing is in flight', async () => {
      jest.useFakeTimers();

      await mail.beforeApplicationShutdown();

      expect(jest.getTimerCount()).toBe(0); // the 5 s timer was cleared
    });
  });
});
