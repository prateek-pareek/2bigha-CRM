# Handoff: 2Bigha CRM → Hostinger VPS deployment

Session summary for continuing this deployment with another tool/assistant.
Everything below is already merged into `main` (commit `7f4f228`) on
`github.com/prateek-pareek/2bigha-CRM`. This file is the map; **`DEPLOY.md`**
in the repo root is the actual step-by-step guide — read that next.

## What's done

- Local dev verified working: API (NestJS, port 4000) and portal (Next.js,
  port 3000) both build and run natively against dockerized Mongo/Redis.
- Both production Docker images build clean: `myapp_backend` (2.42GB),
  `myapp_frontend` (532MB).
- Fixed 3 real bugs that would have broken the VPS build:
  1. `docker-compose.yml` had Traefik *labels* but no Traefik *service* —
     nothing was actually serving/TLS-terminating the containers. Added it.
  2. Frontend Docker build context was `./portal`, but `portal/package.json`
     links the shared UI kit as `file:../packages/ui` — outside that
     context. Moved the build to the repo root (`docker-compose.yml` +
     `portal/Dockerfile`).
  3. `next build` runs `tsc`, which resolved that same symlink to its real
     path and looked for `react`/`@radix-ui/*` under `packages/ui`, where
     nothing is installed by design. Fixed with `preserveSymlinks: true` in
     `portal/tsconfig.json`. (Do NOT "fix" this by running `npm install`
     inside `packages/ui` — that creates a duplicate `@types/react` and
     breaks the build a different way.)
- Fixed a real security hole: `POST /api/auth/register` had no guard, and
  registering `ceo@mathionix.com` granted automatic super-admin
  (`api/src/auth/platform-super-admin.util.ts`) — anyone reaching a public
  deploy could have taken over the CRM. Now guarded
  (`api/src/auth/register.guard.ts`): open only until the DB has zero users
  (bootstrap), admin-JWT-required after that. Verified: unauthenticated →
  401, non-admin JWT → 403, admin JWT → 201. Also stopped the response from
  leaking the bcrypt password hash, and restricted CORS to `FRONTEND_URL`.
- `MONGO_URI` / `MONGO_URI_CRM` / `MONGO_URI_PM` are now env-driven (were
  hardcoded to the bundled `mongodb` container). Added
  `docker-compose.external-db.yml` for pointing at **Hostinger's managed
  MongoDB** instead — this is the DB the user intends to use in production.
- `JWT_SECRET` was hardcoded to `supersecret` in `docker-compose.yml` — now
  required from `.env`.
- `init.ps1` used to run `docker-compose down -v`, which deletes the
  production Mongo volume. Removed.
- Added `.env.example` (full list of every env var the stack needs, with
  which ones are required vs optional), `portal/.env.local.example` (was
  referenced by the README but never committed — `portal/.gitignore`'s
  `.env*` rule was silently blocking it, fixed), and a root `.dockerignore`.
- Added `.github/workflows/deploy.yml`: builds both images on GitHub's
  runners, pushes to GHCR, SSHes into the VPS to pull + restart. Triggers on
  push to `main`.

## What's NOT done yet

1. **Nothing is running on the actual VPS.** All work above was verified on
   a local dev machine (Docker Desktop, Windows). The VPS itself has not
   been touched.
2. **Domain name (`APP_DOMAIN`) was never provided.** Every URL/label in
   the compose file reads from this env var now — just needs a value in
   `.env` on the VPS. DNS A record must point at the VPS before starting
   Traefik (Let's Encrypt validates over HTTP).
3. **CI/CD secrets are not configured on GitHub yet.** `.github/workflows/deploy.yml`
   exists but does nothing useful until someone with repo admin access adds,
   under Settings → Secrets and variables → Actions:
   - Secrets: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY` (a **dedicated** deploy
     key, not a personal one), `NEXT_PUBLIC_API_URL`
   - Variables: `VPS_DEPLOY_PATH`
   Full instructions: DEPLOY.md §12.
4. **Hostinger managed MongoDB connection string** hasn't been obtained or
   tested yet. When you get it: put it in `.env` as `MONGO_URI=...`, and
   **allow-list the VPS's IP** in the managed DB's firewall/network rules
   first — that's the #1 reason this fails. Then start with:
   ```
   docker compose -f docker-compose.yml -f docker-compose.external-db.yml build
   docker compose -f docker-compose.yml -f docker-compose.external-db.yml up -d
   ```
   (DEPLOY.md §6a has the full walkthrough.)
5. **The register-guard's "bootstrap" path (zero users → open registration)
   was not tested against a genuinely empty database** — only tested against
   a dev DB that already had test users, which exercises the "locked" path.
   Worth a clean-DB smoke test before relying on it in production.
6. `api/src/users/dto/create-user.dto.ts` still hardcodes `@mathionix.com`
   as the only allowed signup email domain, and
   `platform-super-admin.util.ts` still hardcodes `ceo@mathionix.com` as the
   super-admin address. Not touched — flagged only. If this CRM gets
   rebranded away from "2Bigha/Mathionix", both files need editing, not just
   UI strings.

## Quick start for whoever picks this up

```bash
git clone https://github.com/prateek-pareek/2bigha-CRM.git
cd 2bigha-CRM
cp .env.example .env
# fill in APP_DOMAIN, ACME_EMAIL, JWT_SECRET, NEXT_PUBLIC_API_URL(+friends),
# and MONGO_URI (Hostinger managed DB connection string)
```
Then follow `DEPLOY.md` starting at §2 (Docker install) — §0/§1 are sizing
and DNS, which may already be settled. §6a is the Hostinger-managed-DB
variant of the normal §6 build/start steps; use §6a instead of §6 given the
DB choice above. §8 covers creating the first (`ceo@mathionix.com`) account —
do this immediately after first start, since registration is bootstrap-only.

## Local dev environment notes (if continuing dev work, not just deploying)

- Redis for local dev is mapped to **port 6380**, not 6379 — another
  project on this machine (`arco_redis`) already owns 6379. See
  `docker-compose.dev.yml` and `api/.env`'s `REDIS_URL`.
- `docker-compose.dev.yml` publishes Mongo/Redis to `127.0.0.1` for running
  the API/portal natively (`npm run dev`) — the base `docker-compose.yml`
  deliberately does not publish those ports (production security).
- Git push required switching GitHub accounts mid-session: `prashant231203`
  had repo write access but not the `workflow` OAuth scope (needed because
  this push included `.github/workflows/deploy.yml`); `prashantMathionix`
  had the `workflow` scope but not repo access. Resolved via
  `gh auth refresh -s workflow` on `prashant231203`. If GitHub pushes start
  failing with "refusing to allow an OAuth App to create or update
  workflow", this is why — re-run that refresh command.
