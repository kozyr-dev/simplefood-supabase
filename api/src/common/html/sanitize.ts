import sanitizeHtml, { type IOptions } from 'sanitize-html';

/*
 * HTML that staff write in the admin and the site shows as-is
 * (`dangerouslySetInnerHTML`): product descriptions and some section texts.
 * An editor account must not be able to put a script on the public site,
 * so every such field is cleaned on write, with an allow-list built from
 * what the imported Strapi content uses (checked 2026-11-11) and what the
 * admin's rich-text editor (tiptap) writes.
 */

/** Any CSS value without `url(`, `expression(` or a backslash escape. */
const PLAIN_CSS_VALUE = /^(?!.*(?:url\s*\(|expression\s*\(|\\)).*$/i;

const RICH_HTML: IOptions = {
  allowedTags: [
    'p',
    'br',
    'span',
    'strong',
    'b',
    'em',
    'i',
    'u',
    's',
    'sub',
    'sup',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'blockquote',
    'mark',
    'code',
    'pre',
    'ul',
    'ol',
    'li',
    'a',
    'img',
    'figure',
    'figcaption',
    'table',
    'thead',
    'tbody',
    'tfoot',
    'tr',
    'th',
    'td',
    'hr',
  ],
  allowedAttributes: {
    '*': ['style'],
    a: ['href', 'target', 'rel', 'title'],
    img: ['src', 'alt', 'title', 'width', 'height'],
    td: ['colspan', 'rowspan'],
    th: ['colspan', 'rowspan'],
  },
  allowedClasses: { figure: ['table', 'image', /^image-style-[\w-]+$/] },
  allowedStyles: {
    '*': {
      color: [PLAIN_CSS_VALUE],
      'background-color': [PLAIN_CSS_VALUE],
      'font-family': [PLAIN_CSS_VALUE],
      'font-size': [PLAIN_CSS_VALUE],
      'font-weight': [PLAIN_CSS_VALUE],
      'font-style': [PLAIN_CSS_VALUE],
      'text-align': [/^(left|right|center|justify)$/],
      'text-decoration': [PLAIN_CSS_VALUE],
      'margin-left': [PLAIN_CSS_VALUE],
      border: [PLAIN_CSS_VALUE],
      width: [PLAIN_CSS_VALUE],
      height: [PLAIN_CSS_VALUE],
    },
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  // Images only from the web or this API's /uploads (relative URLs pass).
  allowedSchemesByTag: { img: ['http', 'https'] },
  allowProtocolRelative: false,
  // A link that opens a new tab can't reach back into the site's page.
  transformTags: {
    a: (tagName, attribs) => ({
      tagName,
      attribs:
        attribs.target === '_blank'
          ? { ...attribs, rel: 'noopener noreferrer' }
          : attribs,
    }),
  },
};

/** Players and maps an embed code may show. */
export const EMBED_HOSTS = [
  'www.google.com',
  'maps.google.com',
  'www.youtube.com',
  'www.youtube-nocookie.com',
  'player.vimeo.com',
];

const EMBED: IOptions = {
  allowedTags: ['iframe'],
  allowedAttributes: {
    iframe: [
      'src',
      'width',
      'height',
      'style',
      'title',
      'allow',
      'allowfullscreen',
      'frameborder',
      'loading',
      'referrerpolicy',
    ],
  },
  allowedStyles: {
    iframe: {
      border: [PLAIN_CSS_VALUE],
      width: [PLAIN_CSS_VALUE],
      height: [PLAIN_CSS_VALUE],
    },
  },
  allowedSchemes: ['https'],
  allowProtocolRelative: false,
  allowedIframeHostnames: EMBED_HOSTS,
  // Text around the iframe is dropped, not escaped onto the page.
  disallowedTagsMode: 'completelyDiscard',
};

/** Rich text for the site: the allow-listed tags, attributes and styles only. */
export function sanitizeRichHtml(html: string): string {
  return sanitizeHtml(html, RICH_HTML).trim();
}

/**
 * An embed code: one or more iframes from EMBED_HOSTS over https, nothing
 * else. Null when nothing usable is left (the caller refuses it).
 */
export function sanitizeEmbed(html: string): string | null {
  const clean = sanitizeHtml(html, EMBED).trim();
  return /<iframe\b[^>]*\ssrc="https:\/\//.test(clean) ? clean : null;
}
