import { escapeHtml, layout } from '@/mail/templates/format';
import type { MailContent } from '@/mail/types/mail.types';
import type { ContactSubmission } from '../entities/contact-submission.entity';

/**
 * To the shop's inbox; the caller sets `Reply-To` to the sender, so the shop
 * just answers. Only ever sent to the shop: nothing the sender typed reaches
 * anyone else. The subject is fixed text; the HTML escapes every value.
 */
export function contactNotification(
  submission: ContactSubmission,
): MailContent {
  const subject = 'Повідомлення з сайту';
  const details: [string, string][] = [
    ['Ім’я', submission.name],
    ['Email', submission.email],
  ];

  return {
    subject,
    text: [
      subject,
      '',
      ...details.map(([label, value]) => `${label}: ${value}`),
      '',
      submission.message,
    ].join('\n'),
    html: layout(
      subject,
      `<h2>${escapeHtml(subject)}</h2>\n` +
        `<table cellpadding="4">\n${details
          .map(
            ([label, value]) =>
              `<tr><th align="left">${escapeHtml(label)}</th>` +
              `<td>${escapeHtml(value)}</td></tr>`,
          )
          .join('\n')}\n</table>\n` +
        `<p style="white-space:pre-line">${escapeHtml(submission.message)}</p>`,
    ),
  };
}
