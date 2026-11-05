# Agent instructions (2Bigha-internal)

Use these so any AI or engineer keeps the **same structure**.

## Always follow

1. **Cursor rules** in [`.cursor/rules/`](.cursor/rules/) (auto-attached in Cursor):
   - `mathionix-structure.mdc` — monorepo map + hard boundaries
   - `portal-frontend.mdc` — when editing `portal/**`
   - `api-backend.mdc` — when editing `api-hrms/**`

2. **Human docs** (source of truth for folder maps):
   - [portal/src/PORTALS.md](portal/src/PORTALS.md)
   - [portal/src/common/README.md](portal/src/common/README.md)
   - [api-hrms/src/SEPARATION.md](api-hrms/src/SEPARATION.md)
   - [packages/ui/README.md](packages/ui/README.md)

## Quick checklist before shipping

- [ ] New FE code under `portal/src/portals/<product>/<module>/` (not flat `lib/*.ts`)
- [ ] Shared UI via `@mathionix/ui` or `portal/src/common/` — no cross-portal imports
- [ ] Centralized UI colors: Use semantic tokens from `globals.css` (@theme) — no hardcoded hex or raw color scales
- [ ] New BE schemas under `api-hrms/src/<product>/<module>/schemas/`
- [ ] No HTTP route / permission / collection renames unless FE + BE updated together
- [ ] `cd portal && npm run check:boundaries`
- [ ] API: `cd api-hrms && npm run build` when Nest modules change

## Out of scope

Industry packs / per-vertical CRM forks were removed — do not reintroduce them.
