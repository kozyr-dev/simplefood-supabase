import type { ServerResponse } from 'node:http';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpAdapterHost } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AllExceptionsFilter } from '@/common/filters/all-exceptions.filter';
import { serveAdminApp } from '@/common/http/admin-app';
import { TrimPipe } from '@/common/pipes/trim.pipe';
import { flattenValidationErrors } from '@/common/validation/flatten-validation-errors';
import { REQUEST_ID_HEADER } from '@/common/logging/constants';
import mediaConfig, { type MediaConfig } from '@/config/media.config';
import { setupSwagger } from '@/config/swagger.config';
import { UPLOADS_PATH } from '@/media/types/media.types';

/**
 * HTTP pipeline shared by main.ts and the e2e tests, so tests exercise the
 * exact routes, headers, pipes and filters production uses. Process-level
 * concerns (shutdown hooks, listen) stay in main.ts.
 */
export function configureApp(app: NestExpressApplication): void {
  const config: ConfigService = app.get(ConfigService);

  // Behind N reverse proxies, `req.ip` is the client address N hops back in
  // X-Forwarded-For (rate limits and logs key on it). With 0 the header is
  // ignored: anyone reaching the API directly could forge it.
  const proxyHops = config.getOrThrow<number>('TRUST_PROXY_HOPS');
  if (proxyHops > 0) {
    app.set('trust proxy', proxyHops);
  }

  // First, so every response gets the headers, including CORS preflights,
  // 404s and errors (on Express, middleware added earlier would skip them).
  app.useSecurityHeaders();

  // Public API under /api; infrastructure probes (/health) stay at the root,
  // so load balancers and uptime checks don't depend on the API's URL layout.
  app.setGlobalPrefix('api', { exclude: ['health'] });

  app.useLogger(app.get(Logger));

  app.enableCors({
    origin: config
      .getOrThrow<string>('CORS_ORIGINS')
      .split(',')
      .map((origin) => origin.trim()),
    // Retry-After: so a browser client can read when a 429 ends.
    exposedHeaders: [REQUEST_ID_HEADER, 'Retry-After'],
  });

  // Uploaded images at /uploads, outside /api (where Strapi served them, so
  // imported URLs keep working). Served before Nest's routing, so they skip
  // the request log; a missing file falls through to the usual 404.
  app.useStaticAssets(app.get<MediaConfig>(mediaConfig.KEY).uploadsDir, {
    prefix: UPLOADS_PATH,
    // Names are random and never reused: a file never changes.
    maxAge: '365d',
    immutable: true,
    index: false,
    redirect: false,
    // Hidden files (a write in progress) don't exist, as far as clients know.
    dotfiles: 'ignore',
    setHeaders: (res: ServerResponse) => {
      // The site shows these images from another origin; the security
      // headers' `same-origin` would make browsers refuse them.
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    },
  });

  // The admin app (api/admin/), when it has been built: same host as the API.
  if (!serveAdminApp(app, config.getOrThrow<string>('ADMIN_DIST_DIR'))) {
    app
      .get(Logger)
      .warn('Admin app not built: /admin is not served (see README)');
  }

  // Pipes run in this order: trim first, so validators see trimmed values.
  app.useGlobalPipes(
    new TrimPipe(),
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      // No silent coercion ("false" -> true, "abc" -> NaN); use @Type() explicitly.
      transformOptions: { enableImplicitConversion: false },
      exceptionFactory: (errors) => {
        const { details, truncated } = flattenValidationErrors(errors);
        return new BadRequestException({
          message: 'Validation failed',
          details,
          ...(truncated && { truncated }),
        });
      },
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter(app.get(HttpAdapterHost)));

  // Off unless explicitly enabled: the docs list the whole API surface.
  if (config.get<boolean>('SWAGGER_ENABLED')) {
    setupSwagger(app);
  }
}
