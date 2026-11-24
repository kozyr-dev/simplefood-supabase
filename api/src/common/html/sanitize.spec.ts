import { sanitizeEmbed, sanitizeRichHtml } from './sanitize';

describe('sanitizeRichHtml', () => {
  it.each([
    [
      'paragraphs and inline formatting',
      '<p>Борщ <strong>зі</strong> <em>сметаною</em><br /></p>',
    ],
    [
      'lists and headings',
      '<h1>Меню</h1><ul><li>Суп</li></ul><ol><li>Салат</li></ol>',
    ],
    ['a link', '<a href="https://example.com/menu">Меню</a>'],
    ['a phone link', '<a href="tel:+380671234567">Call</a>'],
    ['an uploaded image', '<img src="/uploads/abc.jpg" alt="Борщ" />'],
    [
      'a table in a figure',
      '<figure class="table"><table><tbody><tr><td>1</td></tr></tbody></table></figure>',
    ],
    [
      'the styles the imported content uses',
      '<p style="margin-left:40px"><span style="background-color:hsl(0,0%,100%);color:hsl(0,0%,0%);font-family:Arial, Helvetica, sans-serif">x</span></p>',
    ],
  ])('keeps %s', (_, html) => {
    expect(sanitizeRichHtml(html)).toBe(html);
  });

  it.each([
    ['a script', '<p>a</p><script>alert(1)</script>', '<p>a</p>'],
    ['an event handler', '<p onclick="alert(1)">a</p>', '<p>a</p>'],
    [
      'an onerror image',
      '<img src="x.jpg" onerror="alert(1)" />',
      '<img src="x.jpg" />',
    ],
    ['a javascript: link', '<a href="javascript:alert(1)">a</a>', '<a>a</a>'],
    [
      'a javascript: link with tricks',
      '<a href=" jav&#x09;ascript:alert(1)">a</a>',
      '<a>a</a>',
    ],
    [
      'a data: image',
      '<img src="data:image/svg+xml;base64,PHN2Zz4=" />',
      '<img />',
    ],
    [
      'a protocol-relative image',
      '<img src="//evil.example/x.jpg" />',
      '<img />',
    ],
    [
      'an iframe',
      '<p>a</p><iframe src="https://evil.example"></iframe>',
      '<p>a</p>',
    ],
    ['a style tag', '<style>body{display:none}</style><p>a</p>', '<p>a</p>'],
    [
      'a form',
      '<form action="https://evil.example"><input name="password"></form>',
      '',
    ],
    [
      'a CSS url()',
      '<p style="background-color:url(https://evil.example/x)">a</p>',
      '<p>a</p>',
    ],
    [
      'a CSS property not on the list',
      '<p style="position:fixed;color:red">a</p>',
      '<p style="color:red">a</p>',
    ],
    [
      'an unknown class',
      '<figure class="evil table">a</figure>',
      '<figure class="table">a</figure>',
    ],
    ['an svg', '<svg><script>alert(1)</script></svg><p>a</p>', '<p>a</p>'],
  ])('removes %s', (_, html, expected) => {
    expect(sanitizeRichHtml(html)).toBe(expected);
  });

  it('makes a new-tab link unable to reach back into the page', () => {
    expect(
      sanitizeRichHtml('<a href="https://example.com" target="_blank">a</a>'),
    ).toBe(
      '<a href="https://example.com" target="_blank" rel="noopener noreferrer">a</a>',
    );
  });

  it('leaves plain text alone (escaping only what must be)', () => {
    expect(sanitizeRichHtml('Ціна: 189 ₴ & знижка')).toBe(
      'Ціна: 189 ₴ &amp; знижка',
    );
  });
});

describe('sanitizeEmbed', () => {
  const MAP =
    '<iframe src="https://www.google.com/maps/embed?pb=!1m18" width="600" height="450" style="border:0" allowfullscreen loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>';

  it('keeps a Google Maps iframe as the imported content has it', () => {
    expect(sanitizeEmbed(MAP)).toBe(MAP);
  });

  it.each([
    ['YouTube', 'https://www.youtube.com/embed/abc'],
    ['YouTube without cookies', 'https://www.youtube-nocookie.com/embed/abc'],
    ['Vimeo', 'https://player.vimeo.com/video/1'],
  ])('keeps a %s player', (_, src) => {
    expect(sanitizeEmbed(`<iframe src="${src}"></iframe>`)).toBe(
      `<iframe src="${src}"></iframe>`,
    );
  });

  it.each([
    [
      'an iframe from another host',
      '<iframe src="https://evil.example/x"></iframe>',
    ],
    [
      'a lookalike host',
      '<iframe src="https://www.google.com.evil.example/maps"></iframe>',
    ],
    ['plain http', '<iframe src="http://www.google.com/maps/embed"></iframe>'],
    ['a javascript: iframe', '<iframe src="javascript:alert(1)"></iframe>'],
    ['a script', '<script src="https://www.google.com/x.js"></script>'],
    ['plain text', 'a map of the shop'],
    ['an empty string', ''],
  ])('refuses %s (nothing usable left)', (_, html) => {
    expect(sanitizeEmbed(html)).toBeNull();
  });

  it('drops everything around the iframe and its handlers', () => {
    expect(
      sanitizeEmbed(
        '<p>Map:</p><iframe src="https://www.google.com/maps/embed" onload="alert(1)"></iframe><script>x</script>',
      ),
    ).toBe('<iframe src="https://www.google.com/maps/embed"></iframe>');
  });
});
