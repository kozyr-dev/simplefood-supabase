import { existsSync } from 'node:fs';
import type { ServerResponse } from 'node:http';
import { join, resolve } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';

/** Where the admin app is served: the API's own host, so its cookie and CSP work. */
export const ADMIN_APP_PATH = '/admin';

/**
 * Serves the built admin app (`admin/`, `npm run build` there) at /admin,
 * if `distDir` holds a build; returns whether it does. `index.html` is
 * revalidated on every load, so a deploy shows up at once; the hashed
 * assets never change, so browsers keep them a year.
 *
 * The app routes with the URL's hash (`/admin/#/products`): every page is
 * index.html, and no fallback route is needed.
 */
export function serveAdminApp(
  app: NestExpressApplication,
  distDir: string,
): boolean {
  const root = resolve(distDir);
  if (!existsSync(join(root, 'index.html'))) {
    return false;
  }
  app.useStaticAssets(root, {
    prefix: ADMIN_APP_PATH,
    index: 'index.html',
    // `/admin` -> `/admin/`: the app's relative asset URLs need the slash.
    redirect: true,
    dotfiles: 'ignore',
    setHeaders: (res: ServerResponse, path: string) => {
      res.setHeader(
        'Cache-Control',
        path.endsWith('.html')
          ? 'no-cache'
          : 'public, max-age=31536000, immutable',
      );
    },
  });
  return true;
}
