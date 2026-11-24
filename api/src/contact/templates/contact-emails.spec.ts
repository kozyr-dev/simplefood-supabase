import type { ContactSubmission } from '../entities/contact-submission.entity';
import { contactNotification } from './contact-emails';

const submission = {
  id: 'contact-1',
  name: 'Олена <i>Коваль</i>',
  email: 'olena@example.com',
  message:
    'Чи доставляєте в Ірпінь?\n<a href="https://spam.example">так</a> & ні',
  handledAt: null,
  createdAt: new Date('2026-11-06T10:00:00Z'),
  updatedAt: new Date('2026-11-06T10:00:00Z'),
} satisfies ContactSubmission;

describe('contactNotification', () => {
  const mail = contactNotification(submission);

  it('has a fixed subject: never anything the sender typed', () => {
    expect(mail.subject).toBe('Повідомлення з сайту');
  });

  it('gives the sender and the message as typed in the text version', () => {
    expect(mail.text).toBe(
      [
        'Повідомлення з сайту',
        '',
        'Ім’я: Олена <i>Коваль</i>',
        'Email: olena@example.com',
        '',
        'Чи доставляєте в Ірпінь?\n<a href="https://spam.example">так</a> & ні',
      ].join('\n'),
    );
  });

  it('escapes everything the sender typed in the HTML, keeping line breaks', () => {
    expect(mail.html).toContain('Олена &lt;i&gt;Коваль&lt;/i&gt;');
    expect(mail.html).toContain(
      '&lt;a href=&quot;https://spam.example&quot;&gt;так&lt;/a&gt; &amp; ні',
    );
    expect(mail.html).not.toContain('<a href');
    expect(mail.html).not.toContain('<i>');
    expect(mail.html).toContain('white-space:pre-line');
  });
});
