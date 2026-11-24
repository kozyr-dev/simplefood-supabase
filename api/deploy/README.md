# Production deployment

The VPS runs Postgres and the API with Docker Compose in `/opt/simplefood-api`. nginx (Hestia) proxies `api-simplefood.kozyr.info` to `127.0.0.1:1339`. CI publishes the image to GHCR, and the `deploy` job in [ci.yml](../.github/workflows/ci.yml) runs [deploy.sh](deploy.sh) on the VPS for every push to `main`.

| File                           | Where                    | What                                                                                           |
| ------------------------------ | ------------------------ | ---------------------------------------------------------------------------------------------- |
| [compose.yaml](compose.yaml)   | git → VPS (CI copies it) | Postgres, the API, and the one-off `migrate`                                                   |
| [deploy.sh](deploy.sh)         | git → VPS (CI copies it) | pull, migrate, replace the API, wait for healthy (back to the previous image if it isn't)      |
| [disk-alert.sh](disk-alert.sh) | git → VPS (CI copies it) | hourly by cron: emails the shop's inbox when a disk is over 85% full (below)                   |
| `.env`                         | VPS only (`chmod 600`)   | for Compose: `POSTGRES_PASSWORD`, `API_IMAGE` (written by deploy.sh). [Template](.env.example) |
| `api.env`                      | VPS only (`chmod 600`)   | the API's settings. [Template](api.env.example)                                                |
| [nginx/](nginx)                | git → VPS (by hand)      | Hestia proxy templates for the site and the API domain (below)                                 |

## One-time setup

On the VPS, as root:

```bash
install -d -m 700 /opt/simplefood-api && cd /opt/simplefood-api
# compose.yaml, deploy.sh, .env.example and api.env.example from this folder:
#   scp deploy/{compose.yaml,deploy.sh,.env.example,api.env.example} root@<vps>:/opt/simplefood-api/
mv .env.example .env && mv api.env.example api.env && chmod 600 .env api.env
sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 32)|" .env
sed -i "s|^JWT_ACCESS_SECRET=.*|JWT_ACCESS_SECRET=$(openssl rand -base64 48)|" api.env
nano api.env    # SMTP_USER, SMTP_PASSWORD (Mailgun), MAIL_NOTIFY_TO
```

Then, in the GitHub repository's settings:

- **Secrets** (Settings → Secrets and variables → Actions):
  - `VPS_HOST`: `72.61.180.80`
  - `VPS_USER`: `root`
  - `VPS_SSH_KEY`: a private key without a passphrase, whose public half is in root's `~/.ssh/authorized_keys`. Paste the whole file, `BEGIN` and `END` lines included.
  - `VPS_KNOWN_HOSTS`: the server's host key, so the job talks to this server only. Take the output of `ssh-keyscan -t ed25519 72.61.180.80` and check its fingerprint against `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` on the VPS.
- **Variable** `DEPLOY_ENABLED` = `true`: the deploy job runs only when it is set.

The job logs in to GHCR on the VPS with its own short-lived token for each pull, so the VPS keeps no registry password, even for a private image.

## nginx (Hestia proxy templates)

Hestia writes each domain's nginx config from a proxy template, so the changes live in templates, not in the generated files (which Hestia overwrites). [nginx/](nginx) holds them; install by copying them to `/usr/local/hestia/data/templates/web/nginx/` (root, `644`):

- **`simplefood-api-nest-proxy`** for `api-simplefood.kozyr.info`: HTTPS proxies to `127.0.0.1:1339` with `Host`, `X-Forwarded-For` (replaced with the client's address, for `TRUST_PROXY_HOPS=1`) and `X-Forwarded-Proto`, and an 11 MB body limit. HTTP redirects to HTTPS, except the Let's Encrypt challenge.
- **`simplefood-nest-proxy`** for `simplefood.kozyr.info`: everything to Next.js on `127.0.0.1:3000`, its own `/api/auth/*` included; old `/uploads/…` links redirect (301) to the API's domain.

Switching a domain to its template (Hestia regenerates the config and reloads nginx):

```bash
v-change-web-domain-proxy-tpl dev api-simplefood.kozyr.info simplefood-api-nest-proxy
v-change-web-domain-proxy-tpl dev simplefood.kozyr.info simplefood-nest-proxy
```

After editing an installed template, rebuild the domain's config: `v-rebuild-web-domain dev <domain>`.

## Monitoring

- **Uptime:** [uptime.yml](../.github/workflows/uptime.yml) checks the API's `/health` (which includes the database), the site's homepage and both certificates from GitHub every 15 minutes. A failed run is the alert: GitHub emails whoever last changed its cron line. In a public repository, GitHub disables schedules after 60 days without a commit; turn the workflow back on in the Actions tab. Run it by hand there too (Run workflow).
- **Disk space:** [disk-alert.sh](disk-alert.sh) emails `MAIL_NOTIFY_TO` through the API's SMTP login (both from `api.env`) when a disk is over 85% full, then at most once a day while it stays that way. Once, as root:

  ```bash
  printf '%s\n' '17 * * * * root bash /opt/simplefood-api/disk-alert.sh 2>&1 | logger -t disk-alert' > /etc/cron.d/simplefood-disk-alert
  bash /opt/simplefood-api/disk-alert.sh 1    # a test: any disk over 1% sends the email now
  rm /var/lib/simplefood-disk-alert/last-sent # so the real check isn't held back a day
  ```

  Its runs are in the system log: `journalctl -t disk-alert`.

- **Logs:** Docker keeps the last 5 × 10 MB of each container's log (`compose.yaml`).

## Everyday commands

In `/opt/simplefood-api`:

```bash
docker compose ps                                  # status and health
docker compose logs -f --tail 100 api              # the API's JSON logs
./deploy.sh ghcr.io/<owner>/simplefood-api:<sha>   # deploy, or go back to, a version
docker compose run --rm migrate                    # apply migrations (deploy.sh does it)
docker compose run --rm -it api node dist/users/cli/create-admin.js --email <email> --name <name>
docker compose exec postgres psql -U simplefood    # the database
```

- **Migrations run before the new API starts.** The old API keeps running against the migrated database for a few seconds, so a migration must not break it: add things first, remove them in a later release.
- **Data** lives in the volumes `simplefood-api_postgres-data` and `simplefood-api_uploads`. `docker compose down` keeps them; `down -v` deletes them.
- **Restarts:** both services have `restart: unless-stopped`, so they come back after a reboot or crash.
