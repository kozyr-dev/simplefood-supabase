import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { ContactSubmission } from '@/contact/entities/contact-submission.entity';
import { resetDatabase } from './utils/database';
import { mailbox } from './utils/mail';
import { createTestApp } from './utils/test-app';
import { resetRateLimits } from './utils/throttler';

describe('Contact (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(dataSource);
    resetRateLimits(app);
    (await mailbox(app)).clear();
  });

  const message = (overrides: Record<string, unknown> = {}) => ({
    name: 'Олена',
    email: 'olena@example.com',
    message: 'Чи доставляєте в Ірпінь?',
    ...overrides,
  });

  const send = (body: object) =>
    request(app.getHttpServer()).post('/api/contact').send(body);

  const saved = () => dataSource.getRepository(ContactSubmission).find();

  describe('POST /contact', () => {
    it('saves the message (trimmed) and answers 204 with no body', async () => {
      const res = await send(
        message({ name: '  Олена ', message: '\n Чи доставляєте?  ' }),
      ).expect(204);

      expect(res.text).toBe('');
      expect(await saved()).toEqual([
        expect.objectContaining({
          name: 'Олена',
          email: 'olena@example.com',
          message: 'Чи доставляєте?',
          handledAt: null,
        }),
      ]);
    });

    it('emails the shop, with Reply-To: the sender', async () => {
      await send(message()).expect(204);

      const { sent } = await mailbox(app);
      expect(sent).toHaveLength(1);
      expect(sent[0]).toMatchObject({
        to: 'shop@example.com',
        replyTo: 'olena@example.com',
        subject: 'Повідомлення з сайту',
      });
      expect(sent[0].text).toContain('Чи доставляєте в Ірпінь?');
    });

    it('needs no login, and ignores a bad token', async () => {
      await send(message())
        .set('Authorization', 'Bearer not-a-jwt')
        .expect(204);
    });

    it('drops a message whose honeypot is filled in, with the same 204', async () => {
      const res = await send(
        message({ website: 'https://spam.example' }),
      ).expect(204);

      expect(res.text).toBe('');
      expect(await saved()).toEqual([]);
      expect((await mailbox(app)).sent).toEqual([]);
    });

    it('takes an empty (or blank) honeypot as a person', async () => {
      await send(message({ website: '' })).expect(204);
      await send(message({ website: '   ' })).expect(204);

      expect(await saved()).toHaveLength(2);
    });

    it('accepts a message of exactly 5000 characters', async () => {
      await send(message({ message: 'я'.repeat(5000) })).expect(204);
    });

    it.each([
      ['no name', { name: undefined }],
      ['a blank name', { name: '   ' }],
      ['a name over 100 characters', { name: 'x'.repeat(101) }],
      ['no email', { email: undefined }],
      ['a bad email', { email: 'olena.example.com' }],
      ['no message', { message: undefined }],
      ['a blank message', { message: ' \n ' }],
      ['a message over 5000 characters', { message: 'я'.repeat(5001) }],
      ['a honeypot that is not text', { website: 1 }],
      ['an unknown field', { phone: '+380 67 123 45 67' }],
    ])(
      'refuses %s with 400, saving and sending nothing',
      async (_, overrides) => {
        await send(message(overrides)).expect(400);

        expect(await saved()).toEqual([]);
        expect((await mailbox(app)).sent).toEqual([]);
      },
    );

    it('still keeps the message when the email fails', async () => {
      (await mailbox(app)).failNext();

      await send(message()).expect(204);

      expect(await saved()).toHaveLength(1);
    });
  });

  describe('database constraints', () => {
    const insert = (overrides: Partial<ContactSubmission>) =>
      dataSource
        .getRepository(ContactSubmission)
        .save({ ...message(), handledAt: null, ...overrides });

    it.each([
      [{ message: '' }, 'CHK_contact_submission_message_length'],
      [{ message: 'x'.repeat(5001) }, 'CHK_contact_submission_message_length'],
      [{ email: 'olena.example.com' }, 'CHK_contact_submission_email'],
    ])('rejects %o (%s)', async (overrides, constraint) => {
      await expect(insert(overrides)).rejects.toThrow(constraint);
    });
  });
});
