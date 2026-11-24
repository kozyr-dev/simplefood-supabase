# SimpleFood: NestJS API + VPS → Supabase + Vercel

## Context

Production since 2026-11-18 (see [api/docs/backend-migration-plan.md](../api/docs/backend-migration-plan.md), phase 9):

- **Site:** `frontend/`, Next 16.2 / React 19, Feature-Sliced Design, react-query, zustand, formik/yup. It runs under pm2 on the VPS.
- **API:** `api/`, NestJS 12, TypeORM 1 and Postgres 18, in Docker Compose on the same 1-vCPU VPS behind nginx (HestiaCP).
- **Admin:** `api/admin/`, react-admin 5.15 on MUI 9, served by the API at `/admin`.
- **Data:** 41 products, 14 categories, 9 pages, 2 blog posts, a few orders and users, and 221 media files (8 MB).

**The goal** is to keep the site and the admin, and replace the API and the VPS:

- **Supabase** provides Postgres, Auth, Storage and one Edge Function.
- **Vercel** hosts the site and the admin.

**This folder is a separate copy (user, 2026-11-20).** The original Nest/Next project keeps running and is never changed by this work. That covers:

- the live site and API (`simplefood.kozyr.info`, `api-simplefood.kozyr.info`), the VPS, and its database and files
- the local instances and their Docker volumes
- everything outside this folder

The Supabase version gets its own free Vercel domain (`<name>.vercel.app`, maybe a custom one later). There is **no cutover**. Imported customers keep their passwords, because the import copies their hashes.

### Isolation rules (apply to every phase)

- **I1 No connections to the original.** Never connect to the production or local Nest databases, the VPS, or the original GitHub repos. Data comes only from a dump file the user puts in `scripts/import/data/` (git-ignored), and from the copied `api/uploads/`.
- **I2 Never run `docker compose` in `api/`.** Its `name: simplefood` is the original's Compose project, so it would reuse the original's containers and its Postgres volume. The local Supabase stack uses its own `project_id`.
- **I3 New credentials everywhere:** a new Supabase project, a new Turnstile widget, new Vercel projects, and Mailgun credentials of its own. Nothing is copied from `api/.env`, `frontend/.env` or `info/`.
- **I4 No DNS changes** to `kozyr.info` unless the user decides on a custom domain later.
- **I5 Nested repos:** `api/.git` and `frontend/.git` have one `init` commit each and no remotes. They're removed, and the copy becomes one new repo. The originals keep their own history.

**What goes away:**

- **Auth code:** `auth/*`, `users/*` (passwords, account tokens), refresh tokens and the session route handlers.
- **Infrastructure and cross-cutting code:** media processing, mail transport, Swagger, logging, health checks, Docker, nginx, `deploy/` and the VPS itself.

**What gets rebuilt, in SQL:**

- **RLS:** the policies that replace the guards and roles.
- **Database functions (RPCs):** order pricing (`priceOrder`) and the page resolver.
- **Triggers:** status transitions (`canTransition`) and timestamps.
- **JSON-schema checks:** section data (`validateSectionData`).

From now on **RLS is the only security boundary**. Every policy gets a pgTAP test before go-live.

## Working mode

Same as the Nest plan (S3):

- **The user writes the code.** Claude guides each phase: what to build and why, the Supabase and Postgres concepts involved, and reference snippets when asked. Claude also reviews and debugs.
- **Claude does not implement phases** unless the user explicitly asks.
- **Tracking:** tick off phases in this file (`docs/supabase-migration-plan.md`). Record any deviations under the phase.
- **Baseline for every phase:**
  - strict TypeScript, lint and Prettier
  - migrations only (`supabase/migrations`), never edits in Studio that aren't captured in a migration
  - generated DB types
  - tests in CI

## Target architecture

