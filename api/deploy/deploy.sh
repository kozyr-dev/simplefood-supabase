#!/usr/bin/env bash
# Deploys one API image on the VPS, from the folder that holds compose.yaml,
# .env and api.env (/opt/simplefood-api):
#
#   ./deploy.sh <image> [<registry user>]
#   ./deploy.sh ghcr.io/<owner>/simplefood-api:<commit SHA>
#
# 1. Pulls the image. With a registry user, the token comes on stdin (CI's
#    deploy job) and the login ends with the script.
# 2. Starts Postgres if it isn't running and applies the migrations with the
#    new image. If they fail, it stops there: the running API is untouched.
# 3. Replaces the API container and waits for it to turn healthy. If it
#    doesn't, it starts the previous image again and fails.
# 4. Records the image in .env (a plain `docker compose up -d` then runs the
#    same one) and removes older versions, keeping the one it replaced.
#
# Going back to an earlier version: ./deploy.sh <its image>. Its migrations
# are already applied; reverting one is a separate, deliberate step.
set -euo pipefail
cd "$(dirname "$0")"

IMAGE=${1:?usage: deploy.sh <image> [<registry user>]}
REGISTRY_USER=${2:-}

for file in compose.yaml .env api.env; do
  if [ ! -f "$file" ]; then
    echo "Missing $PWD/$file: see deploy/README.md" >&2
    exit 1
  fi
done

# One deploy at a time (flock comes with Linux; skipped where it's missing).
if command -v flock >/dev/null; then
  exec 9>.deploy.lock
  flock -n 9 || {
    echo 'Another deploy is running' >&2
    exit 1
  }
fi

# The image the API runs now: empty before the first deploy.
PREVIOUS=$(sed -n 's/^API_IMAGE=//p' .env)

if [ -n "$REGISTRY_USER" ]; then
  REGISTRY=${IMAGE%%/*}
  docker login "$REGISTRY" --username "$REGISTRY_USER" --password-stdin >/dev/null
  trap 'docker logout "$REGISTRY" >/dev/null' EXIT
fi

echo "==> Pulling $IMAGE"
docker pull --quiet "$IMAGE" >/dev/null

# The new image for the commands below only; .env changes once it runs.
export API_IMAGE=$IMAGE

echo '==> Database and migrations'
docker compose up --detach --wait postgres
docker compose run --rm migrate

echo '==> API'
if ! docker compose up --detach --wait --wait-timeout 90 api; then
  echo "The new API didn't turn healthy. Its last log lines:" >&2
  docker compose logs --no-log-prefix --tail 30 api >&2 || true
  if [ -n "$PREVIOUS" ]; then
    echo "==> Starting the previous image again: $PREVIOUS" >&2
    API_IMAGE=$PREVIOUS docker compose up --detach --wait --wait-timeout 90 api
  fi
  exit 1
fi

if grep -q '^API_IMAGE=' .env; then
  sed -i.bak "s|^API_IMAGE=.*|API_IMAGE=$IMAGE|" .env
  rm -f .env.bak
else
  printf 'API_IMAGE=%s\n' "$IMAGE" >>.env
fi

# Keep this image and the one it replaced; older ones can be pulled again.
docker image ls "${IMAGE%:*}" --format '{{.Repository}}:{{.Tag}}' |
  while read -r old; do
    if [ "$old" != "$IMAGE" ] && [ "$old" != "$PREVIOUS" ]; then
      docker image rm "$old" >/dev/null 2>&1 || true
    fi
  done

echo "==> Deployed $IMAGE"
