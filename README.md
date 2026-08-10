# Mathionix CRM (standalone copy)

Standalone CRM product extracted from **Mathionix-internal**.

This folder is a **copy only** — nothing was removed from `Mathionix-internal`.
Use this repo to build / rebrand another CRM product without touching the suite monorepo.

## What was copied

| Area | Path in this repo | Source in Mathionix-internal |
|------|-------------------|------------------------------|
| CRM API module | `api/src/crm/` | `api-hrms/src/crm/` |
| API shared infra | `api/src/common/` | `api-hrms/src/common/` |
| CRM routes (Next.js) | `portal/src/app/crm/` | `portal/src/app/crm/` |
| CRM product UI/lib | `portal/src/portals/crm/` | `portal/src/portals/crm/` |
| Shared portal chrome | `portal/src/common/` | `portal/src/common/` |
| UI kit | `packages/ui/` | `packages/ui/` |

Snapshot metadata: `_from-internal/COPIED_AT_UTC.txt`

## Structure

```
Mathionix-crm/
├── api/src/crm/              # Nest CRM module (records, inbox, pipelines, …)
├── api/src/common/           # Auth, users, redis, mail (CRM dependencies)
├── portal/src/app/crm/       # Next.js App Router screens
├── portal/src/portals/crm/   # CRM components / lib / hooks
├── portal/src/common/        # Shared shell / permissions / utils
├── packages/ui/              # @mathionix/ui kit
└── _from-internal/           # Docs + package.json snapshots from the suite
```

## Important

- **Original suite is unchanged** — keep developing Mathionix-internal as usual.
- This copy does **not** auto-sync. Re-copy when you want a fresh snapshot.
- To re-sync from the suite (from Mathionix-internal root):

```bash
# Example re-sync (destructive to CRM folders in Mathionix-crm only)
rsync -a --delete ../Mathionix-internal/api-hrms/src/crm/ ./api/src/crm/
rsync -a --delete ../Mathionix-internal/portal/src/app/crm/ ./portal/src/app/crm/
rsync -a --delete ../Mathionix-internal/portal/src/portals/crm/ ./portal/src/portals/crm/
```

## Making it “another CRM”

1. Rename product branding in portal shell / CSS tokens.
2. Point `NEXT_PUBLIC_CRM_API_URL` / `CRM_API_URL` at this API.
3. Use a **separate Mongo database** (`MONGO_URI` / `MONGO_URI_CRM`) from the suite.
4. Trim unused CRM modules under `api/src/crm/` and `portal/src/app/crm/` as needed.
5. Nest `app.module.ts` imports CRM + auth/users/common only (HRMS / PM modules removed).

## What’s intentionally not here

- HRMS (employees, payroll, leaves, LMS, …)
- PM (projects, issues, wiki, boards)
- Social / Executive / Vault product apps
- Suite `nboard` / other non-CRM portals

## Quick start (existing scripts)

```bash
./init.sh
cp api/.env.example api/.env
cp portal/.env.local.example portal/.env.local
npm run db:up
npm run dev
```

- Portal: http://localhost:3000 → `/crm`
- API: http://localhost:4000/api

## Notes

- Prefer `portal/src/portals/crm/…` for new UI (not legacy `components/crm` trees).
- Custom objects + associations v2 live under `api/src/crm/custom-objects` and `api/src/crm/associations`.
- Full module map: `_from-internal/CRM-SEPARATION.md`