```text
simplefood/                     one git repo (new), GitHub
  supabase/
    config.toml                 local stack, auth settings, hook, buckets
    migrations/                 the schema, RLS, functions, triggers (SQL)
    tests/                      pgTAP: RLS and RPC tests (`supabase test db`)
    functions/admin-users/      Edge Function (Deno): block / unblock accounts
    seed.sql                    local dev data
  frontend/                     Next 16 site → Vercel project #1
  admin/                        react-admin (moved from api/admin) → Vercel project #2 (static)
  scripts/import/               one-off data import: Nest Postgres → Supabase
  api/                          read-only reference while porting (never run: I2)
```

**Who talks to what:**

- **Browser to Supabase**, with the publishable key and the user's session:
  - public reads (catalog, blog, menus, settings, `get_page`)
  - auth calls (sign-in, sign-up, reset)
  - "my profile" and "my orders"
  - every admin read and write (react-admin over PostgREST)
- **Browser to Next route handlers**, for the two writes that need trust and rate limits: `POST /api/orders` and `POST /api/contact`.
  - The handlers use the **secret key** and call `place_order` / `submit_contact`, which only `service_role` may execute.
  - They also send the emails through Mailgun.
- **Next server components to Supabase** through `@supabase/ssr` (cookies). `proxy.ts` refreshes the session with `getClaims()`.
- **Admin to Edge Function `admin-users`**, for blocking and unblocking accounts (needs the Auth admin API).
- **Supabase Auth to Mailgun SMTP**, for signup confirmation, password reset and email change.

**Regions:** Supabase `eu-central-1` (Frankfurt) and Vercel functions in `fra1`.

## Decisions

### Confirmed by the user (2026-11-20)

- **S1 Admin:** keep react-admin and switch it to the **`ra-supabase-core`** 4.x data and auth providers.
  - Use the core package only. `ra-supabase-ui-materialui` 4.0.0 peers on MUI ≤ 7, and the admin is on MUI 9; the admin already has its own `LoginPage`.
  - The admin is deployed as a static site.
- **S2 Hosting:** Vercel Hobby and Supabase Free. A daily keep-alive stops the Free project being paused.
- **S3 Working mode:** the user writes the code; Claude guides.

### Proposed by Claude, confirmed by the user (2026-11-20)

- **S4 One repo** with the layout above.
  - `api/admin` moves to `admin/` with its history (or a plain copy, since the new repo starts fresh).
  - `api/` stays in the repo, untouched, while porting, so its SQL and logic can be ported side by side.
- **S5 Naming.** The database stays snake_case, and the generated `Database` types are snake_case.
  - **Site:** each `entities/*/api/api.ts` maps rows to the existing camelCase types (`Product`, `Page`, …), so widgets and UI don't change.
  - **Admin:** it uses snake_case `source`s directly, a find-and-replace in `resources/*.tsx`.
- **S6 Trusted writes through route handlers** (`frontend/app/api/orders/route.ts`, `…/contact/route.ts`). Each handler does five things in turn:
  1. Checks the Turnstile token.
  2. Applies the rate limit.
  3. Validates with the existing yup fields (`src/shared/lib/validation.ts`).
  4. Calls the RPC as `service_role`, with the user id taken from `getClaims()` (or `null` for a guest).
  5. Sends the emails with `after()` from `next/server`.

  `place_order` and `submit_contact` are revoked from `anon` and `authenticated`, so the rate limits can't be bypassed through PostgREST.
- **S7 Same error shape for the site.** The handlers keep the API's `{error: {status, code, message, details?}}`.
  - `place_order` raises `PRODUCTS_UNAVAILABLE` with the bad lines as JSON in `detail`.
  - The handler maps it to 409, so the checkout code and `shared/api/errors.ts` stay as they are.
