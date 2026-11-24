/*
 * A browser smoke test of the admin app, with the Chrome installed on this
 * machine (puppeteer-core downloads nothing).
 *
 * IT CHANGES DATA: a product price, a page's section order, a menu's order,
 * an order's status, a message, the settings, and it uploads an image. Run
 * it only against a throwaway copy of the database (README, "The admin app").
 *
 *   ADMIN_URL=http://localhost:1341/admin/ ADMIN_EMAIL=… ADMIN_PASSWORD=… \
 *     SMOKE_THROWAWAY_DATABASE=yes npm run smoke
 *
 * Exits 1 on the first failed step, or when the page logged an error or
 * broke the Content Security Policy.
 */
import puppeteer from 'puppeteer-core';

const {
  ADMIN_URL = 'http://localhost:1341/admin/',
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  SMOKE_THROWAWAY_DATABASE,
  SCREENSHOTS,
} = process.env;

if (SMOKE_THROWAWAY_DATABASE !== 'yes' || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error(
    'Set ADMIN_EMAIL, ADMIN_PASSWORD and SMOKE_THROWAWAY_DATABASE=yes (it writes data).',
  );
  process.exit(2);
}

const API = new URL('/api', ADMIN_URL).href;
/** Makes every value this run types new, so each form really changes. */
const RUN = String(Date.now()).slice(-6);
const problems = [];
/** 4xx answers steps expect (`method path status`, matched); anything else is a problem. */
const expected = [];
const unexpected = [];
const browser = await puppeteer.launch({
  executablePath: CHROME_PATH,
  headless: true,
});
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 1000 });
page.on('console', (m) => {
  // Failed requests are judged by their responses (below), not this line.
  if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) {
    problems.push(`console: ${m.text().slice(0, 300)}`);
  }
});
page.on('response', (res) => {
  if (res.status() < 400) return;
  const key = `${res.request().method()} ${new URL(res.url()).pathname} ${res.status()}`;
  if (res.status() >= 500 || !expected.some((pattern) => pattern.test(key))) {
    unexpected.push(key);
  }
});
// Signed out (first load, after logout): the app asks for a session first.
expected.push(/^POST \/api\/admin\/auth\/refresh 401$/);
page.on('pageerror', (e) =>
  problems.push(`page error: ${e.message.slice(0, 300)}`),
);
await page.evaluateOnNewDocument(() =>
  document.addEventListener('securitypolicyviolation', (e) =>
    console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI}`),
  ),
);

let step = 0;
async function check(name, run) {
  step += 1;
  try {
    await run();
    console.log(`ok  ${step}. ${name}`);
    if (SCREENSHOTS)
      await page.screenshot({ path: `${SCREENSHOTS}/${step}.png` });
  } catch (error) {
    console.log(`BAD ${step}. ${name}: ${error.message}`);
    if (SCREENSHOTS)
      await page.screenshot({ path: `${SCREENSHOTS}/${step}-failed.png` });
    await browser.close();
    process.exit(1);
  }
}

const text = () => page.evaluate(() => document.body.innerText);
const go = (hash) =>
  page.goto(`${ADMIN_URL}#${hash}`, { waitUntil: 'domcontentloaded' });
/** Text on the page, in any case (innerText follows CSS: buttons are upper-case). */
const waitForText = (needle, timeout = 10_000) =>
  page.waitForFunction(
    (n) => document.body.innerText.toLowerCase().includes(n.toLowerCase()),
    { timeout },
    needle,
  );
/** Clicks the first button or link whose text or aria-label is `label`. */
async function click(label) {
  const handle = await page.waitForFunction(
    (l) =>
      [
        ...document.querySelectorAll(
          'button, a, [role="button"], [role="menuitem"], li',
        ),
      ].find(
        (el) =>
          !el.disabled &&
          // innerText follows CSS: MUI buttons read "SAVE" for "Save".
          (el.getAttribute('aria-label') === l ||
            el.innerText?.trim().toLowerCase() === l.toLowerCase()),
      ),
    { timeout: 10_000 },
    label,
  );
  await handle.asElement().click();
}
async function fill(selector, value) {
  await page.waitForSelector(selector);
  await page.focus(selector);
  // Select what is there, so typing replaces it.
  await page.$eval(selector, (el) => el.select());
  await page.keyboard.press('Backspace');
  await page.type(selector, value);
}
/** The public API, as the site reads it. */
const site = async (path) => (await (await fetch(`${API}${path}`)).json()).data;

await check('signs in', async () => {
  await page.goto(ADMIN_URL, { waitUntil: 'domcontentloaded' });
  await fill('input[name="email"]', ADMIN_EMAIL);
  await fill('input[name="password"]', ADMIN_PASSWORD);
  await page.click('button[type="submit"]');
  await waitForText('Latest orders');
});

await check('the dashboard counts orders and messages', async () => {
  const body = await text();
  for (const tile of ['New orders', 'Orders today', 'New messages']) {
    if (!body.includes(tile)) throw new Error(`no "${tile}" tile`);
  }
});

await check('stays signed in after a reload (refresh cookie)', async () => {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForText('Latest orders');
});

/** A list's first row, clicked on its first cell (the middle may be a link). */
const FIRST_ROW = 'table tbody tr td:first-child';
/**
 * Waits for a list's rows by one of its own columns: the page before it may
 * still show a table (the image library, an order's items) for a moment.
 */
const listRows = (column) =>
  page.waitForSelector(`table tbody tr td.column-${column}`);

/** The id at the end of the current URL (`#/products/<id>`). */
const currentId = () => page.evaluate(() => location.hash.split('/')[2]);
/** Opens the first row of a list whose text includes `needle`. */
async function openRow(needle) {
  const row = await page.waitForFunction(
    (n) =>
      [...document.querySelectorAll('table tbody tr')].find((tr) =>
        tr.innerText.includes(n),
      ),
    { timeout: 10_000 },
    needle,
  );
  await row.asElement().click();
}
const inputValue = (selector) => page.$eval(selector, (el) => el.value);
async function save() {
  // Not while a dialog (the image picker) is still fading out over it.
  await page.waitForSelector('[role="dialog"]', { hidden: true });
  await page.click('button[type="submit"]');
}
/** A 1×1 JPEG, to upload. */
const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
  'base64',
);

