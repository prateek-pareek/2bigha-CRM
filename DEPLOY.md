# Deploying 2Bigha CRM to a Hostinger VPS

Target: Ubuntu 22.04/24.04 VPS with root SSH. The whole stack runs in Docker —
Traefik (TLS) → Next.js frontend + NestJS backend → MongoDB + Redis.

> Shared/web hosting **cannot** run this. It needs long-running Node processes,
> MongoDB and Docker. A VPS is required.

## 0. Sizing

| Resource | Minimum | Comfortable |
|---|---|---|
| RAM | 4 GB | 8 GB |
| vCPU | 2 | 4 |
| Disk | 40 GB | 80 GB |

4 GB is a hard floor: the Next.js build alone peaks around 2–3 GB. If you are on
2 GB, build the images elsewhere and push them to a registry instead of building
on the VPS (see §7).

## 1. DNS first

Point an A record at the VPS **before** starting Traefik — Let's Encrypt
validates over HTTP and will fail (and rate-limit you) otherwise.

```
crm.yourdomain.com.  A  <VPS_IPV4>
```

Verify from your laptop: `dig +short crm.yourdomain.com`

## 2. Install Docker

```bash
ssh root@<VPS_IP>
curl -fsSL https://get.docker.com | sh
docker --version && docker compose version
```

## 3. Free ports 80/443

Hostinger images often ship with Apache or nginx already bound to :80.

```bash
ss -tlnp | grep -E ':80|:443'
systemctl disable --now apache2 nginx 2>/dev/null || true
```

## 4. Clone and configure

```bash
mkdir -p /opt && cd /opt
git clone https://github.com/prateek-pareek/2bigha-CRM.git
cd 2bigha-CRM
cp .env.example .env
```

Edit `.env`. The required values:

```bash
APP_DOMAIN=crm.yourdomain.com
ACME_EMAIL=you@yourdomain.com
JWT_SECRET=<paste output of: openssl rand -base64 48>

NEXT_PUBLIC_API_URL=https://crm.yourdomain.com
PUBLIC_API_URL=https://crm.yourdomain.com
TRACKING_BASE_URL=https://crm.yourdomain.com
CRM_OAUTH_PUBLIC_URL=https://crm.yourdomain.com
FRONTEND_URL=https://crm.yourdomain.com
```

`NEXT_PUBLIC_API_URL` is compiled into the browser bundle at image build time.
Changing it later requires `docker compose build frontend`, not just a restart.

## 5. Firewall

```bash
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw --force enable
```

Do **not** open 27017 or 6379. Mongo and Redis are reachable only on the
internal Docker network; the compose file deliberately never publishes them.

## 6. Build and start

```bash
docker compose build          # 10-20 min on first run
docker compose up -d
docker compose ps
docker compose logs -f traefik   # watch the certificate get issued
```

Then open `https://crm.yourdomain.com`.

### 5a. Already running Traefik for other apps on this VPS?

If port 80/443 is already bound by another Traefik container (common if this
VPS hosts more than one project), our bundled `traefik` service will fail to
start with `address already in use`. Don't free the port — use the existing
Traefik instead:

```bash
docker compose -f docker-compose.yml -f docker-compose.shared-traefik.yml build
docker compose -f docker-compose.yml -f docker-compose.shared-traefik.yml up -d
```

See the comments in `docker-compose.shared-traefik.yml` for exactly what this
changes (only this project's own containers — nothing about the existing
Traefik or any other app on the box). It assumes the existing Traefik uses a
Docker network named `traefik_network` and a cert resolver named
`letsencrypt` — check `docker network ls` and that Traefik's own compose file
if yours differs, and adjust the override file's network name and this
repo's `tls.certresolver` labels in `docker-compose.yml` to match.

`.github/workflows/deploy.yml` already passes this override on every CI
deploy, so once set up once this is automatic.

### 6a. Using Hostinger's managed MongoDB instead of the bundled container

If you're pointing this at a Hostinger MongoDB database (or any external/managed
Mongo — Atlas included) rather than the `mongodb` container this compose file
ships with:

