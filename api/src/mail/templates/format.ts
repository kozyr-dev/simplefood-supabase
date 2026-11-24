/*
 * Shared helpers for email templates. Each module keeps its own emails in its
 * `templates/` folder as functions returning a MailMessage's subject, text
 * and html. Emails are in Ukrainian, like the site.
 */

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * Text made safe for an HTML body or attribute. Use it on every value that
 * came from a user (names, messages, comments, addresses).
 */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

const UAH = new Intl.NumberFormat('uk-UA', {
  style: 'currency',
  currency: 'UAH',
});

/**
 * Kopiykas as Ukrainian text: `18900` → `189,00 ₴`. The spaces (before `₴`,
 * between thousands) are non-breaking (U+00A0).
 */
export function formatMoney(kopiykas: number): string {
  return UAH.format(kopiykas / 100);
}

/**
 * The HTML document every email shares. `title` is escaped here; `bodyHtml`
 * must already be safe, built with escapeHtml().
 */
export function layout(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="uk">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#222">
${bodyHtml}
<p style="margin-top:32px;color:#888;font-size:13px">SimpleFood</p>
</body>
</html>
`;
}
