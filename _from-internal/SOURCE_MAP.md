# CRM extract — source map

Copied from Mathionix-internal into Mathionix-crm (sibling folder).

## Included

### Backend
- `api-hrms/src/crm/**` → `api/src/crm/**`
- `api-hrms/src/common/**` → `api/src/common/**` (auth, users, redis, mail, pagination, …)

### Frontend
- `portal/src/app/crm/**` → `portal/src/app/crm/**`
- `portal/src/portals/crm/**` → `portal/src/portals/crm/**`
- `portal/src/common/**` → `portal/src/common/**`
- `packages/ui/**` → `packages/ui/**`

## Not copied (still only in Mathionix-internal)

- HRMS / PM / Social portals and Nest modules
- `client-portal/` product app
- Suite root `docker-compose` / turbo workspace wiring (Mathionix-crm has its own)

## Next steps to fully isolate the product

1. Point `@mathionix/ui` in portal `package.json` to `file:../packages/ui`
2. Ensure Nest `app.module.ts` imports CRM + common auth only
3. Drop leftover HRMS/PM folders in Mathionix-crm if unused
4. Use a dedicated Mongo DB name for this CRM

## CRM users & RBAC (added)
- API: `api/src/crm-users` (+ `api/src/crm/crm-users`)
- UI: `portal/src/portals/crm/components/platform/{CrmTeamManagement,CrmRolesSettings}.tsx`
- Routes: `/crm/settings/users`, `/crm/settings/roles`
