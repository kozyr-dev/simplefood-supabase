import {
  accountLink,
  emailChangedEmail,
  emailVerificationEmail,
  passwordChangedEmail,
  passwordResetEmail,
} from './account-emails';

const TOKEN = 'q3Jx0bY1o7k8e5H2nqQ9sT4uV6wX8yZ0aB1cD2eF3g-';

describe('account emails', () => {
  describe('accountLink', () => {
    it('puts the token in the fragment, which never reaches a server', () => {
      expect(
        accountLink('https://simplefood.kozyr.info', '/reset-password', TOKEN),
      ).toBe(`https://simplefood.kozyr.info/reset-password#token=${TOKEN}`);
    });

    it('takes only the origin of FRONTEND_URL', () => {
      expect(
        accountLink(
          'http://localhost:3000/some/path/',
          '/reset-password',
          TOKEN,
        ),
      ).toBe(`http://localhost:3000/reset-password#token=${TOKEN}`);
    });
  });

  describe('passwordResetEmail', () => {
    const link = `http://localhost:3000/reset-password#token=${TOKEN}`;
    const mail = passwordResetEmail(link);

    it('gives the link, how long it works, and what to do if unasked', () => {
      expect(mail.subject).toBe('Відновлення пароля');
      expect(mail.text).toContain(link);
      expect(mail.text).toContain('1 годину');
      expect(mail.text).toContain('лише один раз');
      expect(mail.text).toContain('ваш пароль не зміниться');
    });

    it('links it in the HTML, escaped', () => {
      expect(mail.html).toContain(`<a href="${link}">Задати новий пароль</a>`);
      expect(
        passwordResetEmail('http://localhost:3000/x#token="><script>').html,
      ).toContain(
        'href="http://localhost:3000/x#token=&quot;&gt;&lt;script&gt;"',
      );
    });
  });

  describe('emailVerificationEmail', () => {
    const link = `http://localhost:3000/verify-email#token=${TOKEN}`;
    const mail = emailVerificationEmail(link);

    it('gives the link and how long it works', () => {
      expect(mail.subject).toBe('Підтвердження email');
      expect(mail.text).toContain(link);
      expect(mail.text).toContain('48 годин');
      expect(mail.html).toContain(`<a href="${link}">Підтвердити email</a>`);
    });
  });

  describe.each([
    ['passwordChangedEmail', passwordChangedEmail(), 'Пароль змінено'],
    ['emailChangedEmail', emailChangedEmail(), 'Адресу email змінено'],
  ])('%s', (_, mail, subject) => {
    it('says what changed and what to do if it was not you', () => {
      expect(mail.subject).toBe(subject);
      expect(mail.text).toContain(
        'Якщо це були не ви, відповідайте на цей лист',
      );
      expect(mail.html).toContain('Якщо це були не ви');
    });

    it('carries no link and no address', () => {
      expect(mail.text).not.toMatch(/https?:|@/);
      expect(mail.html).not.toMatch(/https?:|@|<a /);
    });
  });
});
