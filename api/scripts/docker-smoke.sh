#!/usr/bin/env bash
# Smoke test of the production image: starts it next to a throwaway Postgres
# and checks what the unit and e2e tests can't see, i.e. the image itself:
# its contents and user, config validation, migrations from dist/, the native
# modules (bcrypt, sharp) on this platform, the admin app, health checks,
# JSON logs and a fast `docker stop`.
#
#   scripts/docker-smoke.sh <image>        e.g. simplefood-api:local
#
# Needs Docker, curl and jq. Leaves nothing behind (containers, network and
# temp files are removed on exit, failed or not). Runs in CI (.github/workflows/ci.yml).
# Functions run through trap and check(), which ShellCheck can't follow.
# shellcheck disable=SC2317,SC2329
set -euo pipefail

IMAGE=${1:?usage: scripts/docker-smoke.sh <image>}
RUN_ID="smoke-$$"
NET="$RUN_ID-net"
PG="$RUN_ID-pg"
API="$RUN_ID-api"
WORK=$(mktemp -d)
FAILED=0

cleanup() {
  docker rm -f "$API" "$PG" "$RUN_ID-badconfig" >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

pass() { printf '  ok    %s\n' "$1"; }
fail() {
  printf '  FAIL  %s\n' "$1"
  FAILED=1
}
# check "<what>" <command...>: one line per check; the run goes on after a failure.
check() {
  local what=$1
  shift
  if "$@" >/dev/null 2>&1; then pass "$what"; else fail "$what"; fi
}
# Fatal: the checks after this one need it.
need() {
  local what=$1
  shift
  if "$@" >"$WORK/need.log" 2>&1; then
    pass "$what"
  else
    fail "$what"
    cat "$WORK/need.log"
    docker logs "$API" 2>&1 | tail -20 || true
    exit 1
  fi
}
secret() { head -c 36 /dev/urandom | base64 | tr -d '/+=\n'; }

# Waits up to $2 seconds for container $1 to exit; prints its exit code.
wait_exit() {
  for _ in $(seq 1 "$2"); do
    if [ "$(docker inspect -f '{{.State.Running}}' "$1")" = false ]; then
      docker inspect -f '{{.State.ExitCode}}' "$1"
      return 0
    fi
    sleep 1
  done
  return 1
}

# Waits up to $1 seconds for the API container to report healthy.
wait_healthy() {
  local status
  for _ in $(seq 1 "$1"); do
    status=$(docker inspect -f '{{.State.Health.Status}}' "$API")
    [ "$status" = healthy ] && return 0
    [ "$(docker inspect -f '{{.State.Running}}' "$API")" = false ] && return 1
    sleep 1
  done
  return 1
}

echo "Smoke test of $IMAGE"

# ---- The image itself
echo "Image:"
check "runs as node (uid 1000)" \
  test "$(docker run --rm --entrypoint id "$IMAGE" -u)" = 1000
# shellcheck disable=SC2016 # the script runs in the container's shell
check "no sources, .env, dev tools or npm" docker run --rm --entrypoint sh "$IMAGE" -c '
  for p in src test .env node_modules/typescript node_modules/jest \
           node_modules/pino-pretty node_modules/@nestjs/cli; do
    [ -e "$p" ] && exit 1
  done
  ! command -v npm'
check "the app's code is read-only for the app" \
  docker run --rm --entrypoint sh "$IMAGE" -c '! touch dist/main.js'
check "the admin app is built in" \
  docker run --rm --entrypoint test "$IMAGE" -f admin/dist/index.html

# ---- Configuration
DB_PASSWORD=$(secret)
cat >"$WORK/env" <<EOF
DB_HOST=$PG
DB_USER=smoke
DB_PASSWORD=$DB_PASSWORD
DB_NAME=smoke
CORS_ORIGINS=https://simplefood.kozyr.info
JWT_ACCESS_SECRET=$(secret)$(secret)
SMTP_HOST=smtp.invalid
MAIL_FROM=no-reply@example.com
MAIL_NOTIFY_TO=shop@example.com
FRONTEND_URL=https://simplefood.kozyr.info
EOF

echo "Config validation:"
PLACEHOLDER=dev-only-change-me-dev-only-change-me
docker run -d --name "$RUN_ID-badconfig" --env-file "$WORK/env" \
  -e JWT_ACCESS_SECRET="$PLACEHOLDER" "$IMAGE" >/dev/null
code=$(wait_exit "$RUN_ID-badconfig" 30 || echo timeout)
docker logs "$RUN_ID-badconfig" >"$WORK/badconfig.log" 2>&1
check "refuses to start with the .env.example secret (exit $code)" \
  test "$code" != 0 -a "$code" != timeout
check "names the problem" grep -q 'JWT_ACCESS_SECRET.*placeholder' "$WORK/badconfig.log"
check "doesn't print the secret" sh -c "! grep -q '$PLACEHOLDER' '$WORK/badconfig.log'"

# ---- Database and migrations
echo "Database:"
docker network create "$NET" >/dev/null
docker run -d --name "$PG" --network "$NET" \
  -e POSTGRES_USER=smoke -e POSTGRES_PASSWORD="$DB_PASSWORD" -e POSTGRES_DB=smoke \
  postgres:18-alpine >/dev/null
pg_ready() {
  for _ in $(seq 1 60); do
    docker exec "$PG" pg_isready -U smoke -d smoke -h 127.0.0.1 && return 0
    sleep 1
  done
  return 1
}
need "Postgres is up" pg_ready
need "migrations run from the image" docker run --rm --network "$NET" --env-file "$WORK/env" \
  "$IMAGE" node node_modules/typeorm/cli.js migration:run -d dist/database/data-source.js

# ---- The API
echo "API:"
docker run -d --name "$API" --network "$NET" --init --env-file "$WORK/env" \
  -p 127.0.0.1::1339 "$IMAGE" >/dev/null
need "turns healthy" wait_healthy 60
BASE="http://$(docker port "$API" 1339/tcp | head -1)"

status() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
check "GET /health is 200" test "$(status "$BASE/health")" = 200
check "GET /api/products is 200" test "$(status "$BASE/api/products")" = 200
check "an unknown route is a 404 in the error shape" sh -c \
  "curl -s '$BASE/api/no-such-route' | jq -e '.error.status == 404 and (.error.requestId | length > 0)'"
check "GET /admin/ serves the admin app" sh -c \
  "curl -s '$BASE/admin/' | grep -q '<div id=\"root\">'"
check "GET /api/docs is off (SWAGGER_ENABLED unset)" test "$(status "$BASE/api/docs")" = 404

# bcrypt: a staff account from the CLI, then a login with it.
STAFF_EMAIL="smoke-$$@example.com"
STAFF_PASSWORD=$(secret)
need "the staff CLI creates an account" sh -c "printf '%s' '$STAFF_PASSWORD' | docker exec -i '$API' \
  node dist/users/cli/create-admin.js --email '$STAFF_EMAIL' --name Smoke --password-stdin"
TOKEN=$(curl -s -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$STAFF_EMAIL\",\"password\":\"$STAFF_PASSWORD\"}" | jq -r '.data.accessToken // empty' || true)
check "login works (bcrypt)" test -n "$TOKEN"

# sharp: upload an image (made by sharp in the container), then fetch it.
docker exec "$API" node -e "require('sharp')({ create: { width: 900, height: 600,
  channels: 3, background: '#46ba3c' } }).png().toBuffer().then((b) => process.stdout.write(b))" \
  >"$WORK/image.png" || true