await check('uploads an image to the library', async () => {
  await go('/media/create');
  const path = `${process.env.TMPDIR ?? '/tmp'}/smoke-${Date.now()}.jpg`;
  await (await import('node:fs/promises')).writeFile(path, JPEG);
  const input = await page.waitForSelector('input[type="file"]');
  await input.uploadFile(path);
  await fill('input[name="alt"]', 'Smoke test image');
  await fill('input[name="folder"]', 'smoke');
  await save();
  // The form shows the file name too: wait for the redirect to the list,
  // or it lands after the next step has moved on.
  await page.waitForFunction(() => location.hash === '#/media', {
    timeout: 10_000,
  });
  await waitForText('smoke-');
});

await check(
  'edits a product: price in hryvnias, an image from the picker',
  async () => {
    await go('/products');
    await listRows('price');
    await page.click(FIRST_ROW);
    await page.waitForSelector('input[name="price"]');
    const slug = await inputValue('input[name="slug"]');
    const price = `1${RUN.slice(-2)}.50`;
    await fill('input[name="price"]', price);
    await click(
      await page.evaluate(() =>
        document.body.innerText.toLowerCase().includes('change…')
          ? 'Change…'
          : 'Choose…',
      ),
    );
    await waitForText('Choose an image');
    await page.waitForSelector('[role="dialog"] button[title]');
    await page.click('[role="dialog"] button[title]');
    await save();
    await page.waitForFunction(() => location.hash === '#/products', {
      timeout: 10_000,
    });
    const product = await site(`/products/${slug}`);
    if (product.price !== Number(price.replace('.', '')))
      throw new Error(`the site shows ${product.price}, not ${price} ₴`);
    if (!product.image?.url.includes('/uploads/'))
      throw new Error('no image on the site');
  },
);

await check('shows a server validation error under its field', async () => {
  await go('/products');
  await listRows('price');
  await page.click(FIRST_ROW);
  await page.waitForSelector('input[name="slug"]');
  expected.push(/^PATCH \/api\/admin\/products\/[\w-]+ 400$/);
  await fill('input[name="slug"]', 'Not A Slug');
  await save();
  await waitForText('lower-case letters and digits, joined by single hyphens');
});

await check('reorders the homepage sections; the site follows', async () => {
  const before = (await site('/pages/home')).sections.map((s) => s.id);
  await go('/pages?filter=%7B%22q%22%3A%22home%22%7D');
  await openRow('home');
  await waitForText('Sections');
  await page.waitForSelector('button[aria-label="Move down"]:not([disabled])');
  await page.click('button[aria-label="Move down"]:not([disabled])');
  await page.waitForFunction(
    async (api, first) =>
      (await (await fetch(`${api}/pages/home`)).json()).data.sections[1].id ===
      first,
    { timeout: 10_000 },
    API,
    before[0],
  );
  const after = (await site('/pages/home')).sections.map((s) => s.id);
  if (after[0] !== before[1] || after[1] !== before[0])
    throw new Error('order unchanged');
});

