#!/usr/bin/env bash
# Emails the shop's inbox when a disk on the VPS is fuller than the limit.
# Run hourly by cron (deploy/README.md):
#
#   ./disk-alert.sh [<percent>]      # default 85
#
# Sends through the API's SMTP login and to its MAIL_NOTIFY_TO (api.env next
# to this script), at most once a day while a disk stays over the limit.
set -euo pipefail
cd "$(dirname "$0")"

LIMIT=${1:-85}
STATE=/var/lib/simplefood-disk-alert/last-sent
ENV_FILE=api.env

# Filesystems over the limit, as `<use%> <mount point>` lines.
full=$(df -P -x tmpfs -x devtmpfs -x overlay -x squashfs -x efivarfs |
  awk -v limit="$LIMIT" 'NR > 1 { use = $5; sub(/%/, "", use); if (use + 0 > limit) print $5, $6 }')

if [ -z "$full" ]; then
  rm -f "$STATE"
  exit 0
fi

# Already sent in the last 24 hours.
if [ -n "$(find "$STATE" -mmin -1440 2>/dev/null)" ]; then
  exit 0
fi

# A value from api.env (KEY=value, the last one wins). Not sourced: it's
# Compose's env file, not a shell script.
setting() {
  sed -n "s/^$1=//p" "$ENV_FILE" | tail -n 1
}

host=$(setting SMTP_HOST)
port=$(setting SMTP_PORT)
secure=$(setting SMTP_SECURE)
from=$(setting MAIL_FROM)
to=$(setting MAIL_NOTIFY_TO)
if [ -z "$host" ] || [ -z "$from" ] || [ -z "$to" ]; then
  echo "SMTP_HOST, MAIL_FROM or MAIL_NOTIFY_TO missing in $PWD/$ENV_FILE" >&2
  exit 1
fi
if [ "$secure" = true ]; then
  url="smtps://$host:${port:-465}"
else
  url="smtp://$host:${port:-587}"
fi

# The login goes to curl in a config file, never on its command line (ps).
config=$(mktemp)
trap 'rm -f "$config"' EXIT
user=$(setting SMTP_USER)
if [ -n "$user" ]; then
  login="$user:$(setting SMTP_PASSWORD)"
  printf 'user = "%s"\n' "$(printf '%s' "$login" | sed 's/[\\"]/\\&/g')" > "$config"
fi

server=$(hostname)
curl --silent --show-error --max-time 60 --config "$config" \
  --url "$url" --ssl-reqd --crlf --mail-from "$from" --mail-rcpt "$to" \
  --upload-file - <<EOF
From: SimpleFood server <$from>
To: $to
Subject: Disk space low on $server
Date: $(date -R)

Over ${LIMIT}% full on $server:

$full

All disks:

$(df -hP -x tmpfs -x devtmpfs -x overlay -x squashfs -x efivarfs)

Usually Docker: \`docker system df\` shows what it holds, and
\`docker image prune\` removes unused images.

The next reminder comes in 24 hours if it stays like this.
EOF

mkdir -p "$(dirname "$STATE")"
touch "$STATE"
echo "Sent a disk space alert: $(printf '%s' "$full" | tr '\n' ' ')"