- **S8 Auth configuration:**
  - email and password, **Confirm email on**, minimum password length 8
  - **JWT expiry 900 s**, the same 15 min as today
  - **refresh-token reuse detection on** (Supabase default)
  - **secure email change** (both addresses confirm)
  - **secure password change** (reauthentication)
  - **Turnstile CAPTCHA** on sign-up, sign-in and reset
  - **PKCE email links**: templates link to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=…`, and a route handler calls `verifyOtp` and redirects. No supabase.co links appear in emails.
- **S9 Roles:**
  - The `profiles.role` enum (`customer | editor | admin`) is copied into the JWT as `user_role` by a **Custom Access Token hook**.
  - The SQL helpers `has_role()` and `is_staff()` read `auth.jwt() ->> 'user_role'`.
  - Only admins can change a role (RLS plus column grants); the change takes effect at the user's next token refresh (≤ 15 min).
  - **Blocking** = an Auth ban (`ban_duration`) through the Edge Function. A banned user can't refresh, and their current access token expires within 15 min, as today.
- **S10 Media:**
  - **Bucket:** a public Storage bucket `media`. `file_size_limit` is 10 MB; `allowed_mime_types` are JPEG, PNG and WebP, so SVG is refused.
  - **Before upload:** the admin resizes to ≤ 2560 px and re-encodes in the browser, which strips EXIF and fixes orientation.
  - **The `media` table** keeps the metadata. `url` becomes `path` (the object key), `formats` is dropped, and `next/image` makes the sizes. Storage image transforms are Pro-only.
  - **Writes:** RLS on `storage.objects` lets only staff write to `media`.
- **S11 HTML** from staff is **sanitized when it's displayed**, not when it's saved. The allow-list from `api/src/common/html/sanitize.ts` (with `EMBED_HOSTS`) is ported to `frontend/src/shared/lib/sanitize.ts`. The entity mappers call it for:
  - product descriptions
  - the HTML section fields
- **S12 Section data:**
  - **Database check:** `page_section.data` gets a `pg_jsonschema` CHECK. A single function, `section_data_schema(type)`, returns one schema per type, ported from `api/src/content/entities/section-data.ts`.
  - **Admin:** the forms keep their own validation.
  - **References:** they stay ids in jsonb, resolved in `get_page`.
- **S13 Blog excerpts:**
  - A new `blog_post.excerpt` column.
  - The admin computes it on save with `toExcerpt()`, ported from `api/src/blog/mappers/markdown-excerpt.ts`; the import fills it for existing posts.
  - Lists select `excerpt`, never `text`.
- **S14 Ids:**
  - **Existing uuids** are kept on import.
  - **New rows** default to `gen_random_uuid()`. The local stack runs PostgreSQL 17.12 (checked 2026-11-24), which has no `uuidv7()`. Imported v7 ids are ordinary uuids and keep their values. Lists order by `created_at, id`, so nothing depends on v7's time order.
  - **Users:** keep their ids, via `auth.admin.createUser({ id, … })`. Supabase documents UUID v4 for auth ids and ours are v7: if that's refused, let Auth assign ids and remap `customer_order.user_id` in the import.
- **S15 Emails:** Mailgun for everything, finishing the open Nest step 9.4: the sending subdomain, SPF/DKIM, and tracking off (C4).
  - **Auth emails:** Supabase custom SMTP (`smtp.eu.mailgun.org:587` or `smtp.mailgun.org:587`).
  - **Order and contact emails:** the Mailgun HTTP API from the route handlers, using the templates ported from `api/src/orders/templates/order-emails.ts`, `contact/templates/contact-emails.ts` and `mail/templates/format.ts`.
  - **Language:** auth templates in Ukrainian.
- **S16 Rate limits** live in Postgres: a table `private.rate_limit` and a function `hit_rate_limit(key, max, window)`, executable by `service_role` only. They keep today's numbers:
  - orders: 10/hour per account (guests per IP)
  - contact: 5/hour per IP + email

  Auth limits use Supabase's built-in settings and CAPTCHA.
- **S17 No cutover** (user, 2026-11-20). Phase 9 is a deploy to a new Vercel domain. The original stays live, and the two never share data after the one-time import.
- **S15 addendum (open, decide in phase 2):** a `vercel.app` domain can't carry Mailgun DNS records. The options are:
  - Mailgun's **sandbox** domain, which only reaches up to 5 authorized recipients (fine for a demo, but strangers can't confirm sign-ups)
  - a new sending subdomain on a domain the user controls (a DNS change: needs the user's go-ahead, per I4)

All S1–S17 decisions were confirmed by the user on 2026-11-20.

## What was checked (2026-11-20)

- **Supabase docs (Context7, `/supabase/supabase`):**
  - `@supabase/ssr` with Next 16: `proxy.ts` plus `getClaims()`, cookie `setAll` with cache headers, and publishable keys (`sb_publishable_…`).
  - The Custom Access Token hook and the RBAC `authorize()` pattern.
  - `auth.admin.createUser` with `password_hash` (bcrypt and Argon2) and a custom `id` (documented as UUID v4).
  - `pg_jsonschema` (`jsonb_matches_schema` in a CHECK).
  - Free plan: pauses after 7 days of low activity, 500 MB database, 1 GB storage, 5 GB egress; image transforms are Pro-only.
- **npm (2026-11-20):**
  - `@supabase/supabase-js` 2.119.2 and `@supabase/ssr` 0.12.7.
  - `ra-supabase` 4.0.0: `ra-supabase-core` peers on `ra-core ^5.8.0` (OK with 5.15); `ra-supabase-ui-materialui` peers on MUI `≤ 7` (not OK with MUI 9, hence S1).
- **Not verified yet** (check at the phase that needs it):
  - which Postgres version new Supabase projects get (S14)
  - whether Auth accepts v7 user ids (S14)
  - the exact names of the "secure password change" and security-notification email settings (S8)
  - Vercel Hobby limits: cron frequency, the function region setting and image-optimization quota (S2, S10)
  - the `ra-supabase-core` provider options and how it handles views and RPCs (phase 8)

## Data model changes (vs. `api/src/database/migrations`)

Port every table, enum, check and index as SQL. Changes:

| Today | Supabase |
| --- | --- |
| `app_user` (`password_hash`, `email`, `blocked`, `email_verified_at`) | `auth.users` holds the email, password and confirmation. `public.profiles`: `id` → `auth.users(id)` on delete cascade, `name` (2–100), `phone`, `address` (≤ 500), `role`, `email` (a copy kept in sync by a trigger on `auth.users`, for the admin lists), timestamps |
| `refresh_token`, `account_token` | dropped (Auth) |
| `customer_order.user_id` → `app_user` | → `profiles(id)` on delete set null |
| `media.url`, `media.formats` | `media.path` (Storage key), no `formats` |
| `blog_post` | + `excerpt` (S13) |
| `page_section.data` CHECK `jsonb_typeof = 'object'` | + `jsonb_matches_schema(section_data_schema(type), data)` (S12) |
| `citext` extension | still needed only if a table keeps a citext column; `profiles.email` can be plain `text`, since Auth owns uniqueness |
| `updated_at` set by TypeORM | a `moddatetime` (or hand-written) trigger on every table |
| HTML with `src="/uploads/…"` | rewritten by the import to the Storage public URL |
| — | `private.rate_limit` (S16), optionally `audit_log` (phase 4) |

## Access matrix (RLS)

✓ = allowed, — = denied. "Own" = `user_id = auth.uid()` / `id = auth.uid()`. Staff = editor or admin.

| Table | anon | customer | editor | admin |
| --- | --- | --- | --- | --- |
| `site_settings`, `menu`, `menu_item`, `product_category`, `blog_category`, `media` | read | read | read, write | read, write |
| `product` | read (available) | read (available) | all | all |
| `page`, `page_section`, `blog_post` | read (`published_at <= now()`) | same | all | all |
| `profiles` | — | read own; update own `name`, `phone`, `address` (column grants) | read all | read all; update `role` |
| `customer_order`, `order_item` | — (insert only via `place_order`) | read own | read; update `status` only (column grant + trigger) | same |
| `contact_submission` | — (insert only via `submit_contact`) | — | read; update `handled_at` | same, plus delete |
| `storage.objects` in `media` | read (public bucket) | read | write | write |

These are the editor and admin rights of Nest decision D6, unchanged.

## Phases

### 0. Setup

1. **Clean up the copy (I2, I5):**
   - Delete `api/.git` and `frontend/.git`.
   - Delete `frontend/.github/` (it deploys to the VPS over SSH) and `api/.github/` (it would run CI, deploy and uptime pings for the original if it ever ended up at the root).
   - Leave `api/docker-compose.yml` alone, and never run it (I2).
2. **Move the admin:** `api/admin` → `admin/`. Drop its `node_modules/` and `dist/`, then `npm ci` in `admin/`.
3. **Root files:**
   - `.gitignore`: `node_modules/`, `.env*` (except `.env.example`), `info/`, `api/uploads/`, `scripts/import/data/`, `coverage/`, `dist/`, `.next/`, `.DS_Store`, `supabase/.temp/`, `supabase/.branches/`. `info/` holds passwords.
   - `.nvmrc` (24).
   - `package.json` (private): `supabase` pinned as a dev dependency (3.2.0 on 2026-11-20), so the CLI is the same locally and in CI. Scripts: `db:start`, `db:stop`, `db:reset`, `db:test` and `db:types` (added in phase 1).
4. **Local Supabase stack:**
   - `npx supabase init`, then set `project_id = "simplefood-supabase"` in `supabase/config.toml`. Its containers are named after it, so they can't collide with the original's `simplefood` Compose project.
   - Start Docker Desktop, then `npm run db:start`. Studio is at `:54323`; the API, database and mail ports are printed.
   - Run `select version();` in Studio's SQL editor and record the result here (S14). **Result (2026-11-24):** PostgreSQL 17.12 locally, so new rows use `gen_random_uuid()`. Check that the remote project's version (dashboard → Database settings) is also 17.
5. **A first pgTAP test,** so `supabase test db` has something to run: `supabase/tests/database/000_smoke.test.sql` (`plan(1)`, `has_schema('public')`, `finish()`).
6. **Git:**
   - `git init -b main` at the root.
   - Check `git status --ignored`: `info/`, the `.env` files and `api/uploads/` must be ignored before the first `git add`.
   - Commit.
7. **GitHub:** a **new** private repo (I3), then push.
8. **CI** (`.github/workflows/ci.yml`), three jobs:
   - `db`: `npm ci` at the root, `npx supabase db start`, `npx supabase test db`
   - `frontend`: lint, typecheck, Jest
   - `admin`: lint, typecheck, Vitest

   The generated-types check comes in phase 1.
9. **Remote project:**
   - In the Supabase dashboard, create a new project: Free plan, region `eu-central-1`. Keep the database password in a password manager, not in `info/`.
   - `npx supabase login`, then `npx supabase link --project-ref <ref>`. Nothing is pushed yet.
10. **Done when:**
    - the local stack starts, and `npm run db:test` passes
    - the repo has no nested `.git` and no secrets
    - CI is green on GitHub
    - the remote project is linked

### 1. Schema

1. Port the migrations, one Supabase migration per domain:
   - media, catalog, settings and menus, blog, pages and sections, orders, contact
   - the same names, checks, enums and indexes as the TypeORM migrations, with the changes listed under "Data model changes"
2. `profiles`, plus two triggers on `auth.users`:
   - `handle_new_user` (insert a profile, `name` from `raw_user_meta_data`)
   - an email-sync trigger
3. `updated_at` triggers.
4. `section_data_schema(type)` and the CHECK on `page_section.data`. Port every rule from `section-data.ts`:
   - patterns: `ANCHOR_ID`, `CLASS_NAMES`, `HEX_COLOR`
   - conditional requirements (`source = category` needs `categoryId`)
   - `maxLength` values
   - https-only video URLs
5. `seed.sql`: a small set of local dev data (settings, the three menus, a few products, the `home` page).
6. Generate types into `frontend/src/shared/api/database.types.ts` and `admin/src/database.types.ts`.
7. **Done when:** `supabase db reset` runs clean, and the pgTAP schema tests cover the checks (bad section data, a delivery order without an address, a mismatched `line_total`).

### 2. Auth

1. The `custom_access_token_hook` (reads `profiles.role`), granted to `supabase_auth_admin` only, and enabled in `config.toml` and the dashboard.
2. Helpers: `has_role(app_role)` and `is_staff()` (`stable`, `security definer`, `set search_path = ''`).
3. Settings from S8, in both `config.toml` and the dashboard:
   - **Site URL** and **redirect URLs:** localhost, the Vercel preview pattern and production.
   - **Custom SMTP** (Mailgun, S15).
   - **Turnstile:** site key on the site, secret in Supabase.
4. Email templates in Ukrainian (confirm signup, reset password, change email), each linking to `/auth/confirm` (PKCE).
5. **Done when:** locally (Mailpit/Inbucket), sign-up → confirm link → sign-in works, the JWT carries `user_role`, and reset password works.

### 3. RLS and its tests

1. Enable RLS on every `public` table; there are no tables without policies.
2. Write the policies from the access matrix, one migration per domain.
3. Column grants:
   - `profiles` (own: `name`, `phone`, `address`; admin: `role`)
   - `customer_order` (staff: `status`)
   - `contact_submission` (staff: `handled_at`)
4. Storage: create the `media` bucket (S10) and its `storage.objects` policies.
5. pgTAP tests in `supabase/tests/rls/*.sql`. Each test sets `role` and `request.jwt.claims` for anon, customer A, customer B, editor and admin, then asserts reads and writes. Include:
   - **Orders:** A can't see B's orders; anon sees no orders.
   - **Profiles:** a customer can't change their own `role`.
   - **Publishing:** drafts and scheduled pages and posts are invisible to anon.
   - **Media:** an editor can upload, a customer can't.
6. **Done when:** every row of the matrix has at least one allowing and one denying test.

### 4. Business logic in SQL

1. **`get_page(slug text) returns jsonb`** (`stable`, `security invoker`, so RLS applies). It returns the page with its SEO and its sections in position order, references resolved in one query each:
   - media objects
   - products: available only; `selected` keeps the editor's order (`unnest … with ordinality`); `category`, `featured` and `favorite` sources resolved too
   - blog category

   A deleted reference becomes `null` or drops out of its list, like `section-references.service.ts`. An unknown or unpublished slug returns `null`, and the site's 404 path stays.
2. **`place_order(p_user_id uuid, p_items jsonb, p_contact jsonb) returns jsonb`** (`security definer`, `service_role` only). A port of `api/src/orders/services/pricing.ts` and `orders.service.ts`:
   - 1–50 lines, quantity 1–99, unique product ids
   - prices and titles from `product`
   - every unavailable line collected into one `PRODUCTS_UNAVAILABLE` error
   - insert the order and its items in the same transaction
   - return `{id, number, subtotal}`
3. **`customer_order` status trigger:** `BEFORE UPDATE OF status`, enforcing `ORDER_TRANSITIONS` from `order-status.ts`. Two concurrent changes: the second sees the new `OLD.status` and fails.
4. **`submit_contact(p_name, p_email, p_message)`** (`service_role` only).
5. **`hit_rate_limit(key, max, window) returns boolean`** (S16).
6. **Reordering:** `reorder_page_sections(page_id, ids uuid[])`, `reorder_menu_items(menu_id, ids uuid[])` and `reorder_product_categories(ids uuid[])`. Staff only, in one transaction (D9).
7. **Categories:** `set_product_categories(product_id, ids)` and `set_blog_post_categories(post_id, ids)` for the admin, plus read views `admin_product` and `admin_blog_post` with `category_ids uuid[]` (`security_invoker = on`).
8. **Optional:** an `audit_log` table filled by an `AFTER INSERT/UPDATE/DELETE` trigger on the admin-written tables (actor `auth.uid()`, table, record id, operation; never the row). This replaces D11's log lines.
9. **Done when:** pgTAP covers:
   - a tampered or unknown product → `PRODUCTS_UNAVAILABLE` with the right positions
   - totals computed on the server
   - every allowed and refused status transition
   - `get_page` for each of the 10 section types, including deleted references
   - anon can't execute `place_order`

### 5. Media and emails

1. **Storage URL helper.** `frontend/src/shared/utils/helpers/media.ts` builds the public URL (`…/storage/v1/object/public/media/<path>`) and drops `formats`.
   - `next.config.ts`: `remotePatterns` for `<project-ref>.supabase.co/storage/v1/object/public/**`.
   - Remove `output: "standalone"` (Vercel builds it itself) and the `API_URL` env.
2. **Mail module.** `frontend/src/server/mail/`: the Mailgun HTTP client, plus the order, contact and format templates ported from the API. It never logs addresses or bodies.
3. **Done when:** a test upload from a script lands in the bucket and shows through `next/image`, and an order email arrives in Mailgun's logs (sandbox or subdomain).

### 6. Data import (`scripts/import/`, Node + `pg` + `@supabase/supabase-js`)

1. **Source (I1):** a `pg_dump --data-only` file that the user makes and places in `scripts/import/data/` (git-ignored), plus the copied `api/uploads/`. The script reads only those files and never opens a connection to a Nest database.
2. **Users:** for each `app_user`, call `auth.admin.createUser` with:
   - `id` (S14)
   - `email`
   - `password_hash` (Strapi `$2a$` and Nest bcrypt hashes)
   - `email_confirm: true` for everyone (they're existing customers; with Confirm email on, an unconfirmed user couldn't sign in)
   - `user_metadata.name`

   Then upsert `profiles` (`role`, `phone`, `address`). Blocked users are banned.
3. **Content and orders:** copy table by table in dependency order, keeping ids. Then:
   - rewrite `src="/uploads/…"` in HTML fields to the public URL
   - fill `blog_post.excerpt`
   - set the identity sequence of `customer_order.number` past the highest number
4. **Media:** upload the 221 files from `uploads/` (originals only; `formats` copies are skipped) and set `media.path`.
5. **Mode:** `--dry-run`, `--replace`, and counts checked against the source before it reports success, as in `api/src/strapi-import`.
6. **Done when:**
   - a run against the local stack matches every count
   - every product has an image
   - every page's section order matches the source
   - an imported customer signs in with their old password

### 7. Site (`frontend/`)

1. **Upgrade Next** 16.2 → the current 16.x (carried-over audit item).
2. **Supabase clients:**
   - `src/shared/supabase/{client,server}.ts` (browser and server clients from `@supabase/ssr`)
   - `proxy.ts` at the root (session refresh with `getClaims()`, cache headers copied)
3. **Data layer:** rewrite each `entities/*/api/api.ts` to supabase-js queries and RPCs, with row → type mappers. The call sites:
   - `Settings`, `Menu`, `Page`, `Blog`, `User`, `Order` in `entities/`
   - `features/Auth/api/api.ts`, `features/Form/sendContactForm/api/api.ts` and `features/Order/placeOrder/api/api.ts`
   - the forgot-password call in `ModalResetPassword.tsx`

   Entity types become aliases or mappers of `Database` rows instead of `schema.ts` (delete it and the `api:types` script).
4. **Session:**
   - **Delete:** `app/api/auth/*` and `src/shared/session/{refresh,authFetch}.ts`.
   - **Rework** `src/app/SessionBootstrap`: `onAuthStateChange` fills the zustand store with the profile.
   - **Account forms:**
     - sign-in and sign-up call supabase-js with `captchaToken`
     - change password and email use `updateUser` (S8)
     - verify-email and reset-password use the `/auth/confirm` route handler and the existing pages
5. **Route handlers:** `app/api/orders/route.ts` and `app/api/contact/route.ts` (S6, S7), each with a Jest test. Mock Supabase and Mailgun; cover the 409 mapping, the rate limit and the guest vs. signed-in user id.
6. **Sanitizing:** `src/shared/lib/sanitize.ts` (S11), called in the `Product` and `Page` mappers. The render sites are `ContentBlock`, `ProductCard`, `VideoWidget`, `ContactUs` and `ImageBanner`.
7. **Keep-alive:** `app/api/keep-alive/route.ts` (protected by `CRON_SECRET`, one cheap select) and a daily cron in `vercel.json` (S2).
8. **Done when:**
   - Jest is green and the old client and session tests are replaced
   - a browser run against the local stack passes: homepage, all 9 pages, a news post, register → confirm → login, profile update, password reset, checkout as guest and customer (409 per line), my orders, the contact form

### 8. Admin (`admin/`)

1. Add `ra-supabase-core` 4.x and `@supabase/supabase-js`. Then:
   - **Providers:** replace `providers/{http,dataProvider,authProvider}.ts` with `supabaseDataProvider` and `supabaseAuthProvider`.
   - **Roles:** `canAccess` reads the JWT's `user_role`, to hide UI only.
   - **Login:** keep the custom `LoginPage`.
2. **Resources:**
   - switch to the table and view names and to snake_case sources
   - lifecycle callbacks (`withLifecycleCallbacks`) for the steps the data provider can't do:
     - categories via `set_*_categories`
     - reordering via `reorder_*`
     - the excerpt on blog save
     - order status as a plain `update` (the trigger refuses bad moves; show its message)
3. **Media:** a browser resize and re-encode (canvas or `browser-image-compression`), then `storage.from('media').upload`, then the row insert. Deleting removes the object, then the row.
4. **Users:** a list from `profiles`; role edits for admins; block and unblock through `supabase.functions.invoke('admin-users')`. The Edge Function checks the caller's `user_role = admin` before calling `auth.admin.updateUserById(id, { ban_duration })`.
5. **Dashboard:** new orders and unhandled messages through `getList` counts.
6. **Done when:**
   - Vitest is green for `money`, `sections` and the new callbacks
   - as an editor: edit a product image, reorder menu items, edit a page section, and see the result on the site
   - as an editor, the users screen is hidden and the API refuses it

### 9. Deploy (new domain, no cutover: S17)

1. **Vercel projects** (new, I3):
   - `simplefood-supabase` (root `frontend/`, region `fra1`), giving `<name>.vercel.app`
   - `simplefood-supabase-admin` (root `admin/`, static Vite build)

   Env vars:
   - `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SECRET_KEY` (server only)
   - `MAILGUN_*`, `TURNSTILE_SECRET` and `CRON_SECRET`
2. **Remote setup:**
   - `supabase db push`
   - `supabase functions deploy admin-users`
   - set the auth settings on the remote project: Site URL = the Vercel URL, redirect URLs, SMTP, hook, templates and Turnstile
3. **Import (phase 6)** into the remote project, from the dump file and `api/uploads/`.
4. **Check on the Vercel URL:** sign in as an imported customer, place an order (guest and customer), reset a password, and edit content in the admin as an editor.
5. **Done when:** the new site runs on its own domain, the checks pass, and the original site still works unchanged.

## Verification (whole project)

- **Database:** `supabase test db` (pgTAP) covering every RLS row, `place_order`, the status trigger, `get_page` and the section schema checks, in CI on every push.
- **Site:** `npm test` (Jest: mappers, route handlers, sanitize), `npm run typecheck`, lint, and the phase 7 browser run.
- **Admin:** Vitest, typecheck, and the phase 8 editor/admin run.
- **Import:** count assertions and spot checks (phase 6); an imported password signs in.
- **Security:** with only the publishable key (curl against PostgREST), as anon and as a customer, try the following. Every one must fail:
  - list orders and profiles
  - update your own `role`
  - call `place_order`
  - upload to `media`
  - read a draft page