await check(
  'edits a section: JSON and back, a new title; the site follows',
  async () => {
    await page.click('a[aria-label="Edit"]');
    await page.waitForFunction(() =>
      document.body.innerText.includes('Edit as JSON'),
    );
    const sectionId = await currentId();
    await page.click('.MuiSwitch-input');
    await page.waitForFunction(() =>
      [...document.querySelectorAll('textarea')].some((t) =>
        t.value.trim().startsWith('{'),
      ),
    );
    const json = await page.$$eval('textarea', (all) =>
      all.map((t) => t.value).find((v) => v.trim().startsWith('{')),
    );
    JSON.parse(json);
    await page.click('.MuiSwitch-input');
    await fill('input[name="data.title"]', `Smoke title ${RUN}`);
    await save();
    await waitForText('Sections');
    const section = (await site('/pages/home')).sections.find(
      (s) => s.id === sectionId,
    );
    if (section?.title !== `Smoke title ${RUN}`) {
      throw new Error(`the site shows "${section?.title}"`);
    }
  },
);

await check('adds a promo section to the homepage', async () => {
  const count = (await site('/pages/home')).sections.length;
  // The page form has no other select: this is "New section".
  // By keyboard: the last save's notification may cover it.
  await page.waitForSelector('[role="combobox"]');
  await page.focus('[role="combobox"]');
  await page.keyboard.press('ArrowDown');
  const option = await page.waitForFunction(() =>
    [...document.querySelectorAll('li[role="option"]')].find(
      (li) => li.innerText === 'Promo',
    ),
  );
  // A DOM click: the option's middle may be under the notification.
  await option.evaluate((li) => li.click());
  // The list's closing backdrop would take the click.
  await page.waitForSelector('[role="listbox"]', { hidden: true });
  await page.waitForSelector('.MuiBackdrop-root', { hidden: true });
  // Enabled once the choice has rendered.
  await page.waitForSelector('button[aria-label="Add"]:not([disabled])');
  await page.click('button[aria-label="Add"]');
  await page.waitForSelector('input[name="data.title"]');
  await fill('input[name="data.title"]', `Smoke promo ${RUN}`);
  await save();
  await waitForText('Sections');
  const sections = (await site('/pages/home')).sections;
  if (sections.length !== count + 1 || sections.at(-1).type !== 'promo') {
    throw new Error('the site does not show the new section last');
  }
});

await check('reorders the header menu; the site follows', async () => {
  const titles = async () =>
    JSON.stringify(await site('/menus/header')).match(/"title":"[^"]*"/g);
  const before = await titles();
  await go('/menus');
  await openRow('header');
  await page.waitForSelector('button[aria-label="Move down"]:not([disabled])');
  await page.click('button[aria-label="Move down"]:not([disabled])');
  await page.waitForFunction(
    async (api, b) =>
      JSON.stringify((await (await fetch(`${api}/menus/header`)).json()).data)
        .match(/"title":"[^"]*"/g)
        ?.join() !== b,
    { timeout: 10_000 },
    API,
    before.join(),
  );
});

await check('moves a new order to processing', async () => {
  await go('/orders?filter=%7B%22status%22%3A%22new%22%7D');
  await listRows('number');
  await page.click(FIRST_ROW);
  await click('Start processing');
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll('.MuiChip-label')].some(
        (c) => c.innerText === 'processing',
      ),
    { timeout: 10_000 },
  );
});

await check('marks a message handled', async () => {
  await go('/contact-messages');
  await listRows('handled');
  await page.click(FIRST_ROW);
  await click('Mark handled');
  await waitForText('Mark as new');
});

await check('changes the site settings; the site follows', async () => {
  await go('/settings');
  await page.waitForSelector('input[name="phone"]');
  await fill('input[name="phone"]', `+380 44 ${RUN}`);
  await save();
  await page.waitForFunction(
    async (api, phone) =>
      (await (await fetch(`${api}/settings`)).json()).data.phone === phone,
    { timeout: 10_000 },
    API,
    `+380 44 ${RUN}`,
  );
});

await check('lists accounts (admins only)', async () => {
  await go('/users');
  await listRows('name');
});

if (process.env.EDITOR_EMAIL) {
  await check('an editor does not see accounts', async () => {
    await click('Manual Check Admin').catch(() => undefined);
    await go('/');
    const context = await browser.createBrowserContext();
    const editor = await context.newPage();
    await editor.goto(ADMIN_URL, { waitUntil: 'domcontentloaded' });
    await editor.waitForSelector('input[name="email"]');
    await editor.type('input[name="email"]', process.env.EDITOR_EMAIL);
    await editor.type('input[name="password"]', ADMIN_PASSWORD);
    await editor.click('button[type="submit"]');
    await editor.waitForFunction(
      () => document.body.innerText.includes('Latest orders'),
      { timeout: 10_000 },
    );
    const menu = await editor.evaluate(() => document.body.innerText);
    if (menu.includes('Accounts')) throw new Error('the editor sees Accounts');
    await context.close();
  });
}

await browser.close();
if (problems.length || unexpected.length) {
  console.log(
    `BAD the page reported problems:\n  ${[...problems, ...unexpected.map((r) => `unexpected answer: ${r}`)].join('\n  ')}`,
  );
  process.exit(1);
}
console.log('All steps passed, no console errors or CSP violations.');
