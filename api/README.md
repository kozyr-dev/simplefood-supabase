# SimpleFood API

REST API for the SimpleFood shop. It serves the Next.js website and, at `/admin`, the shop's admin app ([admin/](admin/)).

## Stack

| Area      | Choice                                                                 |
| --------- | ---------------------------------------------------------------------- |
| Runtime   | Node.js 24 (`.nvmrc`)                                                  |
| Framework | NestJS 12                                                              |
| Database  | PostgreSQL 18, TypeORM 1.x, migrations only (never `synchronize`)      |
| Logging   | `nestjs-pino`: JSON in production, pretty in development, request IDs  |
| Auth      | JWT access tokens (`@nestjs/jwt`), rotating refresh tokens, bcrypt     |
| Limits    | `@nestjs/throttler` on the auth routes only (no global limit)          |
| API docs  | `@nestjs/swagger` (OpenAPI 3)                                          |
| Admin app | react-admin 5 (React 19, MUI 9, Vite), in `admin/`, served at `/admin` |
| Tests     | Jest, Supertest, Testcontainers                                        |
| Quality   | TypeScript strict, oxlint, Prettier, GitHub Actions                    |

## Requirements

- **Node.js 24**: `nvm use` reads `.nvmrc`.
- **Docker**: runs the local database and Mailpit, and the e2e tests start their own throwaway Postgres.

## Getting started

```bash
nvm use
cp .env.example .env         # local settings; adjust if ports clash
docker compose up -d         # Postgres 18 (port 5433) + Mailpit
npm ci
npm run migration:run        # apply the database migrations
npm run start:dev            # http://localhost:1339
```

The admin app is a separate package in `admin/` (see "The admin app"): `cd admin && npm ci && npm run dev` for development, or `npm run build` there for the API to serve it at `/admin`.

| URL                               | What                                                               |
| --------------------------------- | ------------------------------------------------------------------ |
| <http://localhost:1339/api>       | API (every route is under `/api`)                                  |
| <http://localhost:1339/api/docs>  | Swagger UI, when `SWAGGER_ENABLED=true` (JSON at `/api/docs-json`) |
| <http://localhost:1339/health>    | Health check (outside `/api`; `503` when the database is down)     |
| `http://localhost:1339/uploads/…` | Uploaded images (outside `/api`), from `UPLOADS_DIR`               |
| <http://localhost:8025>           | Mailpit: catches every email sent in development                   |
| <http://localhost:1339/admin/>    | The admin app, once built (`admin/dist`)                           |
| <http://localhost:5173/admin/>    | The admin app's dev server (`cd admin && npm run dev`)             |

## Configuration

The API reads these variables. They are validated at startup in [src/config/env.validation.ts](src/config/env.validation.ts), and the app refuses to start if one is missing or invalid. Real environment variables take precedence over `.env`.

