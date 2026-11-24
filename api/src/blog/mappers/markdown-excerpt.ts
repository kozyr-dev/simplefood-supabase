/** Default excerpt length: about two lines of a preview card. */
export const DEFAULT_EXCERPT_LENGTH = 160;

const ELLIPSIS = '…';

/**
 * Markdown -> plain text, good enough for previews (not a full parser).
 * Order matters: images before links (`![a](b)` contains `[a](b)`), and
 * block markers (headings, quotes, lists) before inline emphasis.
 */
export function stripMarkdown(markdown: string): string {
  return (
    markdown
      // Fenced code blocks: not useful in a preview.
      .replace(/```[\s\S]*?```/g, ' ')
      // Images: dropped entirely (alt text isn't prose).
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      // Links: keep the text, drop the URL.
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      // HTML tags (e.g. <br>, <p>).
      .replace(/<[^>]+>/g, ' ')
      // Horizontal rules: ---, ***, ___ on their own line.
      .replace(/^\s*([-*_])(\s*\1){2,}\s*$/gm, ' ')
      // Block markers at line start: headings, blockquotes, list bullets/numbers.
      .replace(/^\s{0,3}#{1,6}\s+/gm, '')
      .replace(/^\s{0,3}>\s?/gm, '')
      .replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, '')
      // Inline: code, bold, strikethrough, italics.
      .replace(/`([^`]*)`/g, '$1')
      .replace(/(\*\*|__)(.+?)\1/g, '$2')
      .replace(/~~(.+?)~~/g, '$1')
      .replace(/\*(\S(?:.*?\S)?)\*/g, '$1')
      // `_italic_` only at word boundaries, so snake_case words survive.
      .replace(/(^|\W)_(\S(?:.*?\S)?)_(?!\w)/g, '$1$2')
      // All whitespace (newlines included) -> single spaces.
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * A plain-text preview of markdown, at most `maxLength` characters
 * (ellipsis included). Cuts at a word boundary, so no word is split, unless
 * a single word is longer than the limit.
 */
export function toExcerpt(
  markdown: string,
  maxLength: number = DEFAULT_EXCERPT_LENGTH,
): string {
  const text = stripMarkdown(markdown);
  if (text.length <= maxLength) {
    return text;
  }

  // Leave room for the ellipsis. If the cut lands mid-word, back up to the
  // last space; if it lands right at the end of a word, keep that word.
  const cut = text.slice(0, maxLength - ELLIPSIS.length);
  const endsOnWordBoundary = text[cut.length] === ' ';
  const lastSpace = cut.lastIndexOf(' ');
  const words =
    endsOnWordBoundary || lastSpace <= 0 ? cut : cut.slice(0, lastSpace);

  // "word," + "…" reads badly: drop trailing punctuation first.
  return words.replace(/[\s.,;:!?-]+$/, '') + ELLIPSIS;
}
