import { escapeHtml, layout } from '@/mail/templates/format';
import type { MailContent } from '@/mail/types/mail.types';

/**
 * A link to a page of the site that carries `token` in the fragment
 * (`#token=…`): browsers never send the fragment to a server, so the token
 * stays out of access logs and `Referer` headers. The page reads it and
 * POSTs it to the API. Only the origin of `frontendUrl` counts: a path in
 * it is replaced by `path`.
 */
export function accountLink(
  frontendUrl: string,
  path: string,
  token: string,
): string {
  const url = new URL(path, frontendUrl);
  url.hash = `token=${token}`;
  return url.toString();
}

/** What a notice says to someone who didn't make the change. */
const NOT_YOU =
  'Якщо це були не ви, відповідайте на цей лист: ми допоможемо ' +
  'повернути доступ до акаунта.';

/** An email built around one link: the text, the link, then a footnote. */
function linkEmail(
  subject: string,
  intro: string,
  link: string,
  button: string,
  footnote: string,
): MailContent {
  return {
    subject,
    text: [subject, '', intro, '', link, '', footnote].join('\n'),
    html: layout(
      subject,
      `<h2>${escapeHtml(subject)}</h2>\n<p>${intro}</p>\n` +
        `<p><a href="${escapeHtml(link)}">${button}</a></p>\n` +
        `<p style="color:#888">${footnote}</p>`,
    ),
  };
}

/** A notice about a change to the account: no link, nothing user-typed. */
function notice(subject: string, what: string): MailContent {
  return {
    subject,
    text: [subject, '', what, '', NOT_YOU].join('\n'),
    html: layout(
      subject,
      `<h2>${escapeHtml(subject)}</h2>\n<p>${what}</p>\n<p>${NOT_YOU}</p>`,
    ),
  };
}

/** The reset link, to the account's own address only. */
export function passwordResetEmail(link: string): MailContent {
  return linkEmail(
    'Відновлення пароля',
    'Щоб задати новий пароль, відкрийте посилання. Воно діє 1 годину ' +
      'і спрацює лише один раз.',
    link,
    'Задати новий пароль',
    'Якщо ви не просили відновити пароль, просто проігноруйте цей лист: ' +
      'ваш пароль не зміниться.',
  );
}

/** The verification link, to the address being verified. */
export function emailVerificationEmail(link: string): MailContent {
  return linkEmail(
    'Підтвердження email',
    'Щоб підтвердити цю адресу для акаунта SimpleFood, відкрийте ' +
      'посилання. Воно діє 48 годин.',
    link,
    'Підтвердити email',
    'Якщо ви не реєструвалися на SimpleFood і не вказували цю адресу, ' +
      'просто проігноруйте цей лист.',
  );
}

/** After a password change or reset, to the account's address. */
export function passwordChangedEmail(): MailContent {
  return notice(
    'Пароль змінено',
    'Пароль вашого акаунта SimpleFood щойно змінили. Усі сеанси на інших ' +
      'пристроях завершено.',
  );
}

/**
 * To the old address after an email change. It never names the new
 * address: the old mailbox may no longer be the owner's (an abandoned or
 * shared one), and the new address is their personal data.
 */
export function emailChangedEmail(): MailContent {
  return notice(
    'Адресу email змінено',
    'Адресу email вашого акаунта SimpleFood щойно змінили, тож листи ' +
      'від нас більше не надходитимуть на цю адресу.',
  );
}