| Variable                                       | Required | Default        | Purpose                                                                          |
| ---------------------------------------------- | -------- | -------------- | -------------------------------------------------------------------------------- |
| `NODE_ENV`                                     | **yes**  |                | `development`, `production` or `test`                                            |
| `PORT`                                         | no       | `1339`         | HTTP port                                                                        |
| `LOG_LEVEL`                                    | no       | per `NODE_ENV` | pino level; `test` = `silent`, `development` = `debug`, `production` = `info`    |
| `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | **yes**  |                | PostgreSQL connection                                                            |
| `DB_PORT`                                      | no       | `5432`         | PostgreSQL port (`5433` locally, see `.env.example`)                             |
| `CORS_ORIGINS`                                 | **yes**  |                | Comma-separated list of allowed browser origins                                  |
| `SWAGGER_ENABLED`                              | no       | `false`        | Serve the API docs. Keep it off in production.                                   |
| `JWT_ACCESS_SECRET`                            | **yes**  |                | Signs access tokens; 32+ characters (`openssl rand -base64 48`)                  |
| `JWT_ACCESS_TTL`                               | no       | `900`          | Access token lifetime, in seconds                                                |
| `REFRESH_TOKEN_TTL_DAYS`                       | no       | `7`            | A refresh token expires after this many days without use                         |
| `REFRESH_TOKEN_MAX_TTL_DAYS`                   | no       | `30`           | A session ends this many days after login (at least the idle lifetime)           |
| `BCRYPT_ROUNDS`                                | no       | `12`           | Password hashing cost; at least `10` in production (`4` in the e2e tests)        |
| `TRUST_PROXY_HOPS`                             | no       | `0`            | Reverse proxies in front of the API; `0` ignores `X-Forwarded-For`               |
| `SMTP_HOST`                                    | **yes**  |                | SMTP server; `localhost` reaches Mailpit locally                                 |
| `SMTP_PORT`                                    | no       | `587`          | SMTP port (`1025` for Mailpit)                                                   |
| `SMTP_SECURE`                                  | no       | `false`        | `true`: TLS from the start (port 465). `false`: STARTTLS, required in production |
| `SMTP_USER`, `SMTP_PASSWORD`                   | no       |                | SMTP login: both or neither                                                      |
| `MAIL_FROM`                                    | **yes**  |                | Sender address, shown as "SimpleFood"                                            |
| `MAIL_NOTIFY_TO`                               | **yes**  |                | The shop's inbox: new orders and contact messages                                |
| `FRONTEND_URL`                                 | **yes**  |                | The site's address, for links in emails; `https` in production                   |
| `UPLOADS_DIR`                                  | no       | `uploads`      | Folder for uploaded images (served at `/uploads`); a volume in Docker            |
| `ADMIN_DIST_DIR`                               | no       | `admin/dist`   | The built admin app, served at `/admin` when it exists (a warning otherwise)     |

`POSTGRES_*` and `MAILPIT_*` in `.env` only configure Docker Compose; the API doesn't read them.

**Behind a reverse proxy, set `TRUST_PROXY_HOPS`.** Rate limits count per client IP. With the default `0`, the API sees the proxy's (or the Next server's) address for everyone, so the per-IP limits on register and refresh apply to the whole site at once. Set it to the number of proxies in front of the API, and make sure each one forwards `X-Forwarded-For`.

**Generate `JWT_ACCESS_SECRET`** with `openssl rand -base64 48` (64 random characters). The value in `.env.example` is for local development only: with `NODE_ENV=production` the app refuses to start with it. Rotating the secret invalidates every access token at once, but signs no one out: clients get a 401, refresh and carry on (refresh tokens aren't JWTs, so they keep working).

## Scripts

| Command                                                         | What it does                                                                 |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `npm run start:dev`                                             | Start with watch mode                                                        |
| `npm run start:debug`                                           | Start with watch mode and the debugger                                       |
| `npm run build` / `npm run start:prod`                          | Compile to `dist/` / run the compiled app                                    |
| `npm run typecheck`                                             | Type-check everything, tests included                                        |
| `npm run lint`                                                  | oxlint (type-aware)                                                          |
| `npm run format` / `npm run format:check`                       | Prettier: write / check                                                      |
| `npm test`                                                      | Unit tests (no Docker needed)                                                |
| `npm run test:watch` / `npm run test:cov`                       | Unit tests in watch mode / with coverage (report in `coverage/unit/`)        |
| `npm run test:debug`                                            | Unit tests with the debugger attached                                        |
| `npm run test:e2e` / `npm run test:e2e:cov`                     | E2E tests (needs Docker running) / with coverage (report in `coverage/e2e/`) |
| `npm run migration:generate -- src/database/migrations/<Name>`  | Generate a migration from entity changes                                     |
| `npm run migration:create -- src/database/migrations/<Name>`    | Create an empty migration                                                    |
| `npm run migration:run` / `migration:revert` / `migration:show` | Apply / undo the last / list migrations                                      |
| `npm run import:strapi -- --sqlite <data.db> --uploads <dir>`   | Import the old Strapi site (see below)                                       |
| `npm run admin:create -- --email <email> --name <name>`         | Create a staff account for the admin app (see below)                         |

The migration scripts (except `create`) build first and use the TypeORM CLI entry point [src/database/data-source.ts](src/database/data-source.ts). That file loads `.env` and validates it with the same schema as the app.

## Testing

- **Unit tests** (`src/**/*.spec.ts`) cover pure logic: no database and no Docker.
- **E2E tests** (`test/**/*.e2e-spec.ts`) boot the real app through `createTestApp()` in [test/utils/test-app.ts](test/utils/test-app.ts). It applies the same `configureApp()` pipeline as production.
  - Before they run, [test/setup/global-setup.ts](test/setup/global-setup.ts) starts a **throwaway Postgres 18 with Testcontainers**, applies the migrations to a template database, and sets the test environment. The e2e tests never touch your dev database, and they don't need `.env`.
  - **Every Jest worker gets its own copy of that database** (`CREATE DATABASE … TEMPLATE`; see [test/setup/worker-database.ts](test/setup/worker-database.ts)), so files running in parallel never see each other's data. `test/database.e2e-spec.ts` guards this.
  - **Files that write data** call `resetDatabase(dataSource)` in `beforeEach` ([test/utils/database.ts](test/utils/database.ts)), and create rows with the factories in [test/utils/factories.ts](test/utils/factories.ts) (`createMedia(dataSource, { width: null })`). Add a factory for each new entity.
  - Get a `DataSource` with `app.get(DataSource)` in tests that boot the app, or `openTestDataSource()` in tests that only use repositories.
  - **Logged-in calls:** `createUser(dataSource, { role: UserRole.Admin })` (hashed at cost 4), then `const { accessToken } = await loginAs(app, user)` and `.set(bearer(accessToken))` ([test/utils/auth.ts](test/utils/auth.ts)). A test-only controller needs `@Public()` unless it is meant to require a login.
  - **Admin app sessions:** `const { session, cookie } = await adminLoginAs(app, editor)`, then `.set(SAME_ORIGIN).set('Cookie', cookie.header)`; `adminRefreshCookie(res)` reads the cookie a response sets or deletes.
  - **Admin API calls:** `const admin = adminApi(app, accessToken)`, then `admin.get('products')`, `admin.patch(...)`; `rowsOf()`, `dataOf()` and `errorOf()` read the answers ([test/utils/admin.ts](test/utils/admin.ts)). `test/admin-users.e2e-spec.ts` checks that every admin route refuses guests and customers.
  - **Uploads:** each Jest worker stores files in its own temporary folder (`UPLOADS_DIR`, removed after the run). Suites that upload call `emptyUploads(app)` in `beforeEach`, and build images with `testImage(width, height)` ([test/utils/images.ts](test/utils/images.ts)).
  - **Email:** `createTestApp()` replaces SMTP with a `FakeMailTransport`, so no test sends real mail. Mail goes out after the response: read it with `(await mailbox(app)).sent` ([test/utils/mail.ts](test/utils/mail.ts)), which waits for it, and `clear()` it in `beforeEach` when the app is shared. Do that **before** `resetDatabase()` in suites that call forgot-password: its account lookup runs in the background, and must not overlap the truncate.
  - **Rate limits** stay at their production values in tests. Files that call the limited routes call `resetRateLimits(app)` in `beforeEach` ([test/utils/throttler.ts](test/utils/throttler.ts)).
  - `test/migrations.e2e-spec.ts` checks the migrations themselves: they apply cleanly, the schema matches the entities, and every `down()` reverts.
- The `@nestjs/swagger` CLI plugin doesn't run under Jest (`isolatedModules`), so DTO properties only appear in the docs of a real build.
- **Coverage** is reported separately for each suite (`coverage/unit/`, `coverage/e2e/`), and the two complement each other. Unit tests cover pure logic; controllers, filters and the HTTP pipeline (`app.setup.ts`) are covered by the e2e tests. Both measure the same files: the exclusions (bootstrap, CLI entry, migrations, modules, entities, DTOs) are defined once, as `coverageExclusions` in [jest.config.ts](jest.config.ts).

## Database migrations

The schema changes **only** through reviewed migration files in `src/database/migrations/`.

1. Change or add an entity (`*.entity.ts`). Column and table names become snake_case automatically.
2. `npm run migration:generate -- src/database/migrations/AddProducts`
3. Review the generated SQL, including `down()`, and commit it with the entity change.
4. `npm run migration:run`

The app never runs migrations on startup. In production they run as a separate step before the new version starts. CI fails if an entity changed without a migration, or if a `down()` doesn't revert.

## Importing the Strapi data

A one-off copy of the old Strapi site (its SQLite file and uploads folder) into this database and `UPLOADS_DIR`. It runs from `dist/` like the migration scripts, with the same `.env`:

```bash
npm run import:strapi -- --sqlite ../backend/.tmp/data.db --uploads ../backend/public/uploads --dry-run
npm run import:strapi -- --sqlite ../backend/.tmp/data.db --uploads ../backend/public/uploads
```

- **One transaction.** Everything is imported, then compared with Strapi (counts, every page's section types and order, menu items, order totals, products with images); only then are the files copied and the transaction committed. Any error leaves the database as it was.
- **`--dry-run`** does all of that and rolls back: nothing is saved or copied. Run it first.
- **It refuses a database that already has data** in the tables it fills. `--replace` empties those tables first (`TRUNCATE`, order numbers restart at 1): **never use it on a database with real orders or accounts.**
- **What it takes:** the published version of every document (drafts are ignored), all files (same `/uploads` URLs and sizes, nothing reprocessed), customers with their password hashes (logins keep working), orders (as text-only `legacyDishesText` orders, numbered by date), and contact messages.
- **What it changes on the way:** alt texts that are just the file name become empty; accounts are not marked verified (Strapi had email confirmation off); a stale `MenuListItem` dropdown field and Strapi 4 `Image` links on products are left out.
- It prints counts and warnings only, never names, emails or other values.

## The admin app

The shop's staff manage everything at `/admin`: orders, contact messages, products and categories, pages and their sections, menus, the blog, images, site settings and (admins only) accounts. It is a [react-admin](https://marmelab.com/react-admin/) app in [admin/](admin/), its own npm package, talking to the admin API (`/api/admin/*`). The API serves the built app from the same host, so the refresh cookie and the strict Content Security Policy work unchanged.

```bash
cd admin
npm ci
npm run dev            # http://localhost:5173/admin/, /api passed through to :1339
npm run build          # type-check, then bundle into admin/dist (served by the API)
npm test               # Vitest: providers, money, section helpers
npm run lint && npm run format:check
```

- **Roles.** Editors: orders, messages, products, pages, menus, blog, images, settings. Admins: also accounts, and deleting messages. The API decides (`@Roles()`); the app only hides what a role can't use.
- **Prices** are kopiykas in the API and hryvnias in the app (`189.50`), converted as text, never through floats.
- **Page sections** have a form per type, plus "Edit as JSON". The API checks every save against the type (`validateSectionData()`); errors appear next to the field.
- **HTML from staff is cleaned on save**: product descriptions and the section texts the site shows as HTML keep only safe tags and styles; an embed code must be an `<iframe>` from Google Maps, YouTube or Vimeo. Markdown fields (posts, promo texts) are rendered as markdown by the site and stay as written.
- **Orders** only move through their statuses (`new → processing → completed`, or `declined`); nothing edits or deletes them.
- **`VITE_SITE_URL`** (optional, at build time): the site's address, for "Open on the site" links on pages.

### Staff accounts

Registration only ever creates customers. Staff accounts (`admin`, `editor`) come from a command, which runs from `dist/` with the same `.env`, like the migrations:

```bash
npm run admin:create -- --email olena@example.com --name "Olena"      # an admin
npm run admin:create -- --email ivan@example.com --name "Ivan" --role editor
npm run admin:create -- --promote someone@example.com [--role editor]     # an existing account
npm run admin:create -- --help
```

- **The password is asked for twice, without being shown.** It is never taken from the command line or the environment (shell history, `ps`). Without a terminal (a script, CI), pipe it in: `... --password-stdin < password-file`.
- The same rules as registration (8 characters or more, at most 72 bytes; a free email; names may repeat). A created account's email counts as verified; `--promote` changes only the role, and refuses a blocked account.
- It prints only the outcome (`Created the admin account.`), never the email, the name or the password. Exit codes: 0 done, 1 refused or failed, 2 wrong usage.
- In the production image: `node dist/users/cli/create-admin.js ...` (no `npm`, no build).
- After that, admins change roles and block accounts in the app (Accounts). Nobody changes their own account there, and the shop always keeps one active admin.

### Sessions

`/api/admin/auth/login`, `/refresh`, `/logout`:

- Staff only: a customer gets `403 NOT_STAFF` (after the right password only), and a session whose account is no longer staff ends at its next refresh.
- **The refresh token lives in a cookie**, `sf_admin_refresh`: `HttpOnly` (page scripts can't read it), `SameSite=Strict`, `Path=/api/admin/auth` (no other route receives it), `Secure` in production. The access token is in the response body; the app keeps it in memory only, so a reload asks for a new one with the cookie. Each refresh replaces the cookie, with the same rotation and reuse detection as `/auth/refresh`; a refresh that fails deletes the cookie. Calls that hit a 401 together share one refresh.
- **Every request must come from a page on the API's own host:** the `Origin` header must match `Host` (`SameOriginGuard`), else `403 CROSS_ORIGIN_REQUEST`. Behind a proxy, keep the original `Host` (nginx: `proxy_set_header Host $host;`). The Vite dev server must not rewrite it either (no `changeOrigin`).
- The same rate limits as `/auth/login` and `/auth/refresh`, counted separately.

### The browser smoke test

[admin/scripts/smoke.mjs](admin/scripts/smoke.mjs) drives the built app in this machine's Chrome (puppeteer-core): sign-in and reload, the dashboard, an upload, editing a product (price, image), a validation error, reordering and editing page sections, adding one, reordering a menu, an order's status, a message, the settings, and an editor not seeing accounts. It checks each change through the public API and fails on any console error, CSP violation or unexpected HTTP error.

**It changes data: run it only against a throwaway copy of the database**, for example:

```bash
docker compose exec -T postgres sh -c 'createdb -U "$POSTGRES_USER" admin_check && pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB" | pg_restore -U "$POSTGRES_USER" -d admin_check --no-owner'
cp -R uploads /tmp/uploads-check
npm run build && (cd admin && npm run build)
printf '%s\n' "<a password>" | DB_NAME=admin_check node dist/users/cli/create-admin.js --email check@example.com --name Check --password-stdin
DB_NAME=admin_check UPLOADS_DIR=/tmp/uploads-check PORT=1341 node dist/main.js &
cd admin && ADMIN_URL=http://localhost:1341/admin/ ADMIN_EMAIL=check@example.com ADMIN_PASSWORD="<a password>" \
  SMOKE_THROWAWAY_DATABASE=yes npm run smoke
# then: stop the server, dropdb admin_check, rm -r /tmp/uploads-check
```

## Project structure

```text
src/
  main.ts           bootstrap: configureApp(), shutdown hooks, listen
  app.setup.ts      HTTP pipeline shared with the e2e tests: security headers, /api prefix,
                    logger, CORS, pipes, exception filter, Swagger
  app.module.ts     root module: config, database, logger, feature modules
  config/           env schema and `registerAs` namespaces (database, logger, auth, mail), Swagger setup
  common/           cross-cutting code: exception filter + error DTOs, request IDs, pipes,
                    validation error formatting, response envelope + pagination, Swagger
                    response decorators, @NoStore(), cookies, serving the admin app (http/);
                    the admin API's list query and helpers (admin/); HTML sanitizing (html/);
                    slugs (validation/); SEO input (seo/)
  database/         TypeORM CLI data source, naming strategy, SQL logger (never logs parameters),
                    entities/ (base entity, Seo), migrations/
  auth/             sessions and access control: POST /api/auth/register, /login, /refresh,
                    /logout, /change-password, /forgot-password, /reset-password,
                    /verify-email, /resend-verification; the admin app's sessions
                    (/api/admin/auth/login, /refresh, /logout: refresh token in a cookie,
                    SameOriginGuard); /api/admin/users (accounts: roles, blocking); the global
                    JwtAuthGuard and RolesGuard, @Public(), @OptionalAuth(), @Roles(),
                    @AdminController() + AdminInterceptor (no-store, audit log), @CurrentUser(),
                    AuthThrottlerGuard with @ThrottleBy()
  users/            accounts (User entity, PasswordService), single-use links sent by email
                    (AccountTokensService, the account emails): GET and PATCH /api/users/me;
                    cli/: `npm run admin:create` (staff accounts)
  orders/           POST /api/orders (guests too, priced on the server), GET /api/orders/me;
                    the order emails (templates/)
  contact/          POST /api/contact: saves the message, emails the shop (honeypot against bots)
  mail/             MailService (sends in the background, after the commit), the SMTP
                    transport, shared email template helpers (templates/)
  health/           GET /health (Terminus); healthcheck.ts (next to main.ts) is the image's probe
  dashboard/        GET /api/admin/dashboard: the admin app's start page (counts)
  strapi-import/    the one-off Strapi import (npm run import:strapi): reader (node:sqlite),
                    importer, mappers, checks
  media/            uploaded images: POST /api/media, PATCH and DELETE /api/media/:id (admins and
                    editors); MediaService (checks, processes and stores them), the storage
                    (local disk); configureApp() serves the files at /uploads
  catalog/          products and product categories: GET /api/products, /api/products/:slug,
                    /api/product-categories
  content/          site settings, navigation menus and pages with sections: GET /api/settings,
                    /api/menus/:key, /api/pages/:slug (the homepage is slug `home`)
  blog/             published blog posts and blog categories: GET /api/blog-posts,
                    /api/blog-posts/:slug, /api/blog-categories
test/
  setup/            Testcontainers global setup/teardown
  utils/            createTestApp(), resetDatabase(), factories, loginAs() + bearer(),
                    adminLoginAs() + SAME_ORIGIN + adminRefreshCookie(),
                    resetRateLimits(), FakeMailTransport + mailbox(), testImage() +
                    emptyUploads()
  *.e2e-spec.ts     e2e suites
admin/              the admin app (react-admin, its own package): src/providers (API, auth,
                    data), src/resources (one file per area), src/sections (section forms),
                    src/theme.ts (light and dark themes), src/Branding.tsx (logo, sign-in
                    page), scripts/smoke.mjs (browser smoke test)
docs/               the Strapi → API migration plan and its record
scripts/            docker-smoke.sh: the production image's smoke test; npm-audit.mjs: CI's npm audit
deploy/             production: compose.yaml, deploy.sh, disk-alert.sh, the settings templates,
                    nginx templates, README
Dockerfile          the production image (API + admin app); .dockerignore is an allow-list
```

## Conventions

- **Feature module layout:** one folder per kind of file, with the module file at the root. Only create the folders a module needs. Unit tests (`*.spec.ts`) sit next to the file they test.

  ```text
  src/<feature>/
    <feature>.module.ts
    controllers/   *.controller.ts
    services/      *.service.ts
    entities/      *.entity.ts
    dto/           *.dto.ts (responses) and *.query.dto.ts (query filters)
    mappers/       entity -> DTO functions
    filters/       exception filters used only by this module (global ones live in common/)
    guards/        *.guard.ts
    decorators/    *.decorator.ts
    types/         <feature>.types.ts (interfaces and types shared within the module)
    templates/     emails this module sends (helpers in mail/templates/)
  ```

  Keep the file suffixes (`.controller.ts`, `.dto.ts`, `.entity.ts`): the Swagger CLI plugin, the TypeORM entity pattern and the coverage exclusions find files by them.

- **Imports:** relative (`./`, `../`) within a module, and the `@/` alias (= `src/`) across modules, e.g. `import { Media } from '@/media/entities/media.entity'`. Files at the root of `src/` and everything in `test/` use `@/` (as in the frontend). The alias is set up in four places:
  - `paths` in `tsconfig.json`; `nest build` rewrites it to relative paths in `dist/`
  - `moduleNameMapper` in both Jest configs
  - `tsconfig-paths/register` in `test/setup/global-setup.ts`, which Jest loads outside its module system
- **Routes:** everything is under `/api`, except `/health`, which stays at the root for infrastructure probes, and the uploaded files at `/uploads`.
- **HTTP-level settings** (headers, CORS, pipes, filters) go in `configureApp()` in [src/app.setup.ts](src/app.setup.ts), so the e2e tests use exactly what production uses.
- **Responses** are always wrapped: `{ data }` for one resource, `{ data, meta }` for a page of a list, where `meta` is `{ page, pageSize, total, pageCount }`. Lists take `?page=&pageSize=` (default 1 and 20, maximum 100). The helpers live in [src/common/http/](src/common/http/):
  - `PaginationQueryDto`: extend it for list filters
  - `toSkipTake()` and `paginate()`: build the page
  - `@ApiPaginatedResponse(Dto)` and `@ApiDataResponse(Dto)`: document the envelope in Swagger, which can't infer generic types
- **Authentication is on by default.** The global `JwtAuthGuard` refuses every route without a valid `Authorization: Bearer <accessToken>` (401 with `WWW-Authenticate`). Mark the public ones with `@Public()` (on the controller or the method).
  - `@Roles(UserRole.Admin)` limits a route to roles (403 otherwise); `@CurrentUser()` gives the caller (`{ id, role }`, read from the token without a query).
  - **Ownership comes from the token:** a route for the caller's own data uses `@CurrentUser()`, never an id from the URL (`/users/me`, not `/users/:id`).
  - Document a protected route with `@ApiAuth()`, so Swagger shows the lock and the 401.
  - `@OptionalAuth()` serves guests and logged-in callers alike: no header means a guest, but a token that is sent must be valid (401 otherwise, so the client refreshes instead of carrying on as a guest). Read the caller with `@CurrentUser({ optional: true })`.
  - **Rate limits:** a route that checks a password, creates accounts or sends mail gets `@UseGuards(AuthThrottlerGuard)` with its own `@Throttle()`, plus `@ApiRateLimited()` for the docs. A logged-in caller is counted per account, a guest per IP; `@ThrottleBy('email')` counts a guest per IP and that body field instead (login: `email`). There is no global limit: every server-rendered page reaches the API from the Next server's single IP.
  - Responses that carry tokens or personal data get `@NoStore()` (`Cache-Control: no-store`).
  - **Cookies:** the API sets one, the admin app's refresh token. A route that acts on a cookie gets `SameOriginGuard` (a browser attaches cookies to requests other sites start; the `Origin` check refuses those). The helpers in [src/common/http/cookies.ts](src/common/http/cookies.ts) read and write it; there is no cookie-parser.
- **Entities and responses:** controllers never return entities; they map them to response DTOs (e.g. `toMediaDto()`). Primary keys are UUIDv7 from Postgres (`AppBaseEntity`).
- **Errors** always have one shape (documented as `ErrorResponseDto` in Swagger):

  ```json
  {
    "error": {
      "status": 400,
      "code": "BAD_REQUEST",
      "message": "Validation failed",
      "requestId": "6ed2444b-8405-40b9-affa-d1db395c4c83",
      "details": [{ "field": "email", "messages": ["email must be an email"] }]
    }
  }
  ```

  Unexpected errors return a generic `500` message; the real cause is only logged.

- **Validation:** request DTOs use `class-validator`. Unknown properties are rejected, there's no implicit type conversion, and strings are trimmed (except fields whose name contains `password`).
- **Request IDs:** every response has an `X-Request-Id` header, and every log line of that request has the same `reqId`. A safe incoming `X-Request-Id` is reused.
- **Sending email:**
  - always through `MailService` (`send()`, or `defer()` for background work that may send), never a transport directly
  - **after the transaction commits**, so nothing is announced that was rolled back; issue any token for a link _inside_ the transaction
  - each module keeps its emails in its own `templates/` folder, built with the helpers in [src/mail/templates/format.ts](src/mail/templates/format.ts)
  - **escape everything a user typed** (`escapeHtml()`), and **never put user input in a subject** (header injection, spoofed subjects)
  - links carry tokens in the fragment (`#token=…`), built with `accountLink()`, so they stay out of server logs and `Referer` headers
  - never log a recipient, a subject or a body: `MailService` logs only a label (`Mail "order-customer" sent`) and SMTP error codes
- **Uploaded images** go through `MediaService`, which every writer uses (the upload route, the data import, the admin app):
  - **the type comes from the file's first bytes**, never its name or claimed type: JPEG, PNG and WebP only (no SVG: it can carry scripts)
  - every image is **re-encoded without its metadata** (phone photos carry their GPS position), turned upright and capped at 2560 px; `large`/`medium`/`small`/`thumbnail` copies as Strapi made them
  - stored under random names (`<22 characters>.jpg`, `small_<same>.jpg`) and served at `/uploads` with a one-year immutable cache and `Cross-Origin-Resource-Policy: cross-origin` (without it, browsers refuse to show the images on the site)
  - URLs stay relative (`/uploads/…`); the frontend adds its API address
- **Admin API** (`/api/admin/*`): each domain module has its own `admin-*.controller.ts` and `admin-*.service.ts`, under `@AdminController(path)` (staff only, `admin` docs tag, `Cache-Control: no-store`, an `Admin action` audit line per write with the account id, route pattern and record id, never values).
  - **Lists** take `page`, `pageSize`, `sort` (an allow-list that always includes `id`), `order`, `q` and `id` (repeatable), plus their own filters: extend `AdminListQueryDto`, order with `adminOrder()`, search with `contains()` (wildcards escaped).
  - **Records are flat** for the app: references as ids (`imageId`, `categoryIds`), with read-only objects next to them for display (`image`).
  - **Updates** take a `PartialType(CreateDto, { skipNullProperties: false })`: only the fields sent change, `null` clears optional ones and is refused for required ones. A mapped type also matters because an instance of a class with declared fields carries every field, as `undefined`.
  - **Errors name the field** (`details`), which the app shows next to the input: a taken slug is a 409 on `slug` (`uniqueViolation()`), an unknown reference a 400 on its field (`loadReferences()`).
- **HTML from staff** goes through [src/common/html/sanitize.ts](src/common/html/sanitize.ts) before it is saved: `sanitizeRichHtml()` for text the site renders as HTML, `sanitizeEmbed()` for embed codes. Extend the allow-lists there, never bypass them.
- **Logging:** use `new Logger(MyClass.name)` from `@nestjs/common`; it goes through pino automatically. The `Authorization`, `Cookie` and `Set-Cookie` headers are redacted, and SQL is logged without its parameters (they can hold emails and password hashes). Never log request bodies, tokens or hashes.

## Production image

The [Dockerfile](Dockerfile) builds one image with the API and the admin app. It runs on `node:24-alpine` as the user `node`, with plain `node dist/main.js` (no npm in the image).

```bash
docker build -t simplefood-api .
scripts/docker-smoke.sh simplefood-api     # starts it next to a throwaway Postgres and checks it
```

- **Settings** come from the environment, like `.env` locally (see [Configuration](#configuration)); no `.env` file is ever in the image. Set in the image: `NODE_ENV=production`, `PORT=1339`, `UPLOADS_DIR=/app/uploads`, `ADMIN_DIST_DIR=/app/admin/dist`. Mount a volume at `/app/uploads`, or uploads are lost with the container.
- **Run it with `--init`** (Compose: `init: true`), so `docker stop` ends it in about a second.
- **Health:** the image's `HEALTHCHECK` runs `node dist/healthcheck.js` (GET `/health`: the API and its database).
- **The admin app** is built for `https://simplefood.kozyr.info` (its "Open on the site" links). Another site: `--build-arg VITE_SITE_URL=…`.
- **One-off commands** run in a container from the same image, with the same environment:

  | Command                                                                          | What it does                                          |
  | -------------------------------------------------------------------------------- | ----------------------------------------------------- |
  | `node node_modules/typeorm/cli.js migration:run -d dist/database/data-source.js` | Apply migrations                                      |
  | `node dist/users/cli/create-admin.js --email <email> --name <name>`              | Create a staff account (`-it`: asks for the password) |
  | `node dist/strapi-import/import-strapi.js --sqlite <file> --uploads <dir>`       | The Strapi import (mount both)                        |

- **Architecture:** CI builds `linux/amd64`, the VPS's. A Mac with Apple silicon builds `arm64` unless told `--platform linux/amd64`.
- **What [scripts/docker-smoke.sh](scripts/docker-smoke.sh) checks:**
  - **The image:** it runs as `node`, holds no sources, `.env`, dev tools or npm, and the app can't change its own code.
  - **Config:** bad config stops it, and the error names the problem without printing the secret.
  - **Running it:** migrations run; it turns healthy; `/health`, `/api/products`, a 404's error shape and `/admin/` answer; Swagger is off.
  - **Native modules:** a staff account and login (bcrypt), an image upload served from `/uploads` (sharp).
  - **Logs and failure:** logs are JSON; the probe fails without the database; `docker stop` is quick.

## CI

[.github/workflows/ci.yml](.github/workflows/ci.yml) runs on pull requests and pushes to `main`:

- **API:** format check → typecheck → lint → build → unit tests → e2e tests (Testcontainers) → `npm audit` of production dependencies.
- **Admin app** (`admin/`): format check → lint → typecheck and build → unit tests (Vitest) → `npm audit`. The browser smoke test runs by hand (it needs Chrome and a throwaway database).
- **The audits** fail on high and critical advisories. [scripts/npm-audit.mjs](scripts/npm-audit.mjs) runs `npm audit` and lists the few advisories reviewed as harmless here (npm can't ignore one), each with the reason; it says when an entry can go.
- **Image:** builds the production image for `linux/amd64` and runs `scripts/docker-smoke.sh` on it.
- **Publish** (pushes to `main` only, once the API, admin and image jobs pass): pushes the image to GHCR as `ghcr.io/<owner>/simplefood-api:<full commit SHA>`.
- **Deploy** (after publish, when the repository variable `DEPLOY_ENABLED` is `true`): runs `deploy/deploy.sh` on the VPS over SSH. See [deploy/README.md](deploy/README.md).

A newer push cancels a pull request's running CI, but on `main` it waits, so a deploy is never cut off halfway.

[.github/workflows/uptime.yml](.github/workflows/uptime.yml) checks production from outside every 15 minutes (see [deploy/README.md](deploy/README.md#monitoring)).

Dependabot opens weekly update PRs for npm packages, GitHub Actions, the Node base image and the production Postgres image (patch and minor).

## Deployment

Production runs on one VPS with Docker Compose: [deploy/compose.yaml](deploy/compose.yaml) (Postgres and the API, the API on `127.0.0.1:1339` behind nginx) and [deploy/deploy.sh](deploy/deploy.sh). The script pulls an image, runs the migrations, replaces the API and waits until it's healthy; if it isn't, the previous image runs again. [deploy/README.md](deploy/README.md) covers the one-time setup, the GitHub secrets and the everyday commands.

## License

Private project; all rights reserved (`UNLICENSED`).
