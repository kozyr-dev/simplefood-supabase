import {
  DEFAULT_EXCERPT_LENGTH,
  stripMarkdown,
  toExcerpt,
} from './markdown-excerpt';

describe('stripMarkdown', () => {
  it.each([
    ['headings', '# Title\n## Sub title', 'Title Sub title'],
    ['links keep their text', 'See [our menu](/menu) now', 'See our menu now'],
    [
      'images are removed',
      'Before ![a dish](/uploads/a.jpg) after',
      'Before after',
    ],
    ['bold', 'This is **very** good', 'This is very good'],
    ['bold with underscores', 'This is __very__ good', 'This is very good'],
    ['italics', 'This is *quite* good', 'This is quite good'],
    ['underscore italics', 'This is _quite_ good', 'This is quite good'],
    ['strikethrough', 'Price ~~200~~ 150', 'Price 200 150'],
    ['inline code', 'Use `promo10` today', 'Use promo10 today'],
    ['HTML tags', 'Line one<br>Line <b>two</b>', 'Line one Line two'],
    ['blockquotes', '> Quoted text', 'Quoted text'],
    ['bullet lists', '- one\n* two\n+ three', 'one two three'],
    ['numbered lists', '1. first\n2) second', 'first second'],
    ['horizontal rules', 'Above\n\n---\n\nBelow', 'Above Below'],
    ['fenced code blocks', 'Text\n```\ncode here\n```\nMore', 'Text More'],
    [
      'newlines and spaces',
      '  Line one\n\n\n  Line   two  ',
      'Line one Line two',
    ],
  ])('handles %s', (_label, markdown, expected) => {
    expect(stripMarkdown(markdown)).toBe(expected);
  });

  it('keeps underscores inside words (snake_case)', () => {
    expect(stripMarkdown('Use promo_code_10 today')).toBe(
      'Use promo_code_10 today',
    );
  });

  it('returns an empty string for empty input', () => {
    expect(stripMarkdown('')).toBe('');
  });
});

describe('toExcerpt', () => {
  it('returns short text unchanged (but stripped)', () => {
    expect(toExcerpt('## Fresh **borscht** today')).toBe('Fresh borscht today');
  });

  it(`defaults to ${DEFAULT_EXCERPT_LENGTH} characters`, () => {
    const long = 'word '.repeat(100);

    expect(toExcerpt(long).length).toBeLessThanOrEqual(DEFAULT_EXCERPT_LENGTH);
  });

  it('cuts at a word boundary and appends an ellipsis', () => {
    expect(toExcerpt('The quick brown fox jumps over the lazy dog', 20)).toBe(
      'The quick brown fox…',
    );
  });

  it('never exceeds maxLength, ellipsis included', () => {
    for (let max = 5; max <= 40; max++) {
      expect(
        toExcerpt('The quick brown fox jumps over the lazy dog', max).length,
      ).toBeLessThanOrEqual(max);
    }
  });

  it('drops trailing punctuation before the ellipsis', () => {
    expect(toExcerpt('Hello, world, and everyone else', 15)).toBe(
      'Hello, world…',
    );
  });

  it('hard-cuts a single word that is longer than the limit', () => {
    expect(toExcerpt('Supercalifragilisticexpialidocious', 10)).toBe(
      'Supercali…',
    );
  });

  it('measures the limit on the stripped text, not the markdown', () => {
    const markdown =
      '[Read the whole story](https://example.com/a/very/long/url)';

    expect(toExcerpt(markdown, 25)).toBe('Read the whole story');
  });
});
