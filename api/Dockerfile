# syntax=docker/dockerfile:1

# The production image: the API, with the admin app it serves at /admin.
#
#   docker build -t simplefood-api .
#   scripts/docker-smoke.sh simplefood-api    # starts it with Postgres, checks it
#
# CI builds it for linux/amd64 (the VPS) and publishes it to GHCR. The
# container takes its settings from the environment (src/config/env.validation.ts);
# no .env file is ever copied in (.dockerignore is an allow-list).

# The Node of .nvmrc, pinned to a release so a rebuild gives the same image.
# Every stage starts from this one line; Dependabot proposes the bumps.
FROM node:24.22.3-alpine3.24 AS base

# ---- The API: `nest build`, so the Swagger plugin runs (src -> dist)
FROM base AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund
COPY nest-cli.json tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# ---- The admin app: a static bundle (admin/dist)
FROM base AS admin
WORKDIR /app/admin
COPY admin/package.json admin/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund
COPY admin/index.html admin/tsconfig.json admin/vite.config.ts ./
COPY admin/public ./public
COPY admin/src ./src
# The site's address, baked into the bundle for the "Open on the site" links.
ARG VITE_SITE_URL=https://simplefood.kozyr.info
RUN npm run build

# ---- Production dependencies only: no compilers, test tools or pino-pretty
FROM base AS deps
WORKDIR /app
RUN --mount=type=cache,target=/root/.npm \
    --mount=type=bind,source=package.json,target=package.json \
    --mount=type=bind,source=package-lock.json,target=package-lock.json \
    npm ci --omit=dev --no-audit --no-fund
# Half of node_modules that Node never loads here: type definitions, source
# maps, TypeORM's browser build, and TypeScript with ts-node (optional peers,
# used only by the Swagger compiler plugin and TypeORM's .ts CLI).
# scripts/docker-smoke.sh checks the app still boots, migrates and serves.
RUN find node_modules -type f \
        \( -name '*.d.ts' -o -name '*.d.mts' -o -name '*.d.cts' -o -name '*.map' \) -delete \
    && rm -rf node_modules/typeorm/browser node_modules/typescript node_modules/ts-node

# ---- Runtime
FROM base AS runtime

# The app runs with plain `node`: npm, yarn and corepack only widen what an
# attacker could use, and what a scanner reports.
RUN rm -rf /usr/local/lib/node_modules /opt/yarn-* \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
    /usr/local/bin/yarn /usr/local/bin/yarnpkg

WORKDIR /app
# NO_COLOR: errors before the JSON logger is up (bad config) are printed by
# Nest's console logger; without colour codes they read cleanly in the logs.
ENV NODE_ENV=production \
    NODE_OPTIONS=--enable-source-maps \
    NO_COLOR=1 \
    PORT=1339 \
    UPLOADS_DIR=/app/uploads \
    ADMIN_DIST_DIR=/app/admin/dist

# Owned by root, so the app (user node) can read its code but not change it.
# package.json: the API docs read the version from it.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=admin /app/admin/dist ./admin/dist
COPY package.json ./

# The one folder the app writes. Mount a volume here, or uploads die with the
# container; a new named volume takes this folder's owner (node).
RUN mkdir uploads && chown node:node uploads

USER node
EXPOSE 1339

# Every 30 s; every 2 s while starting, so `depends_on: service_healthy` and
# the deploy don't wait long. The probe's own timeout (2 s) is below Docker's.
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --start-interval=2s --retries=3 \
    CMD ["node", "dist/healthcheck.js"]

# Exec form, never `npm start`: SIGTERM must reach Node so the shutdown hooks
# close the database pool. Run with `init: true` (or `docker run --init`) so
# a PID 1 that forwards signals and reaps zombies sits in front of Node.
CMD ["node", "dist/main.js"]