1. In hPanel, grab the connection string for the managed database. It looks
   like `mongodb://user:pass@<host>:<port>/<db>?authSource=admin` (Hostinger's
   own hostname, not `mongodb://mongodb:27017/...` — that only resolves inside
   this compose project's private network).
2. Put it in `.env` as `MONGO_URI=` (see the **Database** block in
   `.env.example`). Leave `MONGO_URI_CRM` / `MONGO_URI_PM` unset — they default
   to `MONGO_URI`.
3. **Allow this VPS's IP** in the managed database's network/firewall rules —
   Hostinger's managed Mongo (like most managed databases) rejects connections
   from IPs that aren't allow-listed. This is the single most common reason
   the backend fails to start against a managed DB.
4. Start with the external-db override instead of the plain compose file —
   this skips launching the bundled `mongodb` container entirely:
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.external-db.yml build
   docker compose -f docker-compose.yml -f docker-compose.external-db.yml up -d
   ```
5. Verify: `docker compose logs backend | grep -i mongo` should say it
   connected, not show connection-refused/timeout retries.

`myapp_mongodb_data` (the bundled container's volume) simply won't be created
in this mode — nothing to clean up.

## 7. Low-RAM alternative

If the VPS has under 4 GB, build on your laptop and ship the images:

```bash
# laptop
docker compose build
docker save myapp_frontend:latest myapp_backend:latest | gzip > images.tgz
scp images.tgz root@<VPS_IP>:/opt/2bigha-CRM/
# VPS
gunzip -c images.tgz | docker load
docker compose up -d --no-build
```

## 8. Create the first account

Registration is currently **open and unauthenticated** — read §10 before you
leave the box exposed.

```bash
curl -X POST https://crm.yourdomain.com/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"ceo@mathionix.com","password":"<a strong password>","firstName":"Owner","lastName":"Admin"}'
```

Two constraints are hardcoded in the API today:

- `api/src/users/dto/create-user.dto.ts` rejects any address that is not
  `@mathionix.com`.
- `api/src/auth/platform-super-admin.util.ts` grants full super-admin to exactly
  `ceo@mathionix.com`, whatever role is stored.

So the first admin **must** be `ceo@mathionix.com` until you change those files.

Log in at `https://crm.yourdomain.com/auth/login`.

## 9. Updating

```bash
cd /opt/2bigha-CRM
git pull
docker compose build
docker compose up -d
```

Data lives in the named volumes `myapp_mongodb_data` and `myapp_uploads_data`
and survives this. **Never** run `docker compose down -v` — it deletes them.

## 10. Before you expose this publicly

Fixed already, on this branch:

1. ~~`POST /api/auth/register` has no guard.~~ Now guarded (`register.guard.ts`):
   open only until the first account exists, admin-only after that.
2. ~~`/api/auth/register` echoes back the bcrypt password hash.~~ Fixed —
   the response strips `password` before returning.
3. ~~CORS is wide open.~~ `api/src/main.ts` now restricts it to `FRONTEND_URL`.
4. ~~`JWT_SECRET` hardcoded to `supersecret`.~~ `docker-compose.yml` now
   requires it from `.env`.

Still on you:

5. **Claim `ceo@mathionix.com` immediately** (§8). It is still the one address
   that gets automatic super-admin (`platform-super-admin.util.ts`) — since
   registration is now bootstrap-only, this just means: don't delay running
   the curl command in §8 after first deploy.

## 11. Backups

```bash
# dump
docker exec mathionix-mongodb mongodump --archive=/tmp/crm.gz --gzip
docker cp mathionix-mongodb:/tmp/crm.gz ./crm-$(date +%F).gz
# uploaded files
docker run --rm -v myapp_uploads_data:/u -v "$PWD":/b alpine \
  tar czf /b/uploads-$(date +%F).tgz -C /u .
```

Copy both off the VPS. Put them on a cron.

## 12. CI/CD (GitHub Actions)

`.github/workflows/deploy.yml` builds both images on GitHub's runners, pushes
them to GHCR, then SSHes into the VPS to pull and restart — nothing gets built
on the VPS itself once this is set up. Runs on every push to `main`.

One-time setup, all under the repo's **Settings → Secrets and variables →
Actions**:

**Secrets:**
| Name | Value |
|---|---|
| `VPS_HOST` | VPS IPv4 or hostname |
| `VPS_USER` | SSH user (`root`, or a user in the `docker` group) |
| `VPS_SSH_KEY` | private key matching a public key in the VPS's `~/.ssh/authorized_keys` — generate a **dedicated** deploy key: `ssh-keygen -t ed25519 -f deploy_key -N ""`, then `ssh-copy-id -i deploy_key.pub user@vps` |
| `NEXT_PUBLIC_API_URL` | e.g. `https://crm.yourdomain.com` — must match `.env` on the VPS, since this gets baked into the frontend bundle at build time |

**Variables** (same page, not secret):
| Name | Value |
|---|---|
| `VPS_DEPLOY_PATH` | e.g. `/opt/2bigha-CRM` — where you `git clone`d in §4 |

The VPS's own `.env` (JWT_SECRET, MONGO_URI, APP_DOMAIN, …) never passes
through GitHub — the workflow only ships built images and tells the VPS to
pull + restart with the `.env` already sitting there.

First run: push to `main` (or trigger manually from the Actions tab —
`workflow_dispatch` is enabled), then watch **Actions** in GitHub. If the SSH
step fails with permission denied, the deploy key likely isn't in
`authorized_keys` for `VPS_USER`, or the VPS's `docker` group doesn't include
that user (`usermod -aG docker $VPS_USER`, then re-login).

## Troubleshooting

**Certificate never issues** — DNS not propagated, or :80 blocked/occupied.
`docker compose logs traefik | grep -i acme`.

**Frontend calls `http://localhost:4000`** — `NEXT_PUBLIC_API_URL` was wrong at
build time. Fix `.env`, then `docker compose build frontend && docker compose up -d`.

**Build killed / OOM** — see §7, or add swap:
`fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile`

**Mongo restart loop** — the compose file caps it at 1.5 GB with a 0.5 GB
WiredTiger cache. Check `docker compose logs mongodb` for OOM kills.