UPLOAD_URL=$(curl -s -X POST "$BASE/api/media" -H "Authorization: Bearer $TOKEN" \
  -F "file=@$WORK/image.png;type=image/png" | jq -r '.data.url // empty' || true)
check "an image upload is processed (sharp)" test -n "$UPLOAD_URL"
check "the upload is served from /uploads" sh -c \
  "curl -sI '$BASE$UPLOAD_URL' | grep -qi '^cross-origin-resource-policy: cross-origin'"
check "it lands in the uploads folder, owned by node" docker exec "$API" sh -c \
  "test -n \"\$(find uploads -type f -user node)\""

check "logs are JSON" sh -c "docker logs '$API' 2>&1 | head -1 | jq -e '.level'"

# ---- Health without the database, then shutdown
echo "Failure and shutdown:"
docker stop "$PG" >/dev/null
check "the health probe fails without the database" sh -c \
  "! docker exec '$API' node dist/healthcheck.js"
start=$(date +%s)
docker stop "$API" >/dev/null
seconds=$(($(date +%s) - start))
check "docker stop takes ${seconds}s (under 5: SIGTERM reaches Node)" test "$seconds" -lt 5
check "and logs no crash" sh -c "! docker logs '$API' 2>&1 | grep -q 'Unhandled\\|uncaught'"

if [ "$FAILED" = 0 ]; then echo "All checks passed."; else echo "Some checks failed."; fi
exit "$FAILED"
