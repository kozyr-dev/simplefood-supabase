import type { INestApplication } from '@nestjs/common';
import type { SendMailOptions } from 'nodemailer';
import { MailModule } from '@/mail/mail.module';
import { MailService } from '@/mail/services/mail.service';
import { MAIL_TRANSPORT, type MailMessage } from '@/mail/types/mail.types';
import { FakeMailTransport, mailbox } from './utils/mail';
import { createTestApp } from './utils/test-app';

const message: MailMessage = {
  to: 'ivan@example.com',
  subject: 'Тест',
  text: 'Привіт',
  html: '<p>Привіт</p>',
};

/*
 * MailModule as the feature modules will use it: wired into the real app,
 * with its config from the environment (test/setup/global-setup.ts) and SMTP
 * replaced by createTestApp(). The sending rules are in the unit tests.
 */
describe('Mail (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp({ imports: [MailModule] });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    (await mailbox(app)).clear();
  });

  it('never uses SMTP in tests: the transport is the fake', () => {
    expect(app.get(MAIL_TRANSPORT)).toBeInstanceOf(FakeMailTransport);
  });

  it('sends from "SimpleFood" <MAIL_FROM>', async () => {
    app.get(MailService).send('test', message);

    expect((await mailbox(app)).sent).toEqual([
      {
        from: { name: 'SimpleFood', address: 'noreply@example.com' },
        ...message,
      },
    ]);
  });

  it('keeps a failed send away from the caller; the next one goes out', async () => {
    const box = await mailbox(app);
    box.failNext();
    const mail = app.get(MailService);

    expect(() => mail.send('test', message)).not.toThrow();
    await mail.idle();
    expect(box.sent).toEqual([]);

    mail.send('test', message);
    await mail.idle();
    expect(box.sent).toHaveLength(1);
  });

  it('app.close() waits for mail in flight', async () => {
    const closing = await createTestApp({ imports: [MailModule] });
    const fake = closing.get<FakeMailTransport>(MAIL_TRANSPORT);
    // A slow SMTP server: the send finishes 300 ms after it starts.
    jest
      .spyOn(fake, 'sendMail')
      .mockImplementation(async (sent: SendMailOptions) => {
        await new Promise((resolve) => setTimeout(resolve, 300));
        fake.sent.push(sent);
        return {};
      });

    closing.get(MailService).send('test', message);
    await closing.close();

    expect(fake.sent).toHaveLength(1);
  });
});
